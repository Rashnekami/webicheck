-- 1. Normalização de nomes de cidade
CREATE OR REPLACE FUNCTION public.norm_city(_city text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(btrim(translate(coalesce(_city,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')))
$$;

-- 2. Territórios
CREATE TABLE IF NOT EXISTS public.city_territories (
  city_key text PRIMARY KEY,
  city_label text NOT NULL,
  territory_code text NOT NULL,
  territory_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.city_territories TO authenticated;
GRANT ALL ON public.city_territories TO service_role;
ALTER TABLE public.city_territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_territories_read ON public.city_territories;
CREATE POLICY city_territories_read ON public.city_territories FOR SELECT TO authenticated USING (true);

INSERT INTO public.city_territories (city_key, city_label, territory_code, territory_name) VALUES
  (public.norm_city('Castro'), 'Castro', 'alex', 'Supervisão Alex'),
  (public.norm_city('Carambeí'), 'Carambeí', 'alex', 'Supervisão Alex'),
  (public.norm_city('Ponta Grossa'), 'Ponta Grossa', 'alex', 'Supervisão Alex'),
  (public.norm_city('Telêmaco Borba'), 'Telêmaco Borba', 'renan', 'Supervisão Renan'),
  (public.norm_city('Imbaú'), 'Imbaú', 'renan', 'Supervisão Renan'),
  (public.norm_city('Tibagi'), 'Tibagi', 'renan', 'Supervisão Renan')
ON CONFLICT (city_key) DO UPDATE
  SET city_label = EXCLUDED.city_label,
      territory_code = EXCLUDED.territory_code,
      territory_name = EXCLUDED.territory_name;

-- 3. Cidades selecionadas pelo usuário
CREATE TABLE IF NOT EXISTS public.user_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  city text NOT NULL,
  city_key text GENERATED ALWAYS AS (public.norm_city(city)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, city)
);
GRANT SELECT, INSERT, DELETE ON public.user_cities TO authenticated;
GRANT ALL ON public.user_cities TO service_role;
ALTER TABLE public.user_cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_cities_select ON public.user_cities;
CREATE POLICY user_cities_select ON public.user_cities FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid())
         OR public.has_role(auth.uid(),'admin'::public.app_role)
         OR public.has_role(auth.uid(),'supervisor'::public.app_role));
DROP POLICY IF EXISTS user_cities_insert_own ON public.user_cities;
CREATE POLICY user_cities_insert_own ON public.user_cities FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin(auth.uid())
              OR public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS user_cities_delete_own ON public.user_cities;
CREATE POLICY user_cities_delete_own ON public.user_cities FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid())
         OR public.has_role(auth.uid(),'admin'::public.app_role));

-- 4. Marcação de reconfiguração obrigatória (todos os usuários existentes = NULL)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cities_configured_at timestamptz;

-- 5. Liberações excepcionais
CREATE TABLE IF NOT EXISTS public.city_access_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  city text NOT NULL,
  city_key text GENERATED ALWAYS AS (public.norm_city(city)) STORED,
  os text NOT NULL,
  checklist_id uuid,
  reason text,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.city_access_exceptions TO authenticated;
GRANT ALL ON public.city_access_exceptions TO service_role;
ALTER TABLE public.city_access_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_exceptions_read ON public.city_access_exceptions;
CREATE POLICY city_exceptions_read ON public.city_access_exceptions FOR SELECT TO authenticated
  USING (technician_id = auth.uid() OR public.is_platform_admin(auth.uid())
         OR ((public.has_role(auth.uid(),'admin'::public.app_role)
              OR public.has_role(auth.uid(),'supervisor'::public.app_role))
             AND provider_id = public.current_provider_id()));
DROP POLICY IF EXISTS city_exceptions_insert ON public.city_access_exceptions;
CREATE POLICY city_exceptions_insert ON public.city_access_exceptions FOR INSERT TO authenticated
  WITH CHECK (granted_by = auth.uid()
    AND (public.is_platform_admin(auth.uid())
         OR ((public.has_role(auth.uid(),'admin'::public.app_role)
              OR public.has_role(auth.uid(),'supervisor'::public.app_role))
             AND provider_id = public.current_provider_id())));
DROP POLICY IF EXISTS city_exceptions_update ON public.city_access_exceptions;
CREATE POLICY city_exceptions_update ON public.city_access_exceptions FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid())
         OR ((public.has_role(auth.uid(),'admin'::public.app_role)
              OR public.has_role(auth.uid(),'supervisor'::public.app_role))
             AND provider_id = public.current_provider_id()))
  WITH CHECK (true);

-- 6. Funções de escopo
CREATE OR REPLACE FUNCTION public.user_territories(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT t.territory_code), '{}')
  FROM public.user_cities uc
  JOIN public.city_territories t ON t.city_key = uc.city_key
  WHERE uc.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_city(_user_id uuid, _city text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.city_territories t
    WHERE t.city_key = public.norm_city(_city)
      AND t.territory_code = ANY (public.user_territories(_user_id))
  )
$$;

CREATE OR REPLACE FUNCTION public.has_city_exception(_user_id uuid, _city text, _os text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.city_access_exceptions e
    WHERE e.technician_id = _user_id
      AND e.revoked_at IS NULL
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND e.city_key = public.norm_city(_city)
      AND upper(btrim(e.os)) = upper(btrim(coalesce(_os,'')))
  )
$$;

-- 7. Política de leitura dos checklists
DROP POLICY IF EXISTS checklists_select_own_or_admin ON public.checklists;
CREATE POLICY checklists_select_own_or_admin ON public.checklists FOR SELECT
USING (
  auth.uid() = tecnico_id
  OR public.is_platform_admin(auth.uid())
  OR (provider_id = public.current_provider_id() AND (
        public.has_role(auth.uid(),'admin'::public.app_role)
     OR public.has_role(auth.uid(),'almoxarifado'::public.app_role)
     OR public.has_role(auth.uid(),'noc'::public.app_role)
     OR public.has_role(auth.uid(),'supervisor'::public.app_role)
     OR public.user_can_access_city(auth.uid(), cidade)
  ))
  OR public.has_city_exception(auth.uid(), cidade, os)
);

-- 8. Fotos seguem o território do checklist
DROP POLICY IF EXISTS fotos_select_own_or_admin ON public.checklist_fotos;
CREATE POLICY fotos_select_own_or_admin ON public.checklist_fotos FOR SELECT
USING (
  auth.uid() = tecnico_id
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_fotos.checklist_id
      AND (
        (c.provider_id = public.current_provider_id() AND (
            public.has_role(auth.uid(),'supervisor'::public.app_role)
         OR public.has_role(auth.uid(),'noc'::public.app_role)
         OR public.has_role(auth.uid(),'almoxarifado'::public.app_role)
         OR public.user_can_access_city(auth.uid(), c.cidade)))
        OR public.has_city_exception(auth.uid(), c.cidade, c.os)
      )
  )
);

-- 9. Contra-provas seguem o território
DROP POLICY IF EXISTS counterproof_read_owner_or_admin ON public.customer_counterproofs;
CREATE POLICY counterproof_read_owner_or_admin ON public.customer_counterproofs FOR SELECT
USING (
  tecnico_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = customer_counterproofs.checklist_id
      AND (
        (c.provider_id = public.current_provider_id() AND (
            public.has_role(auth.uid(),'supervisor'::public.app_role)
         OR public.has_role(auth.uid(),'noc'::public.app_role)
         OR public.user_can_access_city(auth.uid(), c.cidade)))
        OR public.has_city_exception(auth.uid(), c.cidade, c.os)
      )
  )
);

-- 10. Diagnósticos seguem o território
DROP POLICY IF EXISTS "Diag reports readable by owner or admin" ON public.checklist_diagnostic_reports;
CREATE POLICY "Diag reports readable by owner or admin" ON public.checklist_diagnostic_reports FOR SELECT
USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_diagnostic_reports.checklist_id
      AND (
        c.tecnico_id = auth.uid()
        OR (c.provider_id = public.current_provider_id() AND (
            public.has_role(auth.uid(),'supervisor'::public.app_role)
         OR public.has_role(auth.uid(),'noc'::public.app_role)
         OR public.user_can_access_city(auth.uid(), c.cidade)))
        OR public.has_city_exception(auth.uid(), c.cidade, c.os)
      )
  )
);

-- 11. Bloqueio de gravação fora do território
CREATE OR REPLACE FUNCTION public.enforce_checklist_city_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.tecnico_id THEN RETURN NEW; END IF;
  IF NEW.cidade IS NULL OR btrim(NEW.cidade) = '' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.city_territories WHERE city_key = public.norm_city(NEW.cidade)) THEN
    RETURN NEW;
  END IF;
  IF public.user_can_access_city(auth.uid(), NEW.cidade) THEN RETURN NEW; END IF;
  IF public.has_city_exception(auth.uid(), NEW.cidade, NEW.os) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'city_outside_territory' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_checklist_city_scope ON public.checklists;
CREATE TRIGGER trg_enforce_checklist_city_scope
BEFORE INSERT OR UPDATE OF cidade, os, status ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.enforce_checklist_city_scope();