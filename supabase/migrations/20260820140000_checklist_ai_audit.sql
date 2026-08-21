-- Auditoria de checklists por IA (Etapa 3 do escopo).
-- Totalmente aditiva: nenhuma tabela existente é alterada.
--
-- Rubrica única com vigência a partir de 2026-06-01, definida com o supervisor.
-- Checklist finalizado antes disso não é auditado: o formulário ainda mudava e
-- apontar campo que não existia na época penalizaria o técnico injustamente.

-- ------------------------------------------------------------- análises
CREATE TABLE public.checklist_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competence text NOT NULL CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  checklist_tipo text NOT NULL,
  revision_number integer NOT NULL DEFAULT 1,
  rubric_version text NOT NULL,
  -- sha256(checklist_id | revision_number | rubric_version | hash dos dados).
  -- Evita reprocessar o que não mudou (§4 do escopo).
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN (
    'aguardando','em_analise','analisado','revisao_humana','falha','reprocessado')),
  -- Só uma análise por checklist vale como atual; as anteriores ficam para
  -- rastreabilidade e nunca são apagadas.
  is_current boolean NOT NULL DEFAULT true,
  confidence text CHECK (confidence IS NULL OR confidence IN ('baixo','medio','alto')),
  model text,
  raw_response jsonb,
  error_message text,
  analyzed_at timestamptz,
  batch_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX caa_dedup ON public.checklist_ai_analyses (content_hash);
CREATE UNIQUE INDEX caa_one_current ON public.checklist_ai_analyses (checklist_id)
  WHERE is_current;
CREATE INDEX caa_lookup
  ON public.checklist_ai_analyses (provider_id, employee_id, competence);
CREATE INDEX caa_batch ON public.checklist_ai_analyses (batch_id) WHERE batch_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.checklist_ai_analyses TO authenticated;
GRANT ALL ON public.checklist_ai_analyses TO service_role;
ALTER TABLE public.checklist_ai_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caa_feedback_access" ON public.checklist_ai_analyses
  FOR ALL TO authenticated
  USING (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()))
  WITH CHECK (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()));

CREATE TRIGGER trg_caa_updated_at BEFORE UPDATE ON public.checklist_ai_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------- apontamentos
CREATE TABLE public.checklist_ai_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.checklist_ai_analyses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'ponto_positivo','ponto_atencao','inconsistencia','neutro','revisao_humana')),
  category text NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 3 AND 2000),
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'medio' CHECK (confidence IN ('baixo','medio','alto')),
  origin text NOT NULL DEFAULT 'ia' CHECK (origin IN ('regra','ia')),

  -- Revisão do supervisor. Nada afeta avaliação antes de ser confirmado (§3).
  review_status text NOT NULL DEFAULT 'pendente' CHECK (review_status IN (
    'pendente','confirmado','rejeitado','nao_era_responsabilidade')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  supervisor_note text,
  -- Reclassificação: o supervisor pode corrigir o tipo do apontamento.
  reclassified_kind text CHECK (reclassified_kind IS NULL OR reclassified_kind IN (
    'ponto_positivo','ponto_atencao','inconsistencia','neutro','revisao_humana')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caf_analysis ON public.checklist_ai_findings (analysis_id);
CREATE INDEX caf_review ON public.checklist_ai_findings (review_status);

GRANT SELECT, INSERT, UPDATE ON public.checklist_ai_findings TO authenticated;
GRANT ALL ON public.checklist_ai_findings TO service_role;
ALTER TABLE public.checklist_ai_findings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_checklist_analysis(_analysis_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.checklist_ai_analyses a
    WHERE a.id = _analysis_id
      AND a.provider_id = public.current_provider_id()
      AND public.has_technical_feedback_access(auth.uid())
  )
$$;

CREATE POLICY "caf_via_analysis" ON public.checklist_ai_findings
  FOR ALL TO authenticated
  USING (public.owns_checklist_analysis(analysis_id))
  WITH CHECK (public.owns_checklist_analysis(analysis_id));

-- ---------------------------------------------------------------- lotes
CREATE TABLE public.checklist_audit_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'preparado' CHECK (status IN (
    'preparado','executando','pausado','concluido','cancelado')),
  total_checklists integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  skipped_duplicate integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  last_error text,
  started_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX cab_provider ON public.checklist_audit_batches (provider_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.checklist_audit_batches TO authenticated;
GRANT ALL ON public.checklist_audit_batches TO service_role;
ALTER TABLE public.checklist_audit_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_feedback_access" ON public.checklist_audit_batches
  FOR ALL TO authenticated
  USING (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()))
  WITH CHECK (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()));

CREATE TRIGGER trg_cab_updated_at BEFORE UPDATE ON public.checklist_audit_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
