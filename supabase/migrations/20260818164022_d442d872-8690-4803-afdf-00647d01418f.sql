-- CANAL ÉTICO / CANAL DE DENÚNCIAS (whistleblower) --------------------------

CREATE TABLE public.whistleblower_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);
GRANT SELECT ON public.whistleblower_access TO authenticated;
GRANT ALL ON public.whistleblower_access TO service_role;
ALTER TABLE public.whistleblower_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_whistleblower_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
      OR EXISTS (SELECT 1 FROM public.whistleblower_access WHERE user_id = _user_id)
$$;

CREATE POLICY "wb_access_view" ON public.whistleblower_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_whistleblower_access(auth.uid()));

-- Categorias -----------------------------------------------------------------
CREATE TABLE public.whistleblower_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX whistleblower_categories_global_slug
  ON public.whistleblower_categories (slug) WHERE provider_id IS NULL;
CREATE UNIQUE INDEX whistleblower_categories_provider_slug
  ON public.whistleblower_categories (provider_id, slug) WHERE provider_id IS NOT NULL;
GRANT SELECT ON public.whistleblower_categories TO authenticated;
GRANT ALL ON public.whistleblower_categories TO service_role;
ALTER TABLE public.whistleblower_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_categories_view" ON public.whistleblower_categories
  FOR SELECT TO authenticated USING (public.has_whistleblower_access(auth.uid()));

INSERT INTO public.whistleblower_categories (slug, label, sort_order) VALUES
  ('assedio_moral','Assédio moral',1),
  ('assedio_sexual','Assédio sexual',2),
  ('discriminacao','Discriminação',3),
  ('ameaca','Ameaça',4),
  ('violencia','Violência',5),
  ('fraude','Fraude',6),
  ('furto','Furto',7),
  ('desvio_recursos','Desvio de recursos',8),
  ('corrupcao','Corrupção',9),
  ('conflito_interesse','Conflito de interesse',10),
  ('conduta_inadequada','Conduta inadequada',11),
  ('descumprimento_normas','Descumprimento de normas',12),
  ('seguranca_trabalho','Segurança do trabalho',13),
  ('uso_indevido_recursos','Uso indevido de recursos da empresa',14),
  ('lideranca','Problemas relacionados à liderança',15),
  ('outro','Outro',99);

-- Denúncias ------------------------------------------------------------------
CREATE TABLE public.whistleblower_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  protocol text NOT NULL UNIQUE,
  access_key_hash text NOT NULL,
  access_key_salt text NOT NULL,
  validation_code text NOT NULL UNIQUE,
  report_type text NOT NULL CHECK (report_type IN ('ANONYMOUS','IDENTIFIED')),
  category_slug text NOT NULL,
  category_label text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  unit text,
  city text,
  department text,
  location_description text,
  incident_date date,
  incident_time text,
  people_involved text,
  witnesses text,
  frequency text,
  status text NOT NULL DEFAULT 'RECEBIDA'
    CHECK (status IN ('RECEBIDA','EM_ANALISE','AGUARDANDO_INFORMACOES','EM_INVESTIGACAO','ENCAMINHADA','CONCLUIDA','ARQUIVADA')),
  priority text NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('BAIXA','MEDIA','ALTA','CRITICA')),
  identified_name text,
  identified_email text,
  identified_phone text,
  identified_department text,
  assigned_to uuid REFERENCES auth.users(id),
  conclusion text,
  first_analysis_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT wb_anonymous_has_no_identity CHECK (
    report_type <> 'ANONYMOUS' OR (
      identified_name IS NULL AND identified_email IS NULL
      AND identified_phone IS NULL AND identified_department IS NULL
    )
  )
);
CREATE INDEX whistleblower_reports_provider_idx ON public.whistleblower_reports (provider_id, created_at DESC);
GRANT SELECT, UPDATE ON public.whistleblower_reports TO authenticated;
GRANT ALL ON public.whistleblower_reports TO service_role;
ALTER TABLE public.whistleblower_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_reports_rh_view" ON public.whistleblower_reports
  FOR SELECT TO authenticated
  USING (public.has_whistleblower_access(auth.uid()) AND provider_id = public.current_provider_id());
CREATE POLICY "wb_reports_rh_update" ON public.whistleblower_reports
  FOR UPDATE TO authenticated
  USING (public.has_whistleblower_access(auth.uid()) AND provider_id = public.current_provider_id())
  WITH CHECK (public.has_whistleblower_access(auth.uid()) AND provider_id = public.current_provider_id());
CREATE TRIGGER trg_wb_reports_updated_at BEFORE UPDATE ON public.whistleblower_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anexos ---------------------------------------------------------------------
CREATE TABLE public.whistleblower_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.whistleblower_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  display_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  origin text NOT NULL CHECK (origin IN ('REPORTER','RH')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whistleblower_attachments_report_idx ON public.whistleblower_attachments (report_id);
GRANT SELECT ON public.whistleblower_attachments TO authenticated;
GRANT ALL ON public.whistleblower_attachments TO service_role;
ALTER TABLE public.whistleblower_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_attachments_rh_view" ON public.whistleblower_attachments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.whistleblower_reports r
    WHERE r.id = report_id AND public.has_whistleblower_access(auth.uid())
      AND r.provider_id = public.current_provider_id()));

-- Mensagens ------------------------------------------------------------------
CREATE TABLE public.whistleblower_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.whistleblower_reports(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('REPORTER','RH')),
  sender_user_id uuid REFERENCES auth.users(id),
  message text NOT NULL,
  attachment_id uuid REFERENCES public.whistleblower_attachments(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wb_reporter_has_no_user CHECK (sender_type <> 'REPORTER' OR sender_user_id IS NULL)
);
CREATE INDEX whistleblower_messages_report_idx ON public.whistleblower_messages (report_id, created_at);
GRANT SELECT ON public.whistleblower_messages TO authenticated;
GRANT ALL ON public.whistleblower_messages TO service_role;
ALTER TABLE public.whistleblower_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_messages_rh_view" ON public.whistleblower_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.whistleblower_reports r
    WHERE r.id = report_id AND public.has_whistleblower_access(auth.uid())
      AND r.provider_id = public.current_provider_id()));

-- Histórico ------------------------------------------------------------------
CREATE TABLE public.whistleblower_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.whistleblower_reports(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  public_note text,
  internal_note text,
  actor_user_id uuid REFERENCES auth.users(id),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whistleblower_status_history_report_idx ON public.whistleblower_status_history (report_id, created_at);
GRANT SELECT ON public.whistleblower_status_history TO authenticated;
GRANT ALL ON public.whistleblower_status_history TO service_role;
ALTER TABLE public.whistleblower_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_history_rh_view" ON public.whistleblower_status_history
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.whistleblower_reports r
    WHERE r.id = report_id AND public.has_whistleblower_access(auth.uid())
      AND r.provider_id = public.current_provider_id()));

-- Notas internas -------------------------------------------------------------
CREATE TABLE public.whistleblower_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.whistleblower_reports(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whistleblower_internal_notes_report_idx ON public.whistleblower_internal_notes (report_id, created_at);
GRANT SELECT ON public.whistleblower_internal_notes TO authenticated;
GRANT ALL ON public.whistleblower_internal_notes TO service_role;
ALTER TABLE public.whistleblower_internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_notes_rh_view" ON public.whistleblower_internal_notes
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.whistleblower_reports r
    WHERE r.id = report_id AND public.has_whistleblower_access(auth.uid())
      AND r.provider_id = public.current_provider_id()));

-- Auditoria administrativa ---------------------------------------------------
CREATE TABLE public.whistleblower_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.whistleblower_reports(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whistleblower_access_logs_report_idx ON public.whistleblower_access_logs (report_id, created_at DESC);
GRANT SELECT ON public.whistleblower_access_logs TO authenticated;
GRANT ALL ON public.whistleblower_access_logs TO service_role;
ALTER TABLE public.whistleblower_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_logs_rh_view" ON public.whistleblower_access_logs
  FOR SELECT TO authenticated
  USING (public.has_whistleblower_access(auth.uid()) AND provider_id = public.current_provider_id());

-- Configurações --------------------------------------------------------------
CREATE TABLE public.whistleblower_settings (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  channel_enabled boolean NOT NULL DEFAULT true,
  intro_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whistleblower_settings TO authenticated;
GRANT ALL ON public.whistleblower_settings TO service_role;
ALTER TABLE public.whistleblower_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_settings_rh_view" ON public.whistleblower_settings
  FOR SELECT TO authenticated
  USING (public.has_whistleblower_access(auth.uid()) AND provider_id = public.current_provider_id());

-- Rate limiting (somente backend privilegiado) -------------------------------
CREATE TABLE public.whistleblower_rate_limits (
  bucket text NOT NULL,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, action, window_started_at)
);
GRANT ALL ON public.whistleblower_rate_limits TO service_role;
ALTER TABLE public.whistleblower_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_whistleblower_rate_limit(
  _bucket text, _action text, _limit integer DEFAULT 10, _window_seconds integer DEFAULT 300
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _window timestamptz; _count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  _window := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / _window_seconds) * _window_seconds);
  PERFORM pg_advisory_xact_lock(hashtextextended(_bucket || ':' || _action || ':' || _window::text, 5150));
  INSERT INTO public.whistleblower_rate_limits(bucket, action, window_started_at, request_count)
  VALUES (_bucket, _action, _window, 1)
  ON CONFLICT (bucket, action, window_started_at)
  DO UPDATE SET request_count = public.whistleblower_rate_limits.request_count + 1
  RETURNING request_count INTO _count;
  DELETE FROM public.whistleblower_rate_limits WHERE window_started_at < now() - interval '1 day';
  RETURN _count <= _limit;
END; $$;