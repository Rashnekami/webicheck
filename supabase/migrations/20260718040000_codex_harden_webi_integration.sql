-- Correções de segurança e integridade para as Fases 1–3.
-- Esta migration é aditiva: não reescreve o histórico já aplicado pelo Lovable.

-- As duas constraints abaixo duplicam garantias que já existiam no schema inicial.
ALTER TABLE public.checklist_document_snapshots
  DROP CONSTRAINT IF EXISTS uq_snapshots_checklist_version;
ALTER TABLE public.checklist_diagnostic_reports
  DROP CONSTRAINT IF EXISTS uq_diagnostic_case_session;

-- Mantém no máximo um snapshot público ativo por checklist.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY checklist_id
           ORDER BY version DESC, created_at DESC, id DESC
         ) AS rn
    FROM public.checklist_document_snapshots
   WHERE public_status = 'active'
)
UPDATE public.checklist_document_snapshots s
   SET public_status = 'replaced'
  FROM ranked r
 WHERE s.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_one_active_per_checklist
  ON public.checklist_document_snapshots (checklist_id)
  WHERE public_status = 'active';

-- Shape vazio compatível com o formulário React. Revisões preservam contexto,
-- mas nunca reutilizam respostas, testes, fotos ou assinatura do cliente.
CREATE OR REPLACE FUNCTION public.empty_checklist_revision_data(_tipo public.checklist_tipo)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _tipo = 'instalacao'::public.checklist_tipo THEN
      '{
        "itens": {
          "velocidade_ok": false,
          "navegacao_ok": false,
          "wifi_orientado": false,
          "placa_orientado": false,
          "cabo_orientado": false,
          "posicionamento_ok": false,
          "downdetector": false,
          "duvidas_sanadas": false
        },
        "velocidade": {"download": "", "upload": "", "ping_ms": ""},
        "observacoes": "",
        "assinatura_cliente": null
      }'::jsonb
    ELSE
      '{
        "sintoma": {
          "ont_nao_liga": false,
          "ont_reinicia": false,
          "perde_internet": false,
          "internet_cai_pon_acesa": false,
          "los_acende": false,
          "wifi_5g_desaparece": false,
          "wifi_ambas_desaparecem": false,
          "wifi_falha_cabo_ok": false,
          "lan_nao_funciona": false,
          "lentidao": false,
          "outro_texto": "",
          "falha_presenciada": null,
          "horario": ""
        },
        "validacao_fisica": {
          "tomada": false,
          "fonte": false,
          "outra_tomada": false,
          "outra_fonte": false,
          "patch_cord": false,
          "sem_dobras": false,
          "luz_verde_ok": false,
          "roseta_ok": false
        },
        "teste_cabeado": {
          "navegacao": false,
          "ping": false,
          "velocidade": false,
          "cabo_substituido": false,
          "download": "",
          "upload": "",
          "ping_ms": "",
          "funcionou": false,
          "apresentou_falha": false,
          "ont_reiniciou": false,
          "lan_falhou": false,
          "nao_testado": false
        },
        "teste_wifi": {
          "rede_24": false,
          "rede_5": false,
          "mais_aparelhos": false,
          "cabo_funcionando": false,
          "apenas_5g_desaparece": false,
          "ambas_desaparecem": false,
          "sem_internet": false,
          "um_aparelho": false,
          "nao_reproduzida": false
        },
        "evidencias_marcadas": {
          "etiqueta": false,
          "leds": false,
          "fonte": false,
          "teste_cabeado": false,
          "teste_wifi": false
        },
        "resultado_final": {
          "permaneceu": false,
          "parou": false,
          "nao_reproduzida": false,
          "encaminhado_noc": null,
          "interrompeu": null,
          "motivo": ""
        },
        "relato": "",
        "noc": {
          "autorizada": null,
          "analista": "",
          "data": "",
          "hora": "",
          "protocolo": ""
        }
      }'::jsonb
  END
$$;

REVOKE ALL ON FUNCTION public.empty_checklist_revision_data(public.checklist_tipo) FROM PUBLIC;

-- Revisões só podem nascer da versão corrente e finalizada. O advisory lock é
-- adquirido antes da segunda leitura para impedir duas cadeias concorrentes.
CREATE OR REPLACE FUNCTION public.create_checklist_revision(
  _parent_id uuid,
  _reason text,
  _stage text,
  _notes text DEFAULT NULL
)
RETURNS TABLE (id uuid, revision_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _parent public.checklists;
  _case_id uuid;
  _next_rev int;
  _new_id uuid;
  _is_admin boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF _stage NOT IN ('pre_change','post_ont_change','noc_retest','additional_test') THEN
    RAISE EXCEPTION 'invalid_stage_for_revision' USING ERRCODE = '22023';
  END IF;

  SELECT c.case_id INTO _case_id
    FROM public.checklists c
   WHERE c.id = _parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_case_id::text, 0));

  SELECT * INTO _parent
    FROM public.checklists
   WHERE id = _parent_id
   FOR UPDATE;

  IF NOT _parent.is_current THEN
    RAISE EXCEPTION 'parent_not_current' USING ERRCODE = '40001';
  END IF;

  SELECT public.has_role(_uid, 'admin'::public.app_role) INTO _is_admin;
  IF _parent.tecnico_id <> _uid AND NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _parent.status <> 'finalizado' THEN
    RAISE EXCEPTION 'parent_not_finalized' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(c.revision_number), 0) + 1
    INTO _next_rev
    FROM public.checklists c
   WHERE c.case_id = _parent.case_id;

  UPDATE public.checklists
     SET is_current = false
   WHERE case_id = _parent.case_id
     AND is_current = true;

  INSERT INTO public.checklists (
    tecnico_id, tipo, status,
    os, cliente, cidade, endereco, plano,
    modelo, serial, cto_porta,
    troca_realizada,
    modelo_ont_retirada, serial_ont_retirada,
    modelo_ont_instalada, serial_ont_instalada,
    numero_publico, codigo_validacao,
    data_atendimento, hora_atendimento, finalizado_em,
    case_id, parent_checklist_id,
    revision_number, revision_reason, revision_notes,
    service_stage, is_current, revised_at, revised_by,
    dados
  ) VALUES (
    _parent.tecnico_id, _parent.tipo, 'rascunho',
    _parent.os, _parent.cliente, _parent.cidade, _parent.endereco, _parent.plano,
    _parent.modelo, _parent.serial, _parent.cto_porta,
    _parent.troca_realizada,
    _parent.modelo_ont_retirada, _parent.serial_ont_retirada,
    _parent.modelo_ont_instalada, _parent.serial_ont_instalada,
    _parent.numero_publico, NULL,
    NULL, NULL, NULL,
    _parent.case_id, _parent.id,
    _next_rev, btrim(_reason), NULLIF(btrim(_notes), ''),
    _stage, true, now(), _uid,
    public.empty_checklist_revision_data(_parent.tipo)
  )
  RETURNING checklists.id INTO _new_id;

  UPDATE public.checklists
     SET superseded_by_checklist_id = _new_id
   WHERE id = _parent.id;

  id := _new_id;
  revision_number := _next_rev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_checklist_revision(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checklist_revision(uuid, text, text, text) TO authenticated;

-- Rate limit persistente, compartilhado por todas as instâncias serverless.
CREATE TABLE IF NOT EXISTS public.webi_api_rate_limits (
  token_id uuid NOT NULL REFERENCES public.webi_integration_tokens(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (token_id, action, window_started_at)
);

ALTER TABLE public.webi_api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_webi_rate_limit(
  _token_id uuid,
  _action text,
  _limit integer DEFAULT 30,
  _window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window timestamptz;
  _count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF _limit < 1 OR _window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_rate_limit' USING ERRCODE = '22023';
  END IF;

  _window := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / _window_seconds) * _window_seconds
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_token_id::text || ':' || _action || ':' || _window::text, 73)
  );

  INSERT INTO public.webi_api_rate_limits(token_id, action, window_started_at, request_count)
  VALUES (_token_id, _action, _window, 1)
  ON CONFLICT (token_id, action, window_started_at)
  DO UPDATE SET request_count = public.webi_api_rate_limits.request_count + 1
  RETURNING request_count INTO _count;

  DELETE FROM public.webi_api_rate_limits
   WHERE window_started_at < now() - interval '1 day';

  RETURN _count <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_webi_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_webi_rate_limit(uuid, text, integer, integer) TO service_role;

-- Reserva a sequência e cria o vínculo do relatório na mesma transação.
CREATE OR REPLACE FUNCTION public.link_diagnostic_report(
  _id uuid,
  _checklist_id uuid,
  _case_id uuid,
  _diagnostic_session_id uuid,
  _uploaded_by uuid,
  _original_filename text,
  _storage_path text,
  _sha256 text,
  _size_bytes bigint,
  _agent_version text,
  _generated_at timestamptz,
  _test_stage text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, created_at timestamptz, report_sequence integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _checklist public.checklists;
  _sequence integer;
  _is_admin boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF _test_stage NOT IN ('before_change','after_ont_change','noc_retest','additional_test') THEN
    RAISE EXCEPTION 'invalid_test_stage' USING ERRCODE = '22023';
  END IF;
  IF _sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_sha256' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _checklist
    FROM public.checklists
   WHERE checklists.id = _checklist_id
   FOR SHARE;

  IF NOT FOUND OR _checklist.case_id <> _case_id THEN
    RAISE EXCEPTION 'invalid_checklist' USING ERRCODE = '22023';
  END IF;
  IF _checklist.status <> 'finalizado' OR NOT _checklist.is_current THEN
    RAISE EXCEPTION 'checklist_not_current' USING ERRCODE = '40001';
  END IF;

  SELECT public.has_role(_uploaded_by, 'admin'::public.app_role) INTO _is_admin;
  IF _checklist.tecnico_id <> _uploaded_by AND NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_case_id::text || ':' || _test_stage, 91)
  );

  SELECT COALESCE(MAX(r.report_sequence), 0) + 1
    INTO _sequence
    FROM public.checklist_diagnostic_reports r
   WHERE r.case_id = _case_id
     AND r.test_stage = _test_stage;

  RETURN QUERY
  INSERT INTO public.checklist_diagnostic_reports (
    id, checklist_id, case_id, diagnostic_session_id, uploaded_by,
    original_filename, storage_path, sha256, size_bytes, mime_type,
    agent_version, generated_at, test_stage, report_sequence, metadata
  ) VALUES (
    _id, _checklist_id, _case_id, _diagnostic_session_id, _uploaded_by,
    _original_filename, _storage_path, _sha256, _size_bytes, 'application/pdf',
    _agent_version, _generated_at, _test_stage, _sequence,
    COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING checklist_diagnostic_reports.id,
            checklist_diagnostic_reports.created_at,
            checklist_diagnostic_reports.report_sequence;
END;
$$;

REVOKE ALL ON FUNCTION public.link_diagnostic_report(
  uuid, uuid, uuid, uuid, uuid, text, text, text, bigint, text, timestamptz, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_diagnostic_report(
  uuid, uuid, uuid, uuid, uuid, text, text, text, bigint, text, timestamptz, text, jsonb
) TO service_role;

-- Substituição de snapshot completamente atômica. Todas as versões ativas
-- anteriores são encerradas antes da inserção da nova versão.
CREATE OR REPLACE FUNCTION public.create_snapshot_version(
  _checklist_id uuid,
  _snapshot_data jsonb,
  _document_hash text,
  _public_token text,
  _finalized_at timestamptz,
  _created_by uuid
)
RETURNS TABLE (id uuid, version int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _previous_id uuid;
  _next_version integer;
  _new_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_checklist_id::text, 42));

  SELECT COALESCE(MAX(s.version), 0) + 1
    INTO _next_version
    FROM public.checklist_document_snapshots s
   WHERE s.checklist_id = _checklist_id;

  SELECT s.id
    INTO _previous_id
    FROM public.checklist_document_snapshots s
   WHERE s.checklist_id = _checklist_id
     AND s.public_status = 'active'
   ORDER BY s.version DESC
   LIMIT 1
   FOR UPDATE;

  UPDATE public.checklist_document_snapshots
     SET public_status = 'replaced'
   WHERE checklist_id = _checklist_id
     AND public_status = 'active';

  INSERT INTO public.checklist_document_snapshots (
    checklist_id, version, public_token, public_status,
    snapshot_data, document_hash, finalized_at, created_by
  ) VALUES (
    _checklist_id, _next_version, _public_token, 'active',
    _snapshot_data, _document_hash, _finalized_at, _created_by
  )
  RETURNING checklist_document_snapshots.id INTO _new_id;

  IF _previous_id IS NOT NULL THEN
    UPDATE public.checklist_document_snapshots
       SET replaced_by_snapshot_id = _new_id
     WHERE id = _previous_id;
  END IF;

  id := _new_id;
  version := _next_version;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_snapshot_version(uuid, jsonb, text, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_snapshot_version(uuid, jsonb, text, text, timestamptz, uuid) TO service_role;
