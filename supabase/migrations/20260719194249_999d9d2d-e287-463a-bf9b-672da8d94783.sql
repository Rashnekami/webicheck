-- Base multi-provedor e autorização segura do Webi Diagnostic Agent.
-- A migration é retrocompatível: todos os dados atuais passam a pertencer à Webifibra.

CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  logo_url text,
  primary_color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.providers (name, slug, status)
VALUES ('Webifibra', 'webifibra', 'active')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id);
ALTER TABLE public.webi_integration_tokens ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id);
ALTER TABLE public.webi_integration_tokens ADD COLUMN IF NOT EXISTS device_id uuid;

UPDATE public.profiles
SET provider_id = (SELECT id FROM public.providers WHERE slug = 'webifibra')
WHERE provider_id IS NULL;

UPDATE public.profiles SET platform_admin = true
WHERE lower(email) = 'renan.rash@gmail.com';

UPDATE public.checklists c
SET provider_id = COALESCE(
  (SELECT p.provider_id FROM public.profiles p WHERE p.id = c.tecnico_id),
  (SELECT id FROM public.providers WHERE slug = 'webifibra')
)
WHERE provider_id IS NULL;

UPDATE public.webi_integration_tokens t
SET provider_id = COALESCE(
  (SELECT p.provider_id FROM public.profiles p WHERE p.id = t.user_id),
  (SELECT id FROM public.providers WHERE slug = 'webifibra')
)
WHERE provider_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN provider_id SET NOT NULL;
ALTER TABLE public.checklists ALTER COLUMN provider_id SET NOT NULL;
ALTER TABLE public.webi_integration_tokens ALTER COLUMN provider_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_provider ON public.profiles(provider_id);
CREATE INDEX IF NOT EXISTS idx_checklists_provider ON public.checklists(provider_id);

CREATE TABLE IF NOT EXISTS public.provider_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, normalized_name)
);

INSERT INTO public.provider_cities (provider_id, name, normalized_name)
SELECT p.id, city.name, city.normalized_name
FROM public.providers p
CROSS JOIN (VALUES
  ('Telêmaco Borba', 'telemaco borba'), ('Imbaú', 'imbau'), ('Tibagi', 'tibagi'),
  ('Ortigueira', 'ortigueira'), ('Reserva', 'reserva'), ('Curiúva', 'curiuva'),
  ('São Jerônimo da Serra', 'sao jeronimo da serra'), ('Ventania', 'ventania')
) AS city(name, normalized_name)
WHERE p.slug = 'webifibra'
ON CONFLICT (provider_id, normalized_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agent_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  fingerprint_hash text NOT NULL,
  platform text,
  agent_version text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (provider_id, user_id, fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS public.agent_authorization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  device_code_hash text NOT NULL UNIQUE,
  user_code text NOT NULL UNIQUE,
  device_name text NOT NULL,
  fingerprint_hash text NOT NULL,
  platform text,
  agent_version text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'consumed')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.agent_devices(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webi_integration_tokens
  ADD CONSTRAINT webi_integration_tokens_device_id_fkey
  FOREIGN KEY (device_id) REFERENCES public.agent_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_auth_user_code ON public.agent_authorization_requests(user_code);
CREATE INDEX IF NOT EXISTS idx_agent_devices_user ON public.agent_devices(user_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.current_provider_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT provider_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.provider_is_active(_provider_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.providers WHERE id = _provider_id AND status = 'active')
$$;

CREATE OR REPLACE FUNCTION public.consume_agent_authorization(
  _device_code_hash text, _token_hash text, _token_prefix text
)
RETURNS TABLE(token_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _request public.agent_authorization_requests%ROWTYPE;
  _token_id uuid;
BEGIN
  SELECT * INTO _request FROM public.agent_authorization_requests
  WHERE device_code_hash = _device_code_hash FOR UPDATE;
  IF NOT FOUND OR _request.status <> 'approved' OR _request.approved_by IS NULL OR _request.device_id IS NULL THEN
    RAISE EXCEPTION 'authorization_not_approved';
  END IF;
  IF _request.expires_at <= now() THEN RAISE EXCEPTION 'authorization_expired'; END IF;
  IF NOT public.provider_is_active(_request.provider_id) THEN RAISE EXCEPTION 'provider_suspended'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _request.approved_by AND active) THEN RAISE EXCEPTION 'user_suspended'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_devices WHERE id = _request.device_id AND status = 'active') THEN RAISE EXCEPTION 'device_suspended'; END IF;

  INSERT INTO public.webi_integration_tokens
    (user_id, provider_id, device_id, name, token_prefix, token_hash, scopes, active)
  VALUES
    (_request.approved_by, _request.provider_id, _request.device_id,
     'Agent - ' || _request.device_name, _token_prefix, _token_hash,
     ARRAY['diagnostic:resolve', 'diagnostic:upload', 'diagnostic:checklists']::text[], true)
  RETURNING id INTO _token_id;
  UPDATE public.agent_authorization_requests SET status = 'consumed', consumed_at = now()
  WHERE id = _request.id;
  RETURN QUERY SELECT _token_id;
END;
$$;

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY providers_read_own ON public.providers FOR SELECT TO authenticated
USING (id = public.current_provider_id());
CREATE POLICY providers_admin_update ON public.providers FOR UPDATE TO authenticated
USING (
  id = public.current_provider_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_admin)
)
WITH CHECK (
  id = public.current_provider_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_admin)
);

CREATE POLICY provider_cities_read_own ON public.provider_cities FOR SELECT TO authenticated
USING (provider_id = public.current_provider_id());
CREATE POLICY provider_cities_admin_all ON public.provider_cities FOR ALL TO authenticated
USING (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY devices_read_own_or_admin ON public.agent_devices FOR SELECT TO authenticated
USING (user_id = auth.uid() OR (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY devices_admin_update ON public.agent_devices FOR UPDATE TO authenticated
USING (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY auth_requests_read_approver ON public.agent_authorization_requests FOR SELECT TO authenticated
USING (provider_id = public.current_provider_id());

CREATE POLICY announcements_read_own ON public.announcements FOR SELECT TO authenticated
USING (provider_id = public.current_provider_id());
CREATE POLICY announcements_admin_all ON public.announcements FOR ALL TO authenticated
USING (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.providers, public.provider_cities, public.agent_devices,
  public.agent_authorization_requests, public.announcements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.provider_cities, public.announcements TO authenticated;
GRANT UPDATE ON public.providers, public.agent_devices, public.agent_authorization_requests TO authenticated;
GRANT ALL ON public.providers, public.provider_cities, public.agent_devices,
  public.agent_authorization_requests, public.announcements TO service_role;
GRANT EXECUTE ON FUNCTION public.current_provider_id(), public.provider_is_active(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_agent_authorization(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_agent_authorization(text, text, text) TO service_role;

-- Novas contas entram no provedor padrão até a futura tela de convite por provedor.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
  _provider_id uuid;
BEGIN
  SELECT id INTO _provider_id FROM public.providers WHERE slug = 'webifibra';
  INSERT INTO public.profiles (id, email, full_name, city, provider_id, platform_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'city', '')), ''),
    _provider_id,
    lower(COALESCE(NEW.email, '')) = 'renan.rash@gmail.com'
  ) ON CONFLICT (id) DO NOTHING;
  IF lower(COALESCE(NEW.email, '')) = 'renan.rash@gmail.com' THEN _role := 'admin'; ELSE _role := 'tecnico'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Checklists novos herdam o provedor do técnico mesmo quando criados por clientes antigos.
CREATE OR REPLACE FUNCTION public.assign_checklist_provider()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.provider_id IS NULL THEN
    SELECT provider_id INTO NEW.provider_id FROM public.profiles WHERE id = NEW.tecnico_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_checklist_provider ON public.checklists;
CREATE TRIGGER trg_assign_checklist_provider BEFORE INSERT ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.assign_checklist_provider();