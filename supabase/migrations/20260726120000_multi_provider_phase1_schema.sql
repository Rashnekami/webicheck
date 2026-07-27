-- =============================================================
-- Multi-provider — FASE 1: schema aditivo
-- Nenhuma tabela/coluna/policy existente é alterada. provider_id é
-- NULLABLE em todo lugar: nada muda em runtime até a Fase 5 (RLS).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.providers TO authenticated;
GRANT ALL ON public.providers TO service_role;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para autenticados: necessário nas fases seguintes para
-- resolver o provider do subdomínio no login/signup. Sem policy de
-- INSERT/UPDATE/DELETE para authenticated — onboarding de provider é
-- operação de service_role (fora do escopo desta fase).
CREATE POLICY "providers_select_authenticated"
  ON public.providers FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_providers_updated_at
BEFORE UPDATE ON public.providers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: único provider existente hoje. Slug será usado no subdomínio (Fase 4).
INSERT INTO public.providers (slug, name)
VALUES ('webifibra', 'Webifibra')
ON CONFLICT (slug) DO NOTHING;

-- -------------------------------------------------------------
-- provider_id NULLABLE em profiles + tabelas operacionais.
-- NULL em profiles.provider_id = staff global (admin do sistema).
-- NULL nas tabelas operacionais é só um estado transitório até o
-- backfill da Fase 2.
-- -------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.checklist_fotos
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.checklist_diagnostic_reports
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.checklist_document_snapshots
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.checklist_public_access_logs
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.webi_integration_tokens
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_profiles_provider ON public.profiles(provider_id);
CREATE INDEX IF NOT EXISTS idx_checklists_provider ON public.checklists(provider_id);
CREATE INDEX IF NOT EXISTS idx_fotos_provider ON public.checklist_fotos(provider_id);
CREATE INDEX IF NOT EXISTS idx_diag_provider ON public.checklist_diagnostic_reports(provider_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_provider ON public.checklist_document_snapshots(provider_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_provider ON public.checklist_public_access_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_wit_provider ON public.webi_integration_tokens(provider_id);

-- Nenhuma policy de RLS existente é tocada nesta migration.
