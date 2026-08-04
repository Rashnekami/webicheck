-- Módulo experimental "Mapa Óptico Inteligente" — inventário de CEO,
-- cabos, fibras, splitters e CTOs. Isolado das tabelas de checklist
-- existentes de propósito (módulo novo só para teste, não integrado
-- ainda ao fluxo de checklist de remapeamento/intervenção).

create table if not exists public.optical_ceos (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  codigo text not null,
  nome text,
  cidade text,
  bairro text,
  endereco text,
  lat double precision,
  lng double precision,
  modelo text,
  fabricante text,
  capacidade_bandejas integer,
  quantidade_bandejas integer,
  estado text default 'ativa',
  situacao_vedacao text,
  situacao_bandejas text,
  foto_externa_path text,
  foto_interna_path text,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, codigo)
);

create table if not exists public.optical_ctos (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  codigo text not null,
  nome text,
  cidade text,
  bairro text,
  endereco text,
  lat double precision,
  lng double precision,
  poste text,
  capacidade integer,
  fabricante text,
  modelo text,
  tipo_splitter_interno text,
  clientes_ativos integer default 0,
  estado text default 'ativa',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, codigo)
);

create table if not exists public.optical_cables (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  ceo_id uuid references public.optical_ceos(id) on delete set null,
  codigo text not null,
  capacidade integer not null,
  tubos integer not null,
  fibras_por_tubo integer not null,
  construcao jsonb,
  tipo text,
  direcao text,
  origem text,
  destino text,
  fabricante text,
  modelo text,
  metragem numeric,
  etiqueta text,
  foto_identificacao_path text,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (provider_id, codigo)
);

create table if not exists public.optical_fibers (
  id uuid primary key default gen_random_uuid(),
  cable_id uuid not null references public.optical_cables(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  numero_global integer not null,
  tubo_numero integer not null,
  tubo_cor text not null,
  fibra_numero_no_tubo integer not null,
  fibra_cor text not null,
  identificacao_adicional text,
  estado text not null default 'disponivel',
  potencia_medida_dbm numeric,
  observacoes text,
  unique (cable_id, numero_global)
);
create index if not exists optical_fibers_cable_idx on public.optical_fibers(cable_id);

create table if not exists public.optical_splitters (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  ceo_id uuid not null references public.optical_ceos(id) on delete cascade,
  codigo text not null,
  tipo text not null,
  num_saidas integer not null,
  fabricante text,
  modelo text,
  numero_serie text,
  patrimonio text,
  tecnologia text,
  conectorizado boolean,
  bandeja text,
  posicao_fisica text,
  perda_nominal_db numeric,
  tolerancia_db numeric,
  comprimento_onda_nm integer,
  situacao text default 'ativo',
  fibra_alimentadora_id uuid references public.optical_fibers(id) on delete set null,
  potencia_entrada_dbm numeric,
  medicao_entrada_em timestamptz,
  equipamento_medicao text,
  data_instalacao date,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (provider_id, ceo_id, codigo)
);
create index if not exists optical_splitters_ceo_idx on public.optical_splitters(ceo_id);

create table if not exists public.optical_splitter_outputs (
  id uuid primary key default gen_random_uuid(),
  splitter_id uuid not null references public.optical_splitters(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  porta_numero integer not null,
  cor text not null,
  estado text not null default 'livre',
  potencia_saida_dbm numeric,
  cabo_distribuicao_id uuid references public.optical_cables(id) on delete set null,
  fibra_distribuicao_id uuid references public.optical_fibers(id) on delete set null,
  cto_id uuid references public.optical_ctos(id) on delete set null,
  ceo_destino_id uuid references public.optical_ceos(id) on delete set null,
  splitter_secundario_id uuid references public.optical_splitters(id) on delete set null,
  potencia_chegada_dbm numeric,
  observacoes text,
  updated_at timestamptz not null default now(),
  unique (splitter_id, porta_numero)
);
create index if not exists optical_outputs_splitter_idx on public.optical_splitter_outputs(splitter_id);
create index if not exists optical_outputs_cto_idx on public.optical_splitter_outputs(cto_id);

-- RLS: mesmo padrão do restante do sistema — isolamento por provider_id,
-- leitura pra qualquer papel do provedor, escrita só admin/supervisor.
do $$
declare
  t text;
begin
  foreach t in array array['optical_ceos','optical_ctos','optical_cables','optical_fibers','optical_splitters','optical_splitter_outputs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "provider_read_%1$s" on public.%1$s', t);
    execute format(
      'create policy "provider_read_%1$s" on public.%1$s for select using (provider_id = current_provider_id() or is_platform_admin(auth.uid()))',
      t
    );
    execute format('drop policy if exists "provider_write_%1$s" on public.%1$s', t);
    execute format(
      'create policy "provider_write_%1$s" on public.%1$s for all using (provider_id = current_provider_id() and (has_role(auth.uid(), ''admin'') or has_role(auth.uid(), ''supervisor''))) with check (provider_id = current_provider_id() and (has_role(auth.uid(), ''admin'') or has_role(auth.uid(), ''supervisor'')))',
      t
    );
  end loop;
end $$;
