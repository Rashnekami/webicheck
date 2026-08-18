// Canal Ético — triagem assistida por IA (uso interno e confidencial).
import { assertWbAccess } from "@/lib/whistleblower-admin.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = { supabase: any; userId: string };

export interface WbAiAnalysis {
  resumo: string;
  classificacao_risco: string;
  temas: string[];
  indicios: string[];
  lacunas: string[];
  sugestoes_apuracao: string[];
  risco_retaliacao: string;
  prazo_sugerido_dias: number;
  gerado_em: string;
  modelo: string;
}

function buildPrompt(payload: Record<string, unknown>) {
  return `Você é um analista de compliance de um canal de denúncias corporativo no Brasil.
Regras obrigatórias:
- Baseie-se APENAS nos dados fornecidos; nunca invente fatos, nomes ou datas.
- Não julgue pessoas; descreva apenas fatos relatados e hipóteses a apurar.
- Preserve o anonimato: não tente deduzir a identidade do denunciante.
- Português do Brasil, linguagem objetiva de compliance.

Dados da denúncia (JSON):
${JSON.stringify(payload, null, 2)}

Responda SOMENTE em JSON:
{"resumo":"3 a 5 linhas","classificacao_risco":"baixo|medio|alto|critico",
"temas":["..."],"indicios":["fatos objetivos relatados"],
"lacunas":["informações que faltam para apurar"],
"sugestoes_apuracao":["passos práticos de apuração"],
"risco_retaliacao":"baixo|medio|alto + justificativa curta",
"prazo_sugerido_dias":15}`;
}

export async function analyzeReport(context: Ctx, id: string): Promise<WbAiAnalysis> {
  const { db, providerId } = await assertWbAccess(context);
  const { data: report, error } = await db
    .from("whistleblower_reports")
    .select(
      "protocol, report_type, category_label, title, description, unit, city, department, location_description, incident_date, incident_time, people_involved, witnesses, frequency, priority, status, created_at",
    )
    .eq("id", id)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error || !report) throw new Error("Denúncia não encontrada.");

  const [{ data: messages }, { data: attachments }] = await Promise.all([
    db.from("whistleblower_messages").select("sender_type, message, created_at").eq("report_id", id).order("created_at"),
    db.from("whistleblower_attachments").select("display_name, mime_type, origin").eq("report_id", id),
  ]);

  const payload = {
    ...report,
    anexos: (attachments ?? []).map((a: any) => ({ nome: a.display_name, tipo: a.mime_type, origem: a.origin })),
    interacoes: (messages ?? []).map((m: any) => ({ de: m.sender_type, texto: m.message, em: m.created_at })),
  };

  const { runAiPrompt, parseAiJson } = await import("@/lib/ai-providers.server");
  const { raw, model } = await runAiPrompt(buildPrompt(payload));
  const parsed = parseAiJson(raw) as Record<string, unknown>;
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v.trim() : fallback);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((i) => String(i)).filter(Boolean) : []);

  const analysis: WbAiAnalysis = {
    resumo: str(parsed.resumo, "—"),
    classificacao_risco: str(parsed.classificacao_risco, "não classificado"),
    temas: list(parsed.temas),
    indicios: list(parsed.indicios),
    lacunas: list(parsed.lacunas),
    sugestoes_apuracao: list(parsed.sugestoes_apuracao),
    risco_retaliacao: str(parsed.risco_retaliacao, "não avaliado"),
    prazo_sugerido_dias: Number(parsed.prazo_sugerido_dias) || 15,
    gerado_em: new Date().toISOString(),
    modelo: model,
  };

  await db.from("whistleblower_access_logs").insert({
    provider_id: providerId,
    report_id: id,
    user_id: context.userId,
    action: "ai_analysis",
    metadata: { modelo: model, risco: analysis.classificacao_risco },
  });

  return analysis;
}
