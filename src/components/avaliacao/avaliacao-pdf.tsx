import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import {
  REVIEW_GROUPS,
  formatScore,
  scoreLabel,
  type ScoreMap,
  groupAverage,
} from "@/lib/technical-review-catalog";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Paleta dark estilo Grafana. */
const C = {
  bg: "#0b0f17",
  panel: "#141b26",
  panelAlt: "#182231",
  line: "#25303f",
  text: "#e6edf5",
  muted: "#8b98a9",
  blue: "#5794f2",
  green: "#73bf69",
  orange: "#ff9830",
  red: "#f2495c",
  purple: "#b877d9",
};

function scoreColor(score: number | null | undefined) {
  if (score == null) return C.muted;
  if (score >= 4.5) return C.green;
  if (score >= 3.5) return C.blue;
  if (score >= 2.5) return C.orange;
  return C.red;
}

const s = StyleSheet.create({
  page: {
    paddingTop: 58,
    paddingBottom: 38,
    paddingHorizontal: 24,
    backgroundColor: C.bg,
    color: C.text,
    fontFamily: "Helvetica",
    fontSize: 8.6,
    lineHeight: 1.35,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: C.panel,
    borderBottomWidth: 2,
    borderBottomColor: C.blue,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: C.text, fontSize: 12, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  headerSub: { color: C.muted, fontSize: 7.5 },
  panel: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    padding: 9,
    marginBottom: 8,
  },
  panelTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  label: { color: C.muted, fontSize: 7.4 },
  value: { fontSize: 8.6, color: C.text },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: C.panelAlt,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    padding: 7,
  },
  statValue: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  barTrack: { height: 6, backgroundColor: "#0d131c", borderRadius: 3, marginTop: 3, marginBottom: 5 },
  barFill: { height: 6, borderRadius: 3 },
  scoreBig: { fontSize: 26, fontFamily: "Helvetica-Bold" },
  th: {
    fontSize: 7.2,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    backgroundColor: C.panelAlt,
    padding: 3.5,
    letterSpacing: 0.4,
  },
  td: { fontSize: 7.6, padding: 3.5, borderTopWidth: 1, borderTopColor: C.line, color: C.text },
  aiBox: {
    backgroundColor: C.panelAlt,
    borderLeftWidth: 2,
    borderLeftColor: C.purple,
    borderRadius: 3,
    padding: 7,
    marginBottom: 6,
  },
  sigBox: {
    borderTopWidth: 1,
    borderTopColor: C.muted,
    marginTop: 30,
    paddingTop: 4,
    fontSize: 7.6,
    color: C.muted,
    textAlign: "center",
    width: "45%",
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 24,
    right: 24,
    fontSize: 6.6,
    color: C.muted,
    textAlign: "center",
  },
});

export interface AvaliacaoPdfInput {
  review: any;
  employee: { full_name: string; city: string | null };
  evaluatorName?: string;
  scores: ScoreMap;
  items: any[];
  evidences: any[];
  meeting: any | null;
  followups: any[];
  finalScore: number | null;
  /** Análises geradas pela IA (technical_employee_review_ai). */
  ai?: any[];
}

const FOLLOWUP_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  atingido: "Atingido",
  nao_atingido: "Não atingido",
};

const AI_LABEL: Record<string, string> = {
  gerencial: "Análise gerencial (IA)",
  solides: "Texto para o Sólides (IA)",
  conversa: "Roteiro de conversa (IA)",
  plano: "Plano de desenvolvimento (IA)",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 0, marginBottom: 4 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value && String(value).trim() ? value : "—"}</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.label}>{label}</Text>
      <Text style={{ ...s.statValue, color: color ?? C.text }}>{value}</Text>
    </View>
  );
}

function AvaliacaoDocument(input: AvaliacaoPdfInput) {
  const { review, employee, scores, items, evidences, meeting, followups, finalScore } = input;
  const generated = new Date().toLocaleString("pt-BR");
  const ai = (input.ai ?? []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const latestAi = new Map<string, any>();
  ai.forEach((a) => latestAi.set(a.analysis_type, a));

  const evaluated = Object.values(scores).filter((v) => typeof v === "number").length;
  const totalItems = REVIEW_GROUPS.reduce((acc, g) => acc + g.items.length, 0);
  const critical = REVIEW_GROUPS.map((g) => ({ g, avg: groupAverage(g, scores) }))
    .filter((x) => x.avg != null && (x.avg as number) < 3)
    .map((x) => x.g.title);
  const itemByKey = new Map((items ?? []).map((i: any) => [i.item_key, i]));
  const pendentes = (followups ?? []).filter((f) => f.status === "pendente" || f.status === "em_andamento").length;

  return (
    <Document title={`Avaliação Técnica — ${employee.full_name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.headerBar} fixed>
          <View>
            <Text style={s.headerTitle}>AVALIAÇÃO TÉCNICA INTERNA</Text>
            <Text style={s.headerSub}>CheckTécnico · documento confidencial de gestão de pessoas</Text>
          </View>
          <Text style={s.headerSub}>{generated}</Text>
        </View>

        <View style={s.panel}>
          <View style={s.row}>
            <View style={{ flexGrow: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: C.text }}>
                {employee.full_name}
              </Text>
              <Text style={s.label}>
                {review.employee_role || "Função não informada"}
                {employee.city ? ` · ${employee.city}` : ""}
              </Text>
              <Text style={{ ...s.label, marginTop: 4 }}>
                Período avaliado: {review.period_start} a {review.period_end}
              </Text>
              <Text style={s.label}>Avaliador: {input.evaluatorName || "—"}</Text>
              <Text style={s.label}>
                Situação: {review.status === "concluida" ? "Concluída" : "Rascunho"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ ...s.scoreBig, color: scoreColor(finalScore) }}>{formatScore(finalScore)}</Text>
              <Text style={s.label}>{scoreLabel(finalScore)}</Text>
            </View>
          </View>
        </View>

        <View style={{ ...s.row, marginBottom: 8 }}>
          <Stat label="ITENS AVALIADOS" value={`${evaluated}/${totalItems}`} />
          <Stat
            label="CATEGORIAS CRÍTICAS"
            value={String(critical.length)}
            color={critical.length ? C.red : C.green}
          />
          <Stat label="EVIDÊNCIAS" value={String(evidences.length)} color={C.blue} />
          <Stat label="ACOMP. EM ABERTO" value={String(pendentes)} color={pendentes ? C.orange : C.green} />
          <Stat label="ANÁLISES DE IA" value={String(ai.length)} color={ai.length ? C.purple : C.muted} />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>DESEMPENHO POR CATEGORIA</Text>
          {REVIEW_GROUPS.map((g) => {
            const avg = groupAverage(g, scores);
            const pct = avg ? Math.max(0, Math.min(100, (avg / 5) * 100)) : 0;
            const notes = review[g.notesColumn] as string | null;
            return (
              <View key={g.category} wrap={false}>
                <View style={s.row}>
                  <Text style={{ fontSize: 8.6, fontFamily: "Helvetica-Bold" }}>
                    {g.title} <Text style={s.label}>(peso {Math.round(g.weight * 100)}%)</Text>
                  </Text>
                  <Text style={{ fontSize: 8.6, fontFamily: "Helvetica-Bold", color: scoreColor(avg) }}>
                    {formatScore(avg)} · {scoreLabel(avg)}
                  </Text>
                </View>
                <View style={s.barTrack}>
                  <View style={{ ...s.barFill, width: `${pct}%`, backgroundColor: scoreColor(avg) }} />
                </View>
                {notes ? <Text style={{ ...s.label, marginBottom: 5 }}>{notes}</Text> : null}
              </View>
            );
          })}
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>DETALHAMENTO ITEM A ITEM</Text>
          {REVIEW_GROUPS.map((g) => (
            <View key={g.category} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.blue, marginBottom: 2 }}>
                {g.title}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Text style={{ ...s.th, width: "46%" }}>CRITÉRIO</Text>
                <Text style={{ ...s.th, width: "12%" }}>NOTA</Text>
                <Text style={{ ...s.th, width: "42%" }}>OBSERVAÇÃO</Text>
              </View>
              {g.items.map((it) => {
                const row: any = itemByKey.get(it.key);
                const score = (scores[it.key] ?? row?.score ?? null) as number | null;
                const na = row?.is_not_applicable;
                return (
                  <View key={it.key} style={{ flexDirection: "row" }} wrap={false}>
                    <Text style={{ ...s.td, width: "46%" }}>{it.label}</Text>
                    <Text style={{ ...s.td, width: "12%", color: na ? C.muted : scoreColor(score) }}>
                      {na ? "N/A" : score != null ? formatScore(score) : "—"}
                    </Text>
                    <Text style={{ ...s.td, width: "42%", color: C.muted }}>
                      {row?.observation || "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>PONTOS FORTES E DESENVOLVIMENTO</Text>
          <View style={s.row}>
            <Field label="Pontos fortes" value={review.strengths_notes} />
            <Field label="Pontos de desenvolvimento" value={review.development_notes} />
          </View>
          <Field label="Observações gerais" value={review.general_notes} />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>PLANO DE DESENVOLVIMENTO (PDI)</Text>
          <Field label="Objetivo" value={review.development_goal} />
          <Field label="Ação combinada" value={review.development_action} />
          <View style={s.row}>
            <Field label="Indicador" value={review.development_metric} />
            <Field label="Prazo" value={review.development_due_date} />
            <Field label="Próxima avaliação" value={review.next_review_date} />
          </View>
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>ANÁLISE DE INTELIGÊNCIA ARTIFICIAL</Text>
          {ai.length === 0 ? (
            <Text style={s.label}>Nenhuma análise de IA foi gerada para esta avaliação.</Text>
          ) : (
            Array.from(latestAi.entries()).map(([type, a]) => (
              <View key={a.id} style={s.aiBox} wrap={false}>
                <View style={s.row}>
                  <Text style={{ fontSize: 8.2, fontFamily: "Helvetica-Bold", color: C.purple }}>
                    {AI_LABEL[type] ?? type}
                  </Text>
                  <Text style={s.label}>
                    {a.model || "modelo não informado"} ·{" "}
                    {a.created_at ? new Date(a.created_at).toLocaleString("pt-BR") : "—"}
                  </Text>
                </View>
                <Text style={{ ...s.value, marginTop: 4 }}>{String(a.content || "").trim() || "—"}</Text>
              </View>
            ))
          )}
          {ai.length > 0 ? (
            <Text style={{ ...s.label, marginTop: 2 }}>
              Conteúdo gerado por IA a partir dos dados desta avaliação, revisado pelo gestor responsável.
              Não substitui a análise humana.
            </Text>
          ) : null}
        </View>

        {evidences.length > 0 ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>EVIDÊNCIAS CONSIDERADAS</Text>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ ...s.th, width: "18%" }}>TIPO</Text>
              <Text style={{ ...s.th, width: "16%" }}>OS / CÓDIGO</Text>
              <Text style={{ ...s.th, width: "50%" }}>DESCRIÇÃO</Text>
              <Text style={{ ...s.th, width: "16%" }}>REGISTRO</Text>
            </View>
            {evidences.map((e) => (
              <View key={e.id} style={{ flexDirection: "row" }} wrap={false}>
                <Text style={{ ...s.td, width: "18%" }}>{e.evidence_type}</Text>
                <Text style={{ ...s.td, width: "16%" }}>{e.os || "—"}</Text>
                <Text style={{ ...s.td, width: "50%" }}>{e.description || "—"}</Text>
                <Text style={{ ...s.td, width: "16%", color: C.muted }}>
                  {e.created_at ? new Date(e.created_at).toLocaleDateString("pt-BR") : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {meeting ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>CONVERSA DE FEEDBACK</Text>
            <View style={s.row}>
              <Field label="Data" value={new Date(meeting.meeting_date).toLocaleString("pt-BR")} />
              <Field label="Local" value={meeting.meeting_place} />
              <Field label="Reação do colaborador" value={meeting.employee_reaction} />
            </View>
            <Field label="Comentários do colaborador" value={meeting.employee_comments} />
            <Field label="Notas do gestor" value={meeting.supervisor_notes} />
            {meeting.new_information_presented ? (
              <Field label="Informação nova apresentada" value={meeting.new_information} />
            ) : null}
          </View>
        ) : null}

        {followups.length > 0 ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>ACOMPANHAMENTOS</Text>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ ...s.th, width: "18%" }}>DATA</Text>
              <Text style={{ ...s.th, width: "20%" }}>SITUAÇÃO</Text>
              <Text style={{ ...s.th, width: "62%" }}>RESULTADO</Text>
            </View>
            {followups.map((f) => (
              <View key={f.id} style={{ flexDirection: "row" }} wrap={false}>
                <Text style={{ ...s.td, width: "18%" }}>{f.followup_date}</Text>
                <Text style={{ ...s.td, width: "20%" }}>{FOLLOWUP_LABEL[f.status] ?? f.status}</Text>
                <Text style={{ ...s.td, width: "62%" }}>{f.result || f.observation || "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ ...s.row, marginTop: 8 }}>
          <Text style={s.sigBox}>Assinatura do gestor</Text>
          <Text style={s.sigBox}>Assinatura do colaborador</Text>
        </View>

        <Text style={s.footer} fixed>
          Documento interno de gestão de pessoas — uso restrito. Gerado em {generated}.
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadAvaliacaoPdf(input: AvaliacaoPdfInput) {
  const blob = await pdf(<AvaliacaoDocument {...input} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = input.employee.full_name.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
  link.href = url;
  link.download = `avaliacao-${slug}-${input.review.period_end}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
