-- 1) Novo valor de enum
ALTER TYPE public.checklist_tipo ADD VALUE IF NOT EXISTS 'remapeamento_cto';

-- 2) Atualiza função de rascunho vazio (usa cast textual para evitar validação
--    do literal do enum na mesma transação em que ele acabou de ser adicionado).
CREATE OR REPLACE FUNCTION public.empty_checklist_revision_data(_tipo public.checklist_tipo)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _tipo::text = 'instalacao' THEN
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
    WHEN _tipo::text = 'remapeamento_cto' THEN
      '{
        "identificacao": {"setor": "", "cto_codigo": ""},
        "localizacao": {
          "gps_original": null,
          "confirmada": null,
          "distancia_m": null
        },
        "splitter": {"tipo": null, "tipo_outro": "", "potencia_entrada_dbm": ""},
        "alimentacao": {"cabo": "", "tubo": "", "fibra": "", "cor_fibra": "", "origem": "", "observacao": ""},
        "portas": [],
        "fusao": {"necessaria": null, "itens": []},
        "resultado": {"estado": null, "pendencia": ""}
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
          "tomada": false, "fonte": false, "outra_tomada": false, "outra_fonte": false,
          "patch_cord": false, "sem_dobras": false, "luz_verde_ok": false, "roseta_ok": false
        },
        "teste_cabeado": {
          "aplicabilidade": null,
          "navegacao": false, "ping": false, "velocidade": false, "cabo_substituido": false,
          "download": "", "upload": "", "ping_ms": "",
          "funcionou": false, "apresentou_falha": false, "ont_reiniciou": false,
          "lan_falhou": false, "nao_testado": false
        },
        "teste_wifi": {
          "rede_24": false, "rede_5": false, "mais_aparelhos": false, "cabo_funcionando": false,
          "download": "", "upload": "", "ping_ms": "",
          "apenas_5g_desaparece": false, "ambas_desaparecem": false, "sem_internet": false,
          "um_aparelho": false, "nao_reproduzida": false
        },
        "evidencias_marcadas": {
          "etiqueta": false, "leds": false, "fonte": false, "teste_cabeado": false, "teste_wifi": false
        },
        "resultado_final": {
          "permaneceu": false, "parou": false, "nao_reproduzida": false,
          "encaminhado_noc": null, "interrompeu": null, "motivo": "",
          "executar_diagnostico_pos_troca": false
        },
        "relato": "",
        "noc": {"autorizada": null, "analista": "", "data": "", "hora": "", "protocolo": ""}
      }'::jsonb
  END
$function$;