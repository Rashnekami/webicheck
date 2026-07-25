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
  _case_id uuid;
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

  SELECT c.case_id INTO _case_id
    FROM public.checklists c
   WHERE c.id = _parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_case_id::text, 0));

  SELECT c.* INTO _parent
    FROM public.checklists AS c
   WHERE c.id = _parent_id
   FOR UPDATE;

  IF NOT _parent.is_current THEN
    RAISE EXCEPTION 'parent_not_current' USING ERRCODE = '40001';
  END IF;

  SELECT public.has_role(_uid, 'admin'::public.app_role) INTO _is_admin;
  IF _parent.tecnico_id <> _uid AND NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _parent.status <> 'finalizado' THEN
    RAISE EXCEPTION 'parent_not_finalized' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(c.revision_number), 0) + 1
    INTO _next_rev
    FROM public.checklists c
   WHERE c.case_id = _parent.case_id;

  UPDATE public.checklists AS c
     SET is_current = false
   WHERE c.case_id = _parent.case_id
     AND c.is_current = true;

  INSERT INTO public.checklists (
    tecnico_id, tipo, status,
    os, cliente, cidade, endereco, plano,
    modelo, serial, cto_porta,
    troca_realizada,
    modelo_ont_retirada, serial_ont_retirada,
    modelo_ont_instalada, serial_ont_instalada,
    exchange_ticket_code,
    numero_publico, codigo_validacao,
    data_atendimento, hora_atendimento, finalizado_em,
    case_id, parent_checklist_id,
    revision_number, revision_reason, revision_notes,
    service_stage, is_current, revised_at, revised_by,
    dados
  ) VALUES (
    _parent.tecnico_id, _parent.tipo, 'rascunho',
    _parent.os, _parent.cliente, _parent.cidade, _parent.endereco, _parent.plano,
    _parent.modelo, _parent.serial, _parent.cto_porta,
    _parent.troca_realizada,
    _parent.modelo_ont_retirada, _parent.serial_ont_retirada,
    _parent.modelo_ont_instalada, _parent.serial_ont_instalada,
    _parent.exchange_ticket_code,
    _parent.numero_publico, NULL,
    NULL, NULL, NULL,
    _parent.case_id, _parent.id,
    _next_rev, btrim(_reason), NULLIF(btrim(_notes), ''),
    _stage, true, now(), _uid,
    public.empty_checklist_revision_data(_parent.tipo)
  )
  RETURNING checklists.id INTO _new_id;

  UPDATE public.checklists AS c
     SET superseded_by_checklist_id = _new_id
   WHERE c.id = _parent.id;

  id := _new_id;
  revision_number := _next_rev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_checklist_revision(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checklist_revision(uuid, text, text, text) TO authenticated;