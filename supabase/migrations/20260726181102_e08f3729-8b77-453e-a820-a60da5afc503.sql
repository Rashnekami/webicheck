
-- profiles.supervisor_id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_supervisor_id_idx ON public.profiles(supervisor_id);

-- supervisor_cities
CREATE TABLE IF NOT EXISTS public.supervisor_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supervisor_id, city)
);
CREATE INDEX IF NOT EXISTS supervisor_cities_provider_idx ON public.supervisor_cities(provider_id, city);

GRANT SELECT ON public.supervisor_cities TO authenticated;
GRANT ALL ON public.supervisor_cities TO service_role;
ALTER TABLE public.supervisor_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisor_cities_read ON public.supervisor_cities;
CREATE POLICY supervisor_cities_read ON public.supervisor_cities
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR (has_role(auth.uid(),'admin'::public.app_role) AND provider_id = current_provider_id())
    OR supervisor_id = auth.uid()
  );

-- checklists: campos de revisão
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'nao_aplicavel'
    CHECK (review_status IN ('nao_aplicavel','pendente','aprovado','reprovado')),
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_for_rework boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS checklists_review_status_idx ON public.checklists(provider_id, review_status);

-- Trigger: quando finalizado, marca pendente de revisão
CREATE OR REPLACE FUNCTION public.mark_checklist_pending_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    IF NEW.review_status = 'nao_aplicavel' THEN
      NEW.review_status := 'pendente';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_checklist_pending_review ON public.checklists;
CREATE TRIGGER trg_mark_checklist_pending_review
BEFORE UPDATE ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.mark_checklist_pending_review();

-- Helpers de escopo
CREATE OR REPLACE FUNCTION public.is_supervisor_of(_supervisor uuid, _tecnico uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _tecnico AND p.supervisor_id = _supervisor)
$$;

CREATE OR REPLACE FUNCTION public.supervisor_covers_city(_supervisor uuid, _city text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supervisor_cities sc
    WHERE sc.supervisor_id = _supervisor AND lower(sc.city) = lower(coalesce(_city,''))
  )
$$;

CREATE OR REPLACE FUNCTION public.supervisor_can_see_checklist(_supervisor uuid, _tecnico uuid, _city text, _provider uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_supervisor, 'supervisor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _supervisor AND provider_id = _provider)
    AND (
      public.is_supervisor_of(_supervisor, _tecnico)
      OR public.supervisor_covers_city(_supervisor, _city)
    )
$$;

REVOKE EXECUTE ON FUNCTION public.is_supervisor_of(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisor_covers_city(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisor_can_see_checklist(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_covers_city(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_can_see_checklist(uuid, uuid, text, uuid) TO authenticated;

-- RLS checklists (recriar)
DROP POLICY IF EXISTS checklists_select_own_or_admin ON public.checklists;
CREATE POLICY checklists_select_own_or_admin ON public.checklists
  FOR SELECT TO authenticated
  USING (
    auth.uid() = tecnico_id
    OR public.is_platform_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::public.app_role) AND provider_id = public.current_provider_id())
    OR (public.has_role(auth.uid(),'almoxarifado'::public.app_role) AND provider_id = public.current_provider_id())
    OR (public.has_role(auth.uid(),'noc'::public.app_role) AND provider_id = public.current_provider_id())
    OR public.supervisor_can_see_checklist(auth.uid(), tecnico_id, cidade, provider_id)
  );

DROP POLICY IF EXISTS checklists_update_own_draft ON public.checklists;
CREATE POLICY checklists_update_own_draft ON public.checklists
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = tecnico_id
    AND status = 'rascunho'::public.checklist_status
    AND locked_for_rework = false
  )
  WITH CHECK (auth.uid() = tecnico_id);

-- RPC aprovar/reprovar
CREATE OR REPLACE FUNCTION public.review_checklist(_id uuid, _decision text, _comment text DEFAULT NULL)
RETURNS TABLE(id uuid, review_status text, locked_for_rework boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _c public.checklists; BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _decision NOT IN ('aprovado','reprovado') THEN RAISE EXCEPTION 'invalid_decision' USING ERRCODE='22023'; END IF;
  IF _decision = 'reprovado' AND (_comment IS NULL OR length(btrim(_comment)) < 3) THEN
    RAISE EXCEPTION 'comment_required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _c FROM public.checklists WHERE public.checklists.id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checklist_not_found' USING ERRCODE='P0002'; END IF;
  IF _c.status <> 'finalizado' THEN RAISE EXCEPTION 'not_finalized' USING ERRCODE='22023'; END IF;
  IF NOT _c.is_current THEN RAISE EXCEPTION 'not_current' USING ERRCODE='22023'; END IF;

  IF NOT (
    public.is_platform_admin(_uid)
    OR (public.has_role(_uid,'admin'::public.app_role) AND _c.provider_id = public.current_provider_id())
    OR public.supervisor_can_see_checklist(_uid, _c.tecnico_id, _c.cidade, _c.provider_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.checklists SET
    review_status = _decision,
    review_comment = NULLIF(btrim(_comment),''),
    reviewed_by = _uid,
    reviewed_at = now(),
    locked_for_rework = (_decision = 'reprovado')
  WHERE public.checklists.id = _id;

  id := _id; review_status := _decision; locked_for_rework := (_decision = 'reprovado');
  RETURN NEXT;
END; $$;
REVOKE EXECUTE ON FUNCTION public.review_checklist(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_checklist(uuid,text,text) TO authenticated;

-- Ao criar nova revisão, destrava o pai
CREATE OR REPLACE FUNCTION public.clear_review_on_new_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.parent_checklist_id IS NOT NULL AND NEW.status = 'rascunho' THEN
    UPDATE public.checklists SET locked_for_rework = false WHERE id = NEW.parent_checklist_id;
    NEW.review_status := 'nao_aplicavel';
    NEW.locked_for_rework := false;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_clear_review_on_new_revision ON public.checklists;
CREATE TRIGGER trg_clear_review_on_new_revision
BEFORE INSERT ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.clear_review_on_new_revision();

-- profiles: policies para supervisor e NOC
DROP POLICY IF EXISTS "Supervisor lê perfis do seu escopo" ON public.profiles;
CREATE POLICY "Supervisor lê perfis do seu escopo" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'supervisor'::public.app_role)
    AND (
      supervisor_id = auth.uid()
      OR (city IS NOT NULL AND public.supervisor_covers_city(auth.uid(), city))
      OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Supervisor atualiza perfis do seu escopo" ON public.profiles;
CREATE POLICY "Supervisor atualiza perfis do seu escopo" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'supervisor'::public.app_role)
    AND (
      supervisor_id = auth.uid()
      OR (city IS NOT NULL AND public.supervisor_covers_city(auth.uid(), city))
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "NOC lê perfis do provedor" ON public.profiles;
CREATE POLICY "NOC lê perfis do provedor" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'noc'::public.app_role)
    AND provider_id = public.current_provider_id()
  );

DROP POLICY IF EXISTS provider_login_accounts_select_supervisor ON public.provider_login_accounts;
CREATE POLICY provider_login_accounts_select_supervisor ON public.provider_login_accounts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'supervisor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = provider_login_accounts.user_id
        AND (
          p.supervisor_id = auth.uid()
          OR (p.city IS NOT NULL AND public.supervisor_covers_city(auth.uid(), p.city))
        )
    )
  );
