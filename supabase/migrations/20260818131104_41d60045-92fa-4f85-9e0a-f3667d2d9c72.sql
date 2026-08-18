-- Acesso privado ao módulo
CREATE TABLE public.technical_feedback_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);
GRANT SELECT ON public.technical_feedback_access TO authenticated;
GRANT ALL ON public.technical_feedback_access TO service_role;
ALTER TABLE public.technical_feedback_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tfa_select_self" ON public.technical_feedback_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::public.app_role) AND provider_id = public.current_provider_id()));

CREATE OR REPLACE FUNCTION public.has_technical_feedback_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
      OR EXISTS (SELECT 1 FROM public.technical_feedback_access WHERE user_id = _user_id)
$$;

-- Avaliações
CREATE TABLE public.technical_employee_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_role text,
  employee_city text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  review_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'rascunho',
  technical_score numeric,
  recurrence_score numeric,
  evidence_score numeric,
  productivity_score numeric,
  operational_score numeric,
  communication_score numeric,
  final_score numeric,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  development_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths_notes text,
  development_notes text,
  technical_notes text,
  recurrence_notes text,
  evidence_notes text,
  productivity_notes text,
  operational_notes text,
  communication_notes text,
  general_notes text,
  development_goal text,
  development_action text,
  development_metric text,
  development_due_date date,
  next_review_date date,
  feedback_completed_at timestamptz,
  feedback_completed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX idx_ter_evaluator ON public.technical_employee_reviews(evaluator_user_id, period_end DESC);
CREATE INDEX idx_ter_employee ON public.technical_employee_reviews(employee_id, period_end DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_reviews TO authenticated;
GRANT ALL ON public.technical_employee_reviews TO service_role;
ALTER TABLE public.technical_employee_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ter_owner_all" ON public.technical_employee_reviews
  FOR ALL TO authenticated
  USING (evaluator_user_id = auth.uid()
     AND provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()))
  WITH CHECK (evaluator_user_id = auth.uid()
     AND provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()));

CREATE TRIGGER trg_ter_updated_at BEFORE UPDATE ON public.technical_employee_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.owns_technical_review(_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.technical_employee_reviews r
    WHERE r.id = _review_id
      AND r.evaluator_user_id = auth.uid()
      AND r.provider_id = public.current_provider_id()
      AND public.has_technical_feedback_access(auth.uid())
  )
$$;

-- Itens
CREATE TABLE public.technical_employee_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.technical_employee_reviews(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_key text NOT NULL,
  item_label text NOT NULL,
  score integer,
  is_not_applicable boolean NOT NULL DEFAULT false,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_review_items TO authenticated;
GRANT ALL ON public.technical_employee_review_items TO service_role;
ALTER TABLE public.technical_employee_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teri_owner_all" ON public.technical_employee_review_items
  FOR ALL TO authenticated
  USING (public.owns_technical_review(review_id))
  WITH CHECK (public.owns_technical_review(review_id));

-- Evidências
CREATE TABLE public.technical_employee_review_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.technical_employee_reviews(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  evidence_reference_id text,
  checklist_id uuid REFERENCES public.checklists(id) ON DELETE SET NULL,
  os text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_review_evidences TO authenticated;
GRANT ALL ON public.technical_employee_review_evidences TO service_role;
ALTER TABLE public.technical_employee_review_evidences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tere_owner_all" ON public.technical_employee_review_evidences
  FOR ALL TO authenticated
  USING (public.owns_technical_review(review_id))
  WITH CHECK (public.owns_technical_review(review_id));

-- Histórico de IA
CREATE TABLE public.technical_employee_review_ai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.technical_employee_reviews(id) ON DELETE CASCADE,
  analysis_type text NOT NULL,
  content text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_terai_review ON public.technical_employee_review_ai(review_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_review_ai TO authenticated;
GRANT ALL ON public.technical_employee_review_ai TO service_role;
ALTER TABLE public.technical_employee_review_ai ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terai_owner_all" ON public.technical_employee_review_ai
  FOR ALL TO authenticated
  USING (public.owns_technical_review(review_id))
  WITH CHECK (public.owns_technical_review(review_id));

-- Acompanhamentos
CREATE TABLE public.technical_employee_review_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.technical_employee_reviews(id) ON DELETE CASCADE,
  followup_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'nao_iniciado',
  previous_goal text,
  result text,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_review_followups TO authenticated;
GRANT ALL ON public.technical_employee_review_followups TO service_role;
ALTER TABLE public.technical_employee_review_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terf_owner_all" ON public.technical_employee_review_followups
  FOR ALL TO authenticated
  USING (public.owns_technical_review(review_id))
  WITH CHECK (public.owns_technical_review(review_id));

-- Registro da conversa
CREATE TABLE public.technical_employee_review_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.technical_employee_reviews(id) ON DELETE CASCADE,
  meeting_date timestamptz NOT NULL DEFAULT now(),
  meeting_place text,
  employee_reaction text,
  employee_comments text,
  supervisor_notes text,
  new_information_presented boolean NOT NULL DEFAULT false,
  new_information text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_employee_review_meetings TO authenticated;
GRANT ALL ON public.technical_employee_review_meetings TO service_role;
ALTER TABLE public.technical_employee_review_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "term_owner_all" ON public.technical_employee_review_meetings
  FOR ALL TO authenticated
  USING (public.owns_technical_review(review_id))
  WITH CHECK (public.owns_technical_review(review_id));

-- Auditoria
CREATE TABLE public.technical_employee_review_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid,
  review_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.technical_employee_review_audit TO service_role;
ALTER TABLE public.technical_employee_review_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tera_select_owner" ON public.technical_employee_review_audit
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid() AND public.has_technical_feedback_access(auth.uid()));