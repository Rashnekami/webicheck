-- Segurança: log de tentativas de login (brute force) e log geral de acesso
-- autenticado, com IP e geolocalização best-effort. Somente platform_admin
-- e supervisores do próprio provedor podem consultar.

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

create index if not exists login_attempts_login_created_idx
  on public.login_attempts (lower(login), created_at desc);
create index if not exists login_attempts_ip_created_idx
  on public.login_attempts (ip, created_at desc);
create index if not exists login_attempts_provider_idx
  on public.login_attempts (provider_id, created_at desc);

alter table public.login_attempts enable row level security;

drop policy if exists "platform_admin_all_login_attempts" on public.login_attempts;
create policy "platform_admin_all_login_attempts"
  on public.login_attempts for select
  using (is_platform_admin(auth.uid()));

drop policy if exists "provider_supervisor_own_login_attempts" on public.login_attempts;
create policy "provider_supervisor_own_login_attempts"
  on public.login_attempts for select
  using (
    provider_id = current_provider_id()
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'supervisor'))
  );

-- Nenhuma policy de insert: só a service role (server-side) grava aqui.

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

create index if not exists access_logs_created_idx on public.access_logs (created_at desc);
create index if not exists access_logs_provider_idx on public.access_logs (provider_id, created_at desc);
create index if not exists access_logs_user_idx on public.access_logs (user_id, created_at desc);

alter table public.access_logs enable row level security;

drop policy if exists "platform_admin_all_access_logs" on public.access_logs;
create policy "platform_admin_all_access_logs"
  on public.access_logs for select
  using (is_platform_admin(auth.uid()));

drop policy if exists "provider_supervisor_own_access_logs" on public.access_logs;
create policy "provider_supervisor_own_access_logs"
  on public.access_logs for select
  using (
    provider_id = current_provider_id()
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'supervisor'))
  );

-- Faxina automática: mantém só 90 dias de histórico (chamar periodicamente
-- via cron do Supabase, se disponível; caso contrário rodar manualmente).
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
