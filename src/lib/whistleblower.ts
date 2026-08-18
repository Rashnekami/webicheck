// Canal Ético — tipos e utilitários compartilhados (seguros para o cliente).

export type ReportType = "ANONYMOUS" | "IDENTIFIED";

export const WB_STATUS = [
  "RECEBIDA",
  "EM_ANALISE",
  "AGUARDANDO_INFORMACOES",
  "EM_INVESTIGACAO",
  "ENCAMINHADA",
  "CONCLUIDA",
  "ARQUIVADA",
] as const;
export type WbStatus = (typeof WB_STATUS)[number];

export const WB_STATUS_LABEL: Record<WbStatus, string> = {
  RECEBIDA: "Recebida",
  EM_ANALISE: "Em análise",
  AGUARDANDO_INFORMACOES: "Aguardando informações",
  EM_INVESTIGACAO: "Em investigação",
  ENCAMINHADA: "Encaminhada",
  CONCLUIDA: "Concluída",
  ARQUIVADA: "Arquivada",
};

export const WB_PRIORITY = ["BAIXA", "MEDIA", "ALTA", "CRITICA"] as const;
export type WbPriority = (typeof WB_PRIORITY)[number];
export const WB_PRIORITY_LABEL: Record<WbPriority, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export const WB_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "assedio_moral", label: "Assédio moral" },
  { slug: "assedio_sexual", label: "Assédio sexual" },
  { slug: "discriminacao", label: "Discriminação" },
  { slug: "ameaca", label: "Ameaça" },
  { slug: "violencia", label: "Violência" },
  { slug: "fraude", label: "Fraude" },
  { slug: "furto", label: "Furto" },
  { slug: "desvio_recursos", label: "Desvio de recursos" },
  { slug: "corrupcao", label: "Corrupção" },
  { slug: "conflito_interesse", label: "Conflito de interesse" },
  { slug: "conduta_inadequada", label: "Conduta inadequada" },
  { slug: "descumprimento_normas", label: "Descumprimento de normas" },
  { slug: "seguranca_trabalho", label: "Segurança do trabalho" },
  { slug: "uso_indevido_recursos", label: "Uso indevido de recursos da empresa" },
  { slug: "lideranca", label: "Problemas relacionados à liderança" },
  { slug: "outro", label: "Outro" },
];

export const WB_MAX_FILES = 5;
export const WB_MAX_FILE_BYTES = 6 * 1024 * 1024;
export const WB_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export type PublicReportView = {
  protocol: string;
  categoryLabel: string;
  title: string;
  description: string;
  reportType: ReportType;
  status: WbStatus;
  priority?: WbPriority;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  unit: string | null;
  city: string | null;
  department: string | null;
  locationDescription: string | null;
  incidentDate: string | null;
  incidentTime: string | null;
  peopleInvolved: string | null;
  witnesses: string | null;
  frequency: string | null;
  validationCode: string;
  timeline: { at: string; label: string }[];
  messages: { id: string; sender: "REPORTER" | "RH"; message: string; at: string }[];
  attachments: { id: string; name: string; at: string; origin: "REPORTER" | "RH" }[];
};

export function formatWbDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatProtocolInput(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
