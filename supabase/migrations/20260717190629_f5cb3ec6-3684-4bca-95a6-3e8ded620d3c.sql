
-- =============================================================
-- FASE 1: Versionamento de checklists + Webi Diagnostic
-- =============================================================

-- 1) Novos campos em checklists ------------------------------------------------
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS case_id UUID,
  ADD COLUMN IF NOT EXISTS parent_checklist_id UUID REFERENCES public.checklists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_reason TEXT,
  ADD COLUMN IF NOT EXISTS revision_notes TEXT,
  ADD COLUMN IF NOT EXISTS service_stage TEXT NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_by_checklist_id UUID REFERENCES public.checklists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revised_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: cada checklist existente vira sua própria versão inicial
UPDATE public.checklists
  SET case_id = id
  WHERE case_id IS NULL;

ALTER TABLE public.checklists
  ALTER COLUMN case_id SET NOT NULL;

-- Restrições de valores permitidos
ALTER TABLE public.checklists
  DROP CONSTRAINT IF EXISTS checklists_service_stage_check;
ALTER TABLE public.checklists
  ADD CONSTRAINT checklists_service_stage_check
  CHECK (service_stage IN ('initial','pre_change','post_ont_change','noc_retest','additional_test'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_checklists_case_id ON public.checklists(case_id);
CREATE INDEX IF NOT EXISTS idx_checklists_parent ON public.checklists(parent_checklist_id);

-- Uma única versão atual por atendimento
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklists_current_per_case
  ON public.checklists(case_id)
  WHERE is_current = true;

-- 2) Diagnósticos do Webi Diagnostic ------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_diagnostic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  case_id UUID NOT NULL,
  diagnostic_session_id TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  agent_version TEXT,
  generated_at TIMESTAMPTZ,
  test_stage TEXT NOT NULL,
  report_sequence INTEGER NOT NULL DEFAULT 1,
  supersedes_report_id UUID REFERENCES public.checklist_diagnostic_reports(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT diag_test_stage_check
    CHECK (test_stage IN ('before_change','after_ont_change','noc_retest','additional_test')),
  CONSTRAINT diag_status_check
    CHECK (status IN ('active','revoked','replaced')),
  CONSTRAINT diag_unique_session_per_case
    UNIQUE (case_id, diagnostic_session_id)
);

CREATE INDEX IF NOT EXISTS idx_diag_checklist ON public.checklist_diagnostic_reports(checklist_id);
CREATE INDEX IF NOT EXISTS idx_diag_case ON public.checklist_diagnostic_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_diag_created ON public.checklist_diagnostic_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_diag_session ON public.checklist_diagnostic_reports(diagnostic_session_id);

GRANT SELECT, INSERT, UPDATE ON public.checklist_diagnostic_reports TO authenticated;
GRANT ALL ON public.checklist_diagnostic_reports TO service_role;

ALTER TABLE public.checklist_diagnostic_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Diag reports readable by owner or admin"
  ON public.checklist_diagnostic_reports
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_diagnostic_reports.checklist_id
        AND c.tecnico_id = auth.uid()
    )
  );

CREATE POLICY "Diag reports insert by owner or admin"
  ON public.checklist_diagnostic_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_diagnostic_reports.checklist_id
        AND c.tecnico_id = auth.uid()
    )
  );

CREATE POLICY "Diag reports update by admin"
  ON public.checklist_diagnostic_reports
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Tokens de integração ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webi_integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['diagnostic:upload']::text[],
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wit_user ON public.webi_integration_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_wit_active ON public.webi_integration_tokens(active) WHERE active = true;

GRANT SELECT, INSERT, UPDATE ON public.webi_integration_tokens TO authenticated;
GRANT ALL ON public.webi_integration_tokens TO service_role;

ALTER TABLE public.webi_integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tokens visible to owner or admin"
  ON public.webi_integration_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tokens insertable by owner"
  ON public.webi_integration_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Tokens updatable by owner or admin"
  ON public.webi_integration_tokens
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
