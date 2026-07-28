import { z } from "zod";

export const TIPO_MANUTENCAO_OPCOES = [
  { value: "corretiva", label: "Corretiva — falha reportada pelo cliente" },
  { value: "preventiva", label: "Preventiva — inspeção programada" },
  { value: "troca_ont", label: "Troca de ONT — substituição de equipamento" },
  { value: "reincidencia", label: "Reincidência — retorno ao mesmo cliente" },
  { value: "garantia", label: "Garantia — equipamento novo com defeito" },
  { value: "outro", label: "Outro" },
] as const;

export type TipoManutencao = (typeof TIPO_MANUTENCAO_OPCOES)[number]["value"];

export function labelTipoManutencao(value: string | null | undefined): string {
  if (!value) return "—";
  return TIPO_MANUTENCAO_OPCOES.find((item) => item.value === value)?.label ?? value;
}

export const RECOMENDACAO_LABEL: Record<string, string> = {
  trocar_ont: "Trocar a ONT",
  escalar_noc: "Escalar para o NOC",
  orientar_cliente: "Orientar o cliente",
  retornar_ao_local: "Retornar ao local",
  nenhuma_acao: "Nenhuma ação adicional",
};

export const aiAnalysisSchema = z.object({
  diagnostico_provavel: z.string(),
  causa_raiz: z.string(),
  recomendacao: z.enum([
    "trocar_ont",
    "escalar_noc",
    "orientar_cliente",
    "retornar_ao_local",
    "nenhuma_acao",
  ]),
  justificativa: z.string(),
  inconsistencias: z.array(z.string()),
  resumo_tecnico: z.string(),
});

export type AiAnalysisResult = z.infer<typeof aiAnalysisSchema>;

export interface StoredAiAnalysis extends AiAnalysisResult {
  gerado_em: string;
  modelo_ia: string;
  tipo_manutencao: string | null;
}
