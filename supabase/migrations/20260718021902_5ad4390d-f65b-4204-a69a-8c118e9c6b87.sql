
-- 1) Unicidade estrita por (case_id, revision_number)
ALTER TABLE public.checklists
  ADD CONSTRAINT uq_checklists_case_revision UNIQUE (case_id, revision_number);

-- 2) Revisões (revision_number > 1) não podem usar service_stage = 'initial'
ALTER TABLE public.checklists
  ADD CONSTRAINT ck_checklists_stage_not_initial_on_revision
  CHECK (revision_number = 1 OR service_stage <> 'initial');

-- 3) RPC transacional para criar revisão sem copiar dados de resposta
CREATE OR REPLACE FUNCTION public.create_checklist_revision(
  _parent_id uuid,
  _reason text,
  _stage text,
  _notes text DEFAULT NULL
)
RETURNS TABLE (id uuid, revision_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _parent public.checklists;
  _next_rev int;
  _new_id uuid;
  _is_admin boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF _stage NOT IN ('pre_change','post_ont_change','noc_retest','additional_test') THEN
    RAISE EXCEPTION 'invalid_stage_for_revision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _parent FROM public.checklists WHERE id = _parent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT public.has_role(_uid, 'admin'::app_role) INTO _is_admin;
  IF _parent.tecnico_id <> _uid AND NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _parent.status <> 'finalizado' THEN
    RAISE EXCEPTION 'parent_not_finalized' USING ERRCODE = '22023';
  END IF;

  -- Trava lógica por case_id para serializar criação de revisões concorrentes
  PERFORM pg_advisory_xact_lock(hashtextextended(_parent.case_id::text, 0));

  SELECT COALESCE(MAX(revision_number), 0) + 1
    INTO _next_rev
    FROM public.checklists
   WHERE case_id = _parent.case_id;

  UPDATE public.checklists
     SET is_current = false
   WHERE case_id = _parent.case_id
     AND is_current = true;

  INSERT INTO public.checklists (
    tecnico_id, tipo, status,
    os, cliente, cidade, endereco, plano,
    case_id, parent_checklist_id,
    revision_number, revision_reason, revision_notes,
    service_stage, is_current, revised_at, revised_by,
    dados
  ) VALUES (
    _parent.tecnico_id, _parent.tipo, 'rascunho',
    _parent.os, _parent.cliente, _parent.cidade, _parent.endereco, _parent.plano,
    _parent.case_id, _parent.id,
    _next_rev, btrim(_reason), NULLIF(btrim(_notes), ''),
    _stage, true, now(), _uid,
    '{}'::jsonb
  )
  RETURNING checklists.id INTO _new_id;

  UPDATE public.checklists
     SET superseded_by_checklist_id = _new_id
   WHERE id = _parent.id;

  id := _new_id;
  revision_number := _next_rev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_checklist_revision(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checklist_revision(uuid, text, text, text) TO authenticated;
