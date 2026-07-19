-- Reconcilia funções de runtime em bancos de preview que receberam as tabelas,
-- mas não registraram as RPCs das migrations anteriores.

CREATE TABLE IF NOT EXISTS public.webi_api_rate_limits (
  token_id uuid NOT NULL REFERENCES public.webi_integration_tokens(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (token_id, action, window_started_at)
);
ALTER TABLE public.webi_api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_webi_rate_limit(
  _token_id uuid, _action text, _limit integer DEFAULT 30, _window_seconds integer DEFAULT 60
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _window timestamptz; _count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  IF _limit < 1 OR _window_seconds < 1 THEN RAISE EXCEPTION 'invalid_rate_limit' USING ERRCODE = '22023'; END IF;
  _window := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / _window_seconds) * _window_seconds);
  PERFORM pg_advisory_xact_lock(hashtextextended(_token_id::text || ':' || _action || ':' || _window::text, 73));
  INSERT INTO public.webi_api_rate_limits(token_id, action, window_started_at, request_count)
  VALUES (_token_id, _action, _window, 1)
  ON CONFLICT (token_id, action, window_started_at)
  DO UPDATE SET request_count = public.webi_api_rate_limits.request_count + 1
  RETURNING request_count INTO _count;
  DELETE FROM public.webi_api_rate_limits WHERE window_started_at < now() - interval '1 day';
  RETURN _count <= _limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_webi_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_webi_rate_limit(uuid, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.link_diagnostic_report(
  _id uuid, _checklist_id uuid, _case_id uuid, _diagnostic_session_id uuid,
  _uploaded_by uuid, _original_filename text, _storage_path text, _sha256 text,
  _size_bytes bigint, _agent_version text, _generated_at timestamptz,
  _test_stage text, _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, created_at timestamptz, report_sequence integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _checklist public.checklists; _sequence integer; _is_admin boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  IF _test_stage NOT IN ('before_change','after_ont_change','noc_retest','additional_test') THEN RAISE EXCEPTION 'invalid_test_stage' USING ERRCODE = '22023'; END IF;
  IF _sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_sha256' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _checklist FROM public.checklists WHERE checklists.id = _checklist_id FOR SHARE;
  IF NOT FOUND OR _checklist.case_id <> _case_id THEN RAISE EXCEPTION 'invalid_checklist' USING ERRCODE = '22023'; END IF;
  IF _checklist.status <> 'finalizado' OR NOT _checklist.is_current THEN RAISE EXCEPTION 'checklist_not_current' USING ERRCODE = '40001'; END IF;
  SELECT public.has_role(_uploaded_by, 'admin'::public.app_role) INTO _is_admin;
  IF _checklist.tecnico_id <> _uploaded_by AND NOT COALESCE(_is_admin, false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_case_id::text || ':' || _test_stage, 91));
  SELECT COALESCE(MAX(r.report_sequence), 0) + 1 INTO _sequence
  FROM public.checklist_diagnostic_reports r WHERE r.case_id = _case_id AND r.test_stage = _test_stage;
  RETURN QUERY INSERT INTO public.checklist_diagnostic_reports (
    id, checklist_id, case_id, diagnostic_session_id, uploaded_by, original_filename,
    storage_path, sha256, size_bytes, mime_type, agent_version, generated_at,
    test_stage, report_sequence, metadata
  ) VALUES (
    _id, _checklist_id, _case_id, _diagnostic_session_id, _uploaded_by, _original_filename,
    _storage_path, _sha256, _size_bytes, 'application/pdf', _agent_version, _generated_at,
    _test_stage, _sequence, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING checklist_diagnostic_reports.id, checklist_diagnostic_reports.created_at,
              checklist_diagnostic_reports.report_sequence;
END;
$$;
REVOKE ALL ON FUNCTION public.link_diagnostic_report(
  uuid, uuid, uuid, uuid, uuid, text, text, text, bigint, text, timestamptz, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_diagnostic_report(
  uuid, uuid, uuid, uuid, uuid, text, text, text, bigint, text, timestamptz, text, jsonb
) TO service_role;
