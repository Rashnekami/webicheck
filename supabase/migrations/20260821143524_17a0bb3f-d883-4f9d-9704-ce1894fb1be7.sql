-- Evolução aditiva da Avaliação Técnica Interna: anotações mensais privadas e PDI estruturado.
-- Não altera avaliações históricas e não é aplicada automaticamente em produção por este commit.

CREATE TABLE public.technical_employee_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  competence text NOT NULL,
  note_text text NOT NULL CHECK (length(btrim(note_text)) BETWEEN 3 AND 5000),
  note_type text NOT NULL DEFAULT 'operacional'
    CHECK (note_type IN ('positivo','atencao','desenvolvimento','destaque','tecnico','atendimento','comunicacao','operacional')),
  category text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','confirmada','utilizada','arquivada')),
  linked_review_id uuid REFERENCES public.technical_employee_reviews(id) ON DELETE SET NULL,
  checklist_id uuid REFERENCES public.checklists(id) ON DELETE SET NULL,
  service_order text,
  ai_suggested_type text,
  ai_suggested_category text,
  ai_suggested_competencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_professional_text text,
  ai_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technical_employee_notes_competence_format
    CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE INDEX idx_ten_author_employee_competence
  ON public.technical_employee_notes(author_user_id, employee_id, competence, occurred_at DESC);
CREATE INDEX idx_ten_review ON public.technical_employee_notes(linked_review_id)
  WHERE linked_review_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_notes TO authenticated;
GRANT ALL ON public.technical_employee_notes TO service_role;
ALTER TABLE public.technical_employee_notes ENABLE ROW LEVEL SECURITY;

-- Privacidade deliberadamente mais estrita que a das avaliações: somente o autor.
CREATE POLICY "ten_author_only" ON public.technical_employee_notes
  FOR ALL TO authenticated
  USING (
    author_user_id = auth.uid()
    AND provider_id = public.current_provider_id()
    AND public.has_technical_feedback_access(auth.uid())
  )
  WITH CHECK (
    author_user_id = auth.uid()
    AND provider_id = public.current_provider_id()
    AND public.has_technical_feedback_access(auth.uid())
  );

CREATE TRIGGER trg_ten_updated_at BEFORE UPDATE ON public.technical_employee_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.technical_employee_pdi_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.technical_employee_reviews(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objective text NOT NULL CHECK (length(btrim(objective)) BETWEEN 3 AND 2000),
  agreed_action text NOT NULL CHECK (length(btrim(agreed_action)) BETWEEN 3 AND 3000),
  indicator text NOT NULL CHECK (length(btrim(indicator)) BETWEEN 3 AND 2000),
  due_date date,
  management_support text,
  status text NOT NULL DEFAULT 'nao_iniciado'
    CHECK (status IN ('nao_iniciado','em_andamento','cumprido','parcialmente_cumprido','nao_cumprido','cancelado')),
  followup_comment text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ia')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tepa_review ON public.technical_employee_pdi_actions(review_id, created_at);
CREATE INDEX idx_tepa_employee ON public.technical_employee_pdi_actions(employee_id, due_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_pdi_actions TO authenticated;
GRANT ALL ON public.technical_employee_pdi_actions TO service_role;
ALTER TABLE public.technical_employee_pdi_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tepa_review_owner" ON public.technical_employee_pdi_actions
  FOR ALL TO authenticated
  USING (
    evaluator_user_id = auth.uid()
    AND provider_id = public.current_provider_id()
    AND public.owns_technical_review(review_id)
  )
  WITH CHECK (
    evaluator_user_id = auth.uid()
    AND provider_id = public.current_provider_id()
    AND public.owns_technical_review(review_id)
  );

CREATE TRIGGER trg_tepa_updated_at BEFORE UPDATE ON public.technical_employee_pdi_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.technical_employee_review_meetings
  ADD COLUMN IF NOT EXISTS feedback_realized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_status text,
  ADD COLUMN IF NOT EXISTS agreed_actions text,
  ADD COLUMN IF NOT EXISTS next_review_date date;

ALTER TABLE public.technical_employee_review_meetings
  ADD CONSTRAINT technical_review_meeting_agreement_status_check
  CHECK (agreement_status IS NULL OR agreement_status IN ('concordou','concordou_parcialmente','discordou'));