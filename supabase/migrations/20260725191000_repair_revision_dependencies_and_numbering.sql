-- Reparo idempotente da cadeia de revisões.
-- 1. Restaura a função auxiliar em ambientes que receberam migrations parciais.
-- 2. Permite que R1/R2 compartilhem o número-base, mantendo unicidade por revisão.
-- 3. Reinstala a RPC corrigida e preserva o ticket da troca.

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
          "ont_queimada": false,
          "ont_danificada_cliente": false,
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
          "aplicabilidade": null,
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
          "download": "",
          "upload": "",
          "ping_ms": "",
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
          "motivo": "",
          "executar_diagnostico_pos_troca": false
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


ALTER TABLE public.checklists
  DROP CONSTRAINT IF EXISTS checklists_numero_publico_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_checklists_numero_publico_revision
  ON public.checklists (numero_publico, revision_number)
  WHERE numero_publico IS NOT NULL;

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

  SELECT c.* INTO _parent
    FROM public.checklists AS c
   WHERE c.id = _parent_id
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

  UPDATE public.checklists AS c
     SET is_current = false
   WHERE c.case_id = _parent.case_id
     AND c.is_current = true;

  INSERT INTO public.checklists (
    tecnico_id, tipo, status,
    os, cliente, cidade, endereco, plano,
    modelo, serial, cto_porta,
    troca_realizada,
    modelo_ont_retirada, serial_ont_retirada,
    modelo_ont_instalada, serial_ont_instalada,
    exchange_ticket_code,
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
    _parent.exchange_ticket_code,
    _parent.numero_publico, NULL,
    NULL, NULL, NULL,
    _parent.case_id, _parent.id,
    _next_rev, btrim(_reason), NULLIF(btrim(_notes), ''),
    _stage, true, now(), _uid,
    public.empty_checklist_revision_data(_parent.tipo)
  )
  RETURNING checklists.id INTO _new_id;

  UPDATE public.checklists AS c
     SET superseded_by_checklist_id = _new_id
   WHERE c.id = _parent.id;

  id := _new_id;
  revision_number := _next_rev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_checklist_revision(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checklist_revision(uuid, text, text, text) TO authenticated;

