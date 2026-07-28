import { PONTO_LABEL, routeLengthMeters, signalGainDb } from "@/lib/intervencao";
import type { IntervencaoData } from "@/lib/checklist-schema";

const TIPO_CONTEXTO: Record<string, string> = {
  rompimento:
    "Trata-se de um ROMPIMENTO de fibra óptica: houve interrupção do serviço e a equipe executou reparo (fusões e/ou lançamento de cabo).",
  readequacao:
    "Trata-se de uma READEQUAÇÃO de rede: remanejamento/reorganização de rota ou infraestrutura, normalmente programada.",
  melhoria_sinal:
    "Trata-se de uma MELHORIA DE SINAL: correção de atenuação óptica, com potência medida antes e depois da intervenção.",
};

/**
 * Monta o prompt de revisão consultiva da intervenção de rede.
 * Executa apenas no servidor (importado dentro de server functions).
 */
export function buildIntervencaoPrompt(args: {
  tipo: string;
  cidade: string | null;
  os: string | null;
  dados: IntervencaoData;
}): string {
  const d = args.dados;
  const pontos = (d.rota?.pontos ?? []).map((p) => ({
    tipo: PONTO_LABEL[p.tipo] ?? p.tipo,
    lat: p.lat,
    lng: p.lng,
    descricao: p.descricao,
  }));
  const extensaoCalculada = routeLengthMeters(d.rota?.pontos ?? []);
  const ganho = signalGainDb(d.sinal?.antes_dbm, d.sinal?.depois_dbm);

  const resumo = {
    tipo_intervencao: args.tipo,
    ordem_servico: args.os,
    cidade: args.cidade,
    contexto: d.contexto,
    rota: {
      pontos,
      extensao_informada_m: d.rota?.extensao_estimada_m || null,
      extensao_calculada_pelos_pontos_m: extensaoCalculada,
      snapshot_cartografico_gerado: Boolean(d.rota?.snapshot?.snapshot_path),
    },
    materiais: d.materiais,
    otdr: {
      realizado: d.otdr?.realizado,
      medicoes: d.otdr?.medicoes ?? [],
      laudos_anexados: (d.otdr?.laudos ?? []).length,
    },
    sinal: { ...d.sinal, ganho_db_calculado: ganho },
    execucao: d.execucao,
    resultado: d.resultado,
  };

  return `Você é um engenheiro sênior de planta externa FTTH revisando o registro de uma intervenção de rede executada por uma equipe de campo.

${TIPO_CONTEXTO[args.tipo] ?? ""}

Como avaliar:
- Julgue a coerência técnica entre causa declarada, materiais aplicados, medições OTDR e resultado final.
- Em melhoria de sinal, "ganho_db_calculado" positivo significa potência menos negativa (melhor). Ganho abaixo de 1 dB raramente justifica a intervenção como resolvida.
- Em rompimento, espere pelo menos uma fusão registrada e OTDR pós-reparo. A ausência disso é inconsistência real.
- Se "extensao_calculada_pelos_pontos_m" divergir muito da informada, aponte.
- Não invente dados. Se algo essencial faltou, liste em "inconsistencias".

Responda **exclusivamente** em JSON válido (sem markdown) no schema:
{
  "diagnostico_provavel": string,
  "causa_raiz": string,
  "recomendacao": "concluir_intervencao" | "refazer_fusao" | "escalar_noc" | "retornar_ao_local" | "abrir_readequacao" | "nenhuma_acao",
  "justificativa": string,
  "inconsistencias": string[],
  "resumo_tecnico": string
}

Regras:
- Português técnico, direto, sem enfeites.
- "resumo_tecnico": no máximo 4 linhas, adequado para colar no PDF do laudo.
- "inconsistencias": apenas contradições ou lacunas reais; caso não existam, retorne [].

Intervenção (JSON):
${JSON.stringify(resumo, null, 2)}`;
}
