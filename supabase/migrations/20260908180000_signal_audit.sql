-- Auditoria privada de sinais ópticos (SmartOLT).
-- Critérios: diferença 1310 x 1490 > 3 dB OU qualquer leitura <= -25 dBm.
-- A importação é feita por cidade e pode consolidar vários CSVs/placas no mesmo lote.

CREATE TABLE public.signal_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city text NOT NULL CHECK (city IN ('Telêmaco Borba', 'Imbaú', 'Tibagi')),
  source_name text NOT NULL,
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  plate_count integer NOT NULL DEFAULT 1 CHECK (plate_count >= 1),
  source_row_count integer NOT NULL DEFAULT 0 CHECK (source_row_count >= 0),
  valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  flagged_row_count integer NOT NULL DEFAULT 0 CHECK (flagged_row_count >= 0),
  difference_threshold_db numeric(6,2) NOT NULL DEFAULT 3.00,
  low_signal_threshold_dbm numeric(6,2) NOT NULL DEFAULT -25.00,
  city_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signal_imports_owner_city_created_idx
  ON public.signal_imports (owner_id, city, created_at DESC);

CREATE TABLE public.signal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latest_import_id uuid NOT NULL REFERENCES public.signal_imports(id) ON DELETE CASCADE,
  sn text NOT NULL,
  onu_external_id text,
  onu_type text,
  customer_name text NOT NULL,
  olt text,
  board text,
  port text,
  allocated_onu text,
  zone text,
  address text,
  odb text,
  odb_port text,
  city text NOT NULL CHECK (city IN ('Telêmaco Borba', 'Imbaú', 'Tibagi')),
  signal_1310 numeric(7,2) NOT NULL,
  signal_1490 numeric(7,2) NOT NULL,
  difference_db numeric(7,2) NOT NULL CHECK (difference_db >= 0),
  issue_kind text NOT NULL CHECK (issue_kind IN ('desequilibrio', 'sinal_ruim', 'ambos')),
  severity text NOT NULL DEFAULT 'alto' CHECK (severity IN ('alto', 'critico')),
  present_in_latest_import boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_andamento', 'encerrado')),
  cause text CHECK (
    cause IS NULL OR cause IN (
      'ont', 'conector', 'acoplador', 'splitter', 'rede', 'fusao', 'fibra_drop',
      'cto_odb', 'porta_olt', 'patch_cord', 'atenuacao_externa', 'outro'
    )
  ),
  notes text,
  hubsoft_os text,
  assigned_technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_technician_name text,
  final_signal_1310 numeric(7,2),
  final_signal_1490 numeric(7,2),
  final_difference_db numeric(7,2),
  recurrence_count integer NOT NULL DEFAULT 0 CHECK (recurrence_count >= 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sn)
);

CREATE INDEX signal_cases_owner_status_city_idx
  ON public.signal_cases (owner_id, status, city);
CREATE INDEX signal_cases_owner_city_current_idx
  ON public.signal_cases (owner_id, city, present_in_latest_import, severity);
CREATE INDEX signal_cases_owner_board_port_idx
  ON public.signal_cases (owner_id, city, board, port);
CREATE INDEX signal_cases_owner_cause_idx
  ON public.signal_cases (owner_id, cause) WHERE cause IS NOT NULL;

CREATE TABLE public.signal_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES public.signal_imports(id) ON DELETE CASCADE,
  signal_case_id uuid NOT NULL REFERENCES public.signal_cases(id) ON DELETE CASCADE,
  city text NOT NULL,
  signal_1310 numeric(7,2) NOT NULL,
  signal_1490 numeric(7,2) NOT NULL,
  difference_db numeric(7,2) NOT NULL,
  issue_kind text NOT NULL CHECK (issue_kind IN ('desequilibrio', 'sinal_ruim', 'ambos')),
  severity text NOT NULL CHECK (severity IN ('alto', 'critico')),
  measured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, signal_case_id)
);

CREATE INDEX signal_measurements_owner_measured_idx
  ON public.signal_measurements (owner_id, measured_at DESC);

CREATE TABLE public.signal_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_case_id uuid NOT NULL REFERENCES public.signal_cases(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('aberto', 'em_andamento', 'encerrado')),
  cause text CHECK (
    cause IS NULL OR cause IN (
      'ont', 'conector', 'acoplador', 'splitter', 'rede', 'fusao', 'fibra_drop',
      'cto_odb', 'porta_olt', 'patch_cord', 'atenuacao_externa', 'outro'
    )
  ),
  notes text,
  hubsoft_os text,
  assigned_technician_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signal_case_events_owner_created_idx
  ON public.signal_case_events (owner_id, created_at DESC);

CREATE TABLE public.signal_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city text,
  model text NOT NULL,
  input_snapshot jsonb NOT NULL,
  analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signal_ai_analyses_owner_created_idx
  ON public.signal_ai_analyses (owner_id, created_at DESC);

ALTER TABLE public.signal_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY signal_imports_owner_admin_all ON public.signal_imports FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY signal_cases_owner_admin_all ON public.signal_cases FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY signal_measurements_owner_admin_all ON public.signal_measurements FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY signal_case_events_owner_admin_all ON public.signal_case_events FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY signal_ai_analyses_owner_admin_all ON public.signal_ai_analyses FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_case_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_ai_analyses TO authenticated;

CREATE OR REPLACE FUNCTION public.import_signal_audit(
  _city text,
  _source_name text,
  _source_files jsonb,
  _source_row_count integer,
  _valid_row_count integer,
  _rows jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
  _import_id uuid;
  _record jsonb;
  _case_id uuid;
  _issue_kind text;
  _severity text;
  _s1310 numeric;
  _s1490 numeric;
  _diff numeric;
BEGIN
  IF _owner_id IS NULL OR NOT public.has_role(_owner_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem importar sinais';
  END IF;
  IF _city NOT IN ('Telêmaco Borba', 'Imbaú', 'Tibagi') THEN
    RAISE EXCEPTION 'Cidade inválida para auditoria de sinais';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RAISE EXCEPTION 'A importação não contém sinais abaixo de -25 dBm nem diferenças acima de 3 dB';
  END IF;

  INSERT INTO public.signal_imports (
    owner_id, city, source_name, source_files, plate_count,
    source_row_count, valid_row_count, flagged_row_count, city_counts
  ) VALUES (
    _owner_id,
    _city,
    left(coalesce(nullif(trim(_source_name), ''), 'SmartOLT'), 240),
    coalesce(_source_files, '[]'::jsonb),
    greatest(coalesce(jsonb_array_length(coalesce(_source_files, '[]'::jsonb)), 1), 1),
    greatest(coalesce(_source_row_count, 0), 0),
    greatest(coalesce(_valid_row_count, 0), 0),
    jsonb_array_length(_rows),
    jsonb_build_object(_city, jsonb_array_length(_rows))
  ) RETURNING id INTO _import_id;

  -- Tudo que não reaparecer na nova coleta da cidade é marcado como normalizado/ausente.
  UPDATE public.signal_cases
     SET present_in_latest_import = false, updated_at = now()
   WHERE owner_id = _owner_id AND city = _city;

  FOR _record IN SELECT value FROM jsonb_array_elements(_rows)
  LOOP
    _s1310 := (_record->>'signal_1310')::numeric;
    _s1490 := (_record->>'signal_1490')::numeric;
    _diff := abs(_s1310 - _s1490);

    IF coalesce(_record->>'sn', '') = '' OR coalesce(_record->>'customer_name', '') = '' THEN
      RAISE EXCEPTION 'Linha de sinal inválida';
    END IF;
    IF NOT (_diff > 3 OR _s1310 <= -25 OR _s1490 <= -25) THEN
      RAISE EXCEPTION 'Linha fora dos critérios da auditoria';
    END IF;

    _issue_kind := CASE
      WHEN _diff > 3 AND (_s1310 <= -25 OR _s1490 <= -25) THEN 'ambos'
      WHEN _diff > 3 THEN 'desequilibrio'
      ELSE 'sinal_ruim'
    END;
    _severity := CASE
      WHEN least(_s1310, _s1490) <= -28 OR _diff >= 6 THEN 'critico'
      ELSE 'alto'
    END;

    INSERT INTO public.signal_cases (
      owner_id, latest_import_id, sn, onu_external_id, onu_type, customer_name,
      olt, board, port, allocated_onu, zone, address, odb, odb_port, city,
      signal_1310, signal_1490, difference_db, issue_kind, severity,
      present_in_latest_import
    ) VALUES (
      _owner_id, _import_id, _record->>'sn', nullif(_record->>'onu_external_id', ''),
      nullif(_record->>'onu_type', ''), _record->>'customer_name',
      nullif(_record->>'olt', ''), nullif(_record->>'board', ''),
      nullif(_record->>'port', ''), nullif(_record->>'allocated_onu', ''),
      nullif(_record->>'zone', ''), nullif(_record->>'address', ''),
      nullif(_record->>'odb', ''), nullif(_record->>'odb_port', ''),
      _city, _s1310, _s1490, round(_diff, 2), _issue_kind, _severity, true
    )
    ON CONFLICT (owner_id, sn) DO UPDATE SET
      latest_import_id = EXCLUDED.latest_import_id,
      onu_external_id = EXCLUDED.onu_external_id,
      onu_type = EXCLUDED.onu_type,
      customer_name = EXCLUDED.customer_name,
      olt = EXCLUDED.olt,
      board = EXCLUDED.board,
      port = EXCLUDED.port,
      allocated_onu = EXCLUDED.allocated_onu,
      zone = EXCLUDED.zone,
      address = EXCLUDED.address,
      odb = EXCLUDED.odb,
      odb_port = EXCLUDED.odb_port,
      city = EXCLUDED.city,
      signal_1310 = EXCLUDED.signal_1310,
      signal_1490 = EXCLUDED.signal_1490,
      difference_db = EXCLUDED.difference_db,
      issue_kind = EXCLUDED.issue_kind,
      severity = EXCLUDED.severity,
      present_in_latest_import = true,
      recurrence_count = signal_cases.recurrence_count + CASE WHEN signal_cases.status = 'encerrado' THEN 1 ELSE 0 END,
      cause = CASE WHEN signal_cases.status = 'encerrado' THEN NULL ELSE signal_cases.cause END,
      status = CASE WHEN signal_cases.status = 'encerrado' THEN 'aberto' ELSE signal_cases.status END,
      closed_at = CASE WHEN signal_cases.status = 'encerrado' THEN NULL ELSE signal_cases.closed_at END,
      last_seen_at = now(),
      updated_at = now()
    RETURNING id INTO _case_id;

    INSERT INTO public.signal_measurements (
      owner_id, import_id, signal_case_id, city, signal_1310, signal_1490,
      difference_db, issue_kind, severity
    ) VALUES (
      _owner_id, _import_id, _case_id, _city, _s1310, _s1490,
      round(_diff, 2), _issue_kind, _severity
    );
  END LOOP;

  RETURN _import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_signal_audit(text, text, jsonb, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_signal_audit(text, text, jsonb, integer, integer, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_signal_case(
  _case_id uuid,
  _status text,
  _cause text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _hubsoft_os text DEFAULT NULL,
  _assigned_technician_id uuid DEFAULT NULL,
  _assigned_technician_name text DEFAULT NULL,
  _final_signal_1310 numeric DEFAULT NULL,
  _final_signal_1490 numeric DEFAULT NULL
)
RETURNS public.signal_cases
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
  _updated public.signal_cases;
BEGIN
  IF _owner_id IS NULL OR NOT public.has_role(_owner_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem atualizar sinais';
  END IF;
  IF _status NOT IN ('aberto', 'em_andamento', 'encerrado') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;
  IF _status = 'encerrado' AND nullif(_cause, '') IS NULL THEN
    RAISE EXCEPTION 'Informe a causa antes de encerrar';
  END IF;

  UPDATE public.signal_cases SET
    status = _status,
    cause = nullif(_cause, ''),
    notes = nullif(trim(coalesce(_notes, '')), ''),
    hubsoft_os = nullif(trim(coalesce(_hubsoft_os, '')), ''),
    assigned_technician_id = _assigned_technician_id,
    assigned_technician_name = nullif(trim(coalesce(_assigned_technician_name, '')), ''),
    final_signal_1310 = _final_signal_1310,
    final_signal_1490 = _final_signal_1490,
    final_difference_db = CASE
      WHEN _final_signal_1310 IS NOT NULL AND _final_signal_1490 IS NOT NULL
        THEN round(abs(_final_signal_1310 - _final_signal_1490), 2)
      ELSE NULL
    END,
    started_at = CASE
      WHEN _status = 'em_andamento' AND started_at IS NULL THEN now()
      ELSE started_at
    END,
    closed_at = CASE WHEN _status = 'encerrado' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = _case_id AND owner_id = _owner_id
  RETURNING * INTO _updated;

  IF _updated.id IS NULL THEN RAISE EXCEPTION 'Caso não encontrado'; END IF;

  INSERT INTO public.signal_case_events (
    owner_id, signal_case_id, status, cause, notes, hubsoft_os, assigned_technician_name
  ) VALUES (
    _owner_id, _case_id, _status, nullif(_cause, ''),
    nullif(trim(coalesce(_notes, '')), ''),
    nullif(trim(coalesce(_hubsoft_os, '')), ''),
    nullif(trim(coalesce(_assigned_technician_name, '')), '')
  );

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_signal_case(uuid, text, text, text, text, uuid, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_signal_case(uuid, text, text, text, text, uuid, text, numeric, numeric) TO authenticated;
