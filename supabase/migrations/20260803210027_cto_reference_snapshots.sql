-- Cadastro de referência de CTOs (importado das planilhas do OZmap),
-- guardado como snapshot histórico por importação — nunca sobrescreve o
-- snapshot anterior, só marca o mais novo como "vigente" pra consulta.

create table if not exists public.cto_reference_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  cidade text not null,
  filename text,
  imported_by uuid references auth.users(id) on delete set null,
  total_ctos integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cto_reference_snapshots_provider_cidade_idx
  on public.cto_reference_snapshots (provider_id, cidade, created_at desc);

alter table public.cto_reference_snapshots enable row level security;

drop policy if exists "provider_read_cto_snapshots" on public.cto_reference_snapshots;
create policy "provider_read_cto_snapshots"
  on public.cto_reference_snapshots for select
  using (provider_id = current_provider_id() or is_platform_admin(auth.uid()));

drop policy if exists "provider_write_cto_snapshots" on public.cto_reference_snapshots;
create policy "provider_write_cto_snapshots"
  on public.cto_reference_snapshots for insert
  with check (
    provider_id = current_provider_id()
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'supervisor'))
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

create index if not exists cto_reference_points_snapshot_idx
  on public.cto_reference_points (snapshot_id);
create index if not exists cto_reference_points_lookup_idx
  on public.cto_reference_points (provider_id, cidade, nome_normalizado);

alter table public.cto_reference_points enable row level security;

drop policy if exists "provider_read_cto_points" on public.cto_reference_points;
create policy "provider_read_cto_points"
  on public.cto_reference_points for select
  using (provider_id = current_provider_id() or is_platform_admin(auth.uid()));

drop policy if exists "provider_write_cto_points" on public.cto_reference_points;
create policy "provider_write_cto_points"
  on public.cto_reference_points for insert
  with check (
    provider_id = current_provider_id()
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'supervisor'))
  );

-- View auxiliar: aponta sempre pro snapshot mais recente de cada
-- cidade/provider, sem precisar o app rastrear "qual é o vigente".
create or replace view public.cto_reference_latest
with (security_invoker = true) as
select distinct on (crs.provider_id, crs.cidade)
  crs.id as snapshot_id, crs.provider_id, crs.cidade, crs.total_ctos, crs.created_at
from public.cto_reference_snapshots crs
order by crs.provider_id, crs.cidade, crs.created_at desc;
