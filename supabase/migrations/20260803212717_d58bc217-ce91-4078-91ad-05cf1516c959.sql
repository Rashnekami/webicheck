-- ============ provider_code_prefixes ============
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS public_code_prefix text,
  ADD COLUMN IF NOT EXISTS validation_code_prefix text;

UPDATE public.providers
   SET public_code_prefix     = COALESCE(public_code_prefix, 'WEBICHECK'),
       validation_code_prefix = COALESCE(validation_code_prefix, 'WBF')
 WHERE slug = 'webifibra';

UPDATE public.providers
   SET public_code_prefix = COALESCE(public_code_prefix, upper(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'))),
       validation_code_prefix = COALESCE(validation_code_prefix, upper(left(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'), 3)))
 WHERE public_code_prefix IS NULL OR validation_code_prefix IS NULL;

CREATE TABLE IF NOT EXISTS public.provider_checklist_counters (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_checklist_counters TO authenticated;
GRANT ALL ON public.provider_checklist_counters TO service_role;
ALTER TABLE public.provider_checklist_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_counters_select ON public.provider_checklist_counters;
CREATE POLICY provider_counters_select ON public.provider_checklist_counters
  FOR SELECT TO authenticated
  USING (provider_id = public.current_provider_id() OR public.is_platform_admin(auth.uid()));

INSERT INTO public.provider_checklist_counters (provider_id, last_number)
SELECT p.id,
       COALESCE(MAX((substring(c.numero_publico from '(\d{4})$'))::bigint), 0)
  FROM public.providers p
  LEFT JOIN public.checklists c
         ON c.provider_id = p.id
        AND c.numero_publico IS NOT NULL
 GROUP BY p.id
    ON CONFLICT (provider_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_checklist_finalization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _public_prefix text;
  _validation_prefix text;
  _n bigint;
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    NEW.finalizado_em := now();

    SELECT p.public_code_prefix, p.validation_code_prefix
      INTO _public_prefix, _validation_prefix
      FROM public.providers p
     WHERE p.id = NEW.provider_id;
    _public_prefix     := COALESCE(_public_prefix, 'WEBICHECK');
    _validation_prefix := COALESCE(_validation_prefix, 'WBF');

    IF NEW.codigo_validacao IS NULL THEN
      NEW.codigo_validacao := _validation_prefix || '-' ||
        to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;

    IF NEW.numero_publico IS NULL THEN
      IF NEW.provider_id IS NULL THEN
        _n := nextval('public.checklist_numero_seq');
      ELSE
        INSERT INTO public.provider_checklist_counters (provider_id, last_number)
        VALUES (NEW.provider_id, 1)
        ON CONFLICT (provider_id) DO UPDATE
          SET last_number = public.provider_checklist_counters.last_number + 1,
              updated_at  = now()
        RETURNING last_number INTO _n;
      END IF;

      NEW.numero_publico := _public_prefix || to_char(now(), 'YYYY') || lpad(_n::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.derive_provider_code_prefixes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_code_prefix IS NULL THEN
    NEW.public_code_prefix := upper(regexp_replace(NEW.slug, '[^a-zA-Z0-9]', '', 'g'));
  END IF;
  IF NEW.validation_code_prefix IS NULL THEN
    NEW.validation_code_prefix := upper(left(regexp_replace(NEW.slug, '[^a-zA-Z0-9]', '', 'g'), 3));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_provider_code_prefixes ON public.providers;
CREATE TRIGGER trg_derive_provider_code_prefixes
BEFORE INSERT ON public.providers
FOR EACH ROW EXECUTE FUNCTION public.derive_provider_code_prefixes();

-- ============ auth_hardening_v2 ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.generate_next_technician_login(_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _candidate text;
BEGIN
  SELECT COALESCE(MAX(substring(login FROM '^tec(\d+)$')::int), 0) + 1
    INTO _next
    FROM public.provider_login_accounts
   WHERE provider_id = _provider_id
     AND login ~ '^tec\d+$';

  _candidate := 'tec' || lpad(_next::text, 2, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.provider_login_accounts
     WHERE provider_id = _provider_id AND lower(login) = _candidate
  ) LOOP
    _next := _next + 1;
    _candidate := 'tec' || lpad(_next::text, 2, '0');
  END LOOP;

  RETURN _candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_technician_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_technician_login(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _provider_id uuid;
  _is_owner boolean;
  _auth_provider text;
BEGIN
  _auth_provider := NEW.raw_app_meta_data ->> 'provider';

  IF _auth_provider = 'google' THEN
    RAISE EXCEPTION
      'google_signup_blocked: nenhuma conta existente vinculada a este e-mail Google. Peça a um administrador/supervisor para vincular seu acesso.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _provider_id FROM public.providers WHERE slug = 'webifibra';
  _is_owner := lower(COALESCE(NEW.email, '')) IN (
    'reenan.rash@gmail.com',
    'renan.rash@gmail.com',
    'renanparkofthedeath@gmail.com'
  );
  INSERT INTO public.profiles (id, email, full_name, city, provider_id, platform_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'city', '')), ''),
    _provider_id,
    _is_owner
  ) ON CONFLICT (id) DO NOTHING;
  IF _is_owner THEN _role := 'admin'; ELSE _role := 'tecnico'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ============ login_security_logs ============
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete set null,
  login text not null,
  ip text,
  success boolean not null,
  reason text,
  user_agent text,
  geo_country text,
  geo_region text,
  geo_city text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;

create index if not exists login_attempts_login_created_idx on public.login_attempts (lower(login), created_at desc);
create index if not exists login_attempts_ip_created_idx on public.login_attempts (ip, created_at desc);
create index if not exists login_attempts_provider_idx on public.login_attempts (provider_id, created_at desc);

alter table public.login_attempts enable row level security;

drop policy if exists "platform_admin_all_login_attempts" on public.login_attempts;
create policy "platform_admin_all_login_attempts"
  on public.login_attempts for select to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists "provider_supervisor_own_login_attempts" on public.login_attempts;
create policy "provider_supervisor_own_login_attempts"
  on public.login_attempts for select to authenticated
  using (
    provider_id = public.current_provider_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'supervisor'))
  );

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  route text not null,
  method text not null,
  ip text,
  user_agent text,
  geo_country text,
  geo_region text,
  geo_city text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.access_logs TO authenticated;
GRANT ALL ON public.access_logs TO service_role;

create index if not exists access_logs_created_idx on public.access_logs (created_at desc);
create index if not exists access_logs_provider_idx on public.access_logs (provider_id, created_at desc);
create index if not exists access_logs_user_idx on public.access_logs (user_id, created_at desc);

alter table public.access_logs enable row level security;

drop policy if exists "platform_admin_all_access_logs" on public.access_logs;
create policy "platform_admin_all_access_logs"
  on public.access_logs for select to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists "provider_supervisor_own_access_logs" on public.access_logs;
create policy "provider_supervisor_own_access_logs"
  on public.access_logs for select to authenticated
  using (
    provider_id = public.current_provider_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'supervisor'))
  );

create or replace function public.purge_old_security_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.login_attempts where created_at < now() - interval '90 days';
  delete from public.access_logs where created_at < now() - interval '90 days';
end;
$$;

-- ============ cto_reference_snapshots ============
create table if not exists public.cto_reference_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  cidade text not null,
  filename text,
  imported_by uuid references auth.users(id) on delete set null,
  total_ctos integer not null default 0,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.cto_reference_snapshots TO authenticated;
GRANT ALL ON public.cto_reference_snapshots TO service_role;

create index if not exists cto_reference_snapshots_provider_cidade_idx
  on public.cto_reference_snapshots (provider_id, cidade, created_at desc);

alter table public.cto_reference_snapshots enable row level security;

drop policy if exists "provider_read_cto_snapshots" on public.cto_reference_snapshots;
create policy "provider_read_cto_snapshots"
  on public.cto_reference_snapshots for select to authenticated
  using (provider_id = public.current_provider_id() or public.is_platform_admin(auth.uid()));

drop policy if exists "provider_write_cto_snapshots" on public.cto_reference_snapshots;
create policy "provider_write_cto_snapshots"
  on public.cto_reference_snapshots for insert to authenticated
  with check (
    provider_id = public.current_provider_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'supervisor'))
  );

create table if not exists public.cto_reference_points (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.cto_reference_snapshots(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  cidade text not null,
  nome text not null,
  nome_normalizado text not null,
  lat double precision,
  lng double precision
);
GRANT SELECT, INSERT ON public.cto_reference_points TO authenticated;
GRANT ALL ON public.cto_reference_points TO service_role;

create index if not exists cto_reference_points_snapshot_idx on public.cto_reference_points (snapshot_id);
create index if not exists cto_reference_points_lookup_idx
  on public.cto_reference_points (provider_id, cidade, nome_normalizado);

alter table public.cto_reference_points enable row level security;

drop policy if exists "provider_read_cto_points" on public.cto_reference_points;
create policy "provider_read_cto_points"
  on public.cto_reference_points for select to authenticated
  using (provider_id = public.current_provider_id() or public.is_platform_admin(auth.uid()));

drop policy if exists "provider_write_cto_points" on public.cto_reference_points;
create policy "provider_write_cto_points"
  on public.cto_reference_points for insert to authenticated
  with check (
    provider_id = public.current_provider_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'supervisor'))
  );

create or replace view public.cto_reference_latest
with (security_invoker = true) as
select distinct on (crs.provider_id, crs.cidade)
  crs.id as snapshot_id, crs.provider_id, crs.cidade, crs.total_ctos, crs.created_at
from public.cto_reference_snapshots crs
order by crs.provider_id, crs.cidade, crs.created_at desc;

GRANT SELECT ON public.cto_reference_latest TO authenticated;
GRANT ALL ON public.cto_reference_latest TO service_role;