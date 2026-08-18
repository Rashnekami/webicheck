import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import {
  REVIEW_GROUPS,
  formatScore,
  scoreLabel,
  type ScoreMap,
  groupAverage,
} from "@/lib/technical-review-catalog";

/* eslint-disable @typescript-eslint/no-explicit-any */

const C = {
  navy: "#0b2545",
  blue: "#1667c9",
  cyan: "#0e9fc4",
  ink: "#0f172a",
  muted: "#5b6b82",
  line: "#cfe0f5",
  card: "#f5f8fc",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 62,
    paddingBottom: 40,
    paddingHorizontal: 28,
    backgroundColor: C.white,
    color: C.ink,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.35,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: C.navy,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: C.white, fontSize: 12, fontFamily: "Helvetica-Bold" },
  headerSub: { color: "#a9c6ea", fontSize: 8 },
  section: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  label: { color: C.muted, fontSize: 8 },
  value: { fontSize: 9 },
  barTrack: {
    height: 7,
    backgroundColor: C.card,
    borderRadius: 4,
    marginTop: 3,
    marginBottom: 6,
  },
  barFill: { height: 7, backgroundColor: C.blue, borderRadius: 4 },
  scoreBig: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.navy },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    backgroundColor: C.card,
    padding: 4,
  },
  td: { fontSize: 8, padding: 4, borderTopWidth: 1, borderTopColor: C.line },
  sigBox: {
    borderTopWidth: 1,
    borderTopColor: C.ink,
    marginTop: 34,
    paddingTop: 4,
    fontSize: 8,
    textAlign: "center",
    width: "45%",
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
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
}

const FOLLOWUP_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  atingido: "Atingido",
  nao_atingido: "Não atingido",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 0, marginBottom: 4 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value && String(value).trim() ? value : "—"}</Text>
    </View>
  );
}

function AvaliacaoDocument(input: AvaliacaoPdfInput) {
  const { review, employee, scores, evidences, meeting, followups, finalScore } = input;
  const generated = new Date().toLocaleString("pt-BR");

  return (
    <Document title={`Avaliação Técnica — ${employee.full_name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.headerBar} fixed>
          <View>
            <Text style={s.headerTitle}>Avaliação Técnica Interna</Text>
            <Text style={s.headerSub}>CheckTecnico · documento confidencial</Text>
          </View>
          <Text style={s.headerSub}>{generated}</Text>
        </View>

        <View style={s.section}>
          <View style={s.row}>
            <View style={{ flexGrow: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: C.navy }}>
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
              <Text style={s.scoreBig}>{formatScore(finalScore)}</Text>
              <Text style={s.label}>{scoreLabel(finalScore)}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Desempenho por categoria</Text>
          {REVIEW_GROUPS.map((g) => {
            const avg = groupAverage(g, scores);
            const pct = avg ? Math.max(0, Math.min(100, (avg / 5) * 100)) : 0;
            const notes = review[g.notesColumn] as string | null;
            return (
              <View key={g.category} wrap={false}>
                <View style={s.row}>
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>
                    {g.title} <Text style={s.label}>(peso {Math.round(g.weight * 100)}%)</Text>
                  </Text>
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.blue }}>
                    {formatScore(avg)}
                  </Text>
                </View>
                <View style={s.barTrack}>
                  <View style={{ ...s.barFill, width: `${pct}%` }} />
                </View>
                {notes ? <Text style={{ ...s.label, marginBottom: 5 }}>{notes}</Text> : null}
              </View>
            );
          })}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Pontos fortes e desenvolvimento</Text>
          <View style={s.row}>
            <Field label="Pontos fortes" value={review.strengths_notes} />
            <Field label="Pontos de desenvolvimento" value={review.development_notes} />
          </View>
          <Field label="Observações gerais" value={review.general_notes} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Plano de desenvolvimento (PDI)</Text>
          <Field label="Objetivo" value={review.development_goal} />
          <Field label="Ação combinada" value={review.development_action} />
          <View style={s.row}>
            <Field label="Indicador" value={review.development_metric} />
            <Field label="Prazo" value={review.development_due_date} />
            <Field label="Próxima avaliação" value={review.next_review_date} />
          </View>
        </View>

        {evidences.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Evidências consideradas</Text>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ ...s.th, width: "22%" }}>Tipo</Text>
              <Text style={{ ...s.th, width: "20%" }}>OS / código</Text>
              <Text style={{ ...s.th, width: "58%" }}>Descrição</Text>
            </View>
            {evidences.map((e) => (
              <View key={e.id} style={{ flexDirection: "row" }} wrap={false}>
                <Text style={{ ...s.td, width: "22%" }}>{e.evidence_type}</Text>
                <Text style={{ ...s.td, width: "20%" }}>{e.os || "—"}</Text>
                <Text style={{ ...s.td, width: "58%" }}>{e.description || "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {meeting ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Conversa de feedback</Text>
            <View style={s.row}>
              <Field
                label="Data"
                value={new Date(meeting.meeting_date).toLocaleString("pt-BR")}
              />
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
          <View style={s.section}>
            <Text style={s.sectionTitle}>Acompanhamentos</Text>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ ...s.th, width: "18%" }}>Data</Text>
              <Text style={{ ...s.th, width: "20%" }}>Situação</Text>
              <Text style={{ ...s.th, width: "62%" }}>Resultado</Text>
            </View>
            {followups.map((f) => (
              <View key={f.id} style={{ flexDirection: "row" }} wrap={false}>
                <Text style={{ ...s.td, width: "18%" }}>{f.followup_date}</Text>
                <Text style={{ ...s.td, width: "20%" }}>
                  {FOLLOWUP_LABEL[f.status] ?? f.status}
                </Text>
                <Text style={{ ...s.td, width: "62%" }}>
                  {f.result || f.observation || "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ ...s.row, marginTop: 10 }}>
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
