
-- Novo tipo de checklist
DO $$ BEGIN
  CREATE TYPE public.checklist_tipo AS ENUM ('validacao_ont', 'instalacao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS tipo public.checklist_tipo NOT NULL DEFAULT 'validacao_ont',
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS plano text;

CREATE INDEX IF NOT EXISTS checklists_tipo_idx ON public.checklists (tipo);
