-- Auditoria privada de desequilíbrio óptico (Signal 1310 x Signal 1490).
-- Cada registro pertence ao administrador que realizou a importação.

CREATE TABLE public.signal_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_row_count integer NOT NULL DEFAULT 0 CHECK (source_row_count >= 0),
  valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  flagged_row_count integer NOT NULL DEFAULT 0 CHECK (flagged_row_count >= 0),
  threshold_db numeric(6,2) NOT NULL DEFAULT 3.00,
  city_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signal_imports_owner_created_idx
  ON public.signal_imports (owner_id, created_at DESC);

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
  city text NOT NULL,
  signal_1310 numeric(7,2) NOT NULL,
  signal_1490 numeric(7,2) NOT NULL,
  difference_db numeric(7,2) NOT NULL CHECK (difference_db > 3),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_andamento', 'encerrado')),
  cause text CHECK (
    cause IS NULL OR cause IN (
      'ont', 'conector', 'splitter', 'fusao', 'fibra_drop', 'cto_odb',
      'porta_olt', 'patch_cord', 'atenuacao_externa', 'outro'
    )
  ),
  notes text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sn)
);

CREATE INDEX signal_cases_owner_import_idx
  ON public.signal_cases (owner_id, latest_import_id);
CREATE INDEX signal_cases_owner_status_city_idx
  ON public.signal_cases (owner_id, status, city);

CREATE TABLE public.signal_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES public.signal_imports(id) ON DELETE CASCADE,
  signal_case_id uuid NOT NULL REFERENCES public.signal_cases(id) ON DELETE CASCADE,
  city text NOT NULL,
  signal_1310 numeric(7,2) NOT NULL,
  signal_1490 numeric(7,2) NOT NULL,
  difference_db numeric(7,2) NOT NULL,
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
      'ont', 'conector', 'splitter', 'fusao', 'fibra_drop', 'cto_odb',
      'porta_olt', 'patch_cord', 'atenuacao_externa', 'outro'
    )
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signal_case_events_owner_created_idx
  ON public.signal_case_events (owner_id, created_at DESC);

ALTER TABLE public.signal_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY signal_imports_owner_admin_all
  ON public.signal_imports FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY signal_cases_owner_admin_all
  ON public.signal_cases FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY signal_measurements_owner_admin_all
  ON public.signal_measurements FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY signal_case_events_owner_admin_all
  ON public.signal_case_events FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_case_events TO authenticated;

CREATE OR REPLACE FUNCTION public.import_signal_audit(
  _source_name text,
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
  _city_counts jsonb;
BEGIN
  IF _owner_id IS NULL OR NOT public.has_role(_owner_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem importar sinais';
  END IF;

  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RAISE EXCEPTION 'A importação não contém casos com diferença acima de 3 dB';
  END IF;

  SELECT COALESCE(jsonb_object_agg(city, total), '{}'::jsonb)
    INTO _city_counts
    FROM (
      SELECT value->>'city' AS city, count(*) AS total
      FROM jsonb_array_elements(_rows)
      GROUP BY value->>'city'
    ) counts;

  INSERT INTO public.signal_imports (
    owner_id, source_name, source_row_count, valid_row_count,
    flagged_row_count, city_counts
  ) VALUES (
    _owner_id, left(coalesce(nullif(trim(_source_name), ''), 'arquivo.csv'), 240),
    greatest(coalesce(_source_row_count, 0), 0),
    greatest(coalesce(_valid_row_count, 0), 0),
    jsonb_array_length(_rows), _city_counts
  ) RETURNING id INTO _import_id;

  FOR _record IN SELECT value FROM jsonb_array_elements(_rows)
  LOOP
    IF coalesce(_record->>'sn', '') = ''
       OR coalesce(_record->>'customer_name', '') = ''
       OR coalesce(_record->>'city', '') = ''
       OR ((_record->>'difference_db')::numeric <= 3) THEN
      RAISE EXCEPTION 'Linha de sinal inválida';
    END IF;

    INSERT INTO public.signal_cases (
      owner_id, latest_import_id, sn, onu_external_id, onu_type,
      customer_name, olt, board, port, allocated_onu, zone, address,
      odb, odb_port, city, signal_1310, signal_1490, difference_db
    ) VALUES (
      _owner_id, _import_id, _record->>'sn', nullif(_record->>'onu_external_id', ''),
      nullif(_record->>'onu_type', ''), _record->>'customer_name',
      nullif(_record->>'olt', ''), nullif(_record->>'board', ''),
      nullif(_record->>'port', ''), nullif(_record->>'allocated_onu', ''),
      nullif(_record->>'zone', ''), nullif(_record->>'address', ''),
      nullif(_record->>'odb', ''), nullif(_record->>'odb_port', ''),
      _record->>'city', (_record->>'signal_1310')::numeric,
      (_record->>'signal_1490')::numeric, (_record->>'difference_db')::numeric
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
      last_seen_at = now(),
      updated_at = now()
    RETURNING id INTO _case_id;

    INSERT INTO public.signal_measurements (
      owner_id, import_id, signal_case_id, city,
      signal_1310, signal_1490, difference_db
    ) VALUES (
      _owner_id, _import_id, _case_id, _record->>'city',
      (_record->>'signal_1310')::numeric, (_record->>'signal_1490')::numeric,
      (_record->>'difference_db')::numeric
    );
  END LOOP;

  RETURN _import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_signal_audit(text, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_signal_audit(text, integer, integer, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_signal_case(
  _case_id uuid,
  _status text,
  _cause text DEFAULT NULL,
  _notes text DEFAULT NULL
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
    started_at = CASE
      WHEN _status = 'em_andamento' AND started_at IS NULL THEN now()
      ELSE started_at
    END,
    closed_at = CASE WHEN _status = 'encerrado' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = _case_id AND owner_id = _owner_id
  RETURNING * INTO _updated;

  IF _updated.id IS NULL THEN
    RAISE EXCEPTION 'Caso não encontrado';
  END IF;

  INSERT INTO public.signal_case_events (
    owner_id, signal_case_id, status, cause, notes
  ) VALUES (
    _owner_id, _case_id, _status, nullif(_cause, ''),
    nullif(trim(coalesce(_notes, '')), '')
  );

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_signal_case(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_signal_case(uuid, text, text, text) TO authenticated;
