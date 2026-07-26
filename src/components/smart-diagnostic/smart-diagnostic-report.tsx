/* eslint-disable react-refresh/only-export-components -- componentes exclusivos do renderizador de PDF */
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import type { DiagnosticEvaluation, SmartDiagnosticSession } from "@/lib/smart-diagnostic";
import { getDiagnosticDecisionTrail } from "@/lib/smart-diagnostic";
import type { AiDiagnosticReview } from "@/lib/smart-diagnostic-ai";

const C = {
  page: "#020817",
  panel: "#06152d",
  panel2: "#041126",
  border: "#1769db",
  cyan: "#19d8ff",
  green: "#45e35f",
  amber: "#ffb020",
  red: "#ff5268",
  text: "#f8fbff",
  muted: "#a9bad1",
};

const s = StyleSheet.create({
  page: {
    padding: 20,
    backgroundColor: C.page,
    color: C.text,
    fontFamily: "Helvetica",
    fontSize: 8.5,
  },
  frame: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#031027",
  },
  brand: { color: C.cyan, fontSize: 8, fontWeight: 700, letterSpacing: 1.5 },
  title: { marginTop: 5, color: C.text, fontSize: 20, fontWeight: 700 },
  subtitle: { marginTop: 3, color: C.muted, fontSize: 9 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
    marginTop: 10,
  },
  info: { width: "33.333%", paddingHorizontal: 3, paddingBottom: 6 },
  infoWide: { width: "66.666%" },
  infoBox: {
    minHeight: 37,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 6,
    backgroundColor: C.panel,
  },
  label: { color: C.muted, fontSize: 6.5 },
  value: { marginTop: 2, color: C.text, fontSize: 8.2, fontWeight: 700 },
  status: { color: C.green },
  panel: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 8,
    backgroundColor: C.panel,
  },
  panelTitle: { color: C.cyan, fontSize: 10.5, fontWeight: 700, marginBottom: 5 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1.4,
    borderBottomColor: "#1d5a9f",
    paddingVertical: 5.5,
    alignItems: "flex-start",
  },
  lastRow: { borderBottomWidth: 0 },
  number: {
    width: 27,
    paddingVertical: 2,
    borderRadius: 4,
    textAlign: "center",
    backgroundColor: "#0c45a5",
    color: C.text,
    fontSize: 7.5,
    fontWeight: 700,
  },
  question: { flex: 1, paddingHorizontal: 7, color: C.text, lineHeight: 1.35, fontSize: 9 },
  answer: {
    width: 90,
    color: C.green,
    fontSize: 7.8,
    fontWeight: 700,
    textAlign: "right",
  },
  detail: { marginTop: 3, color: C.muted, fontSize: 7.3, lineHeight: 1.4 },
  bullet: { color: C.text, marginBottom: 3.5, lineHeight: 1.4 },
  warning: {
    borderWidth: 1,
    borderColor: C.amber,
    borderRadius: 8,
    padding: 7,
    marginBottom: 5,
    backgroundColor: "#2a1d06",
  },
  danger: {
    borderWidth: 1,
    borderColor: C.red,
    borderRadius: 8,
    padding: 7,
    marginBottom: 5,
    backgroundColor: "#2a0710",
  },
  footer: {
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.muted,
    fontSize: 6.5,
  },
});

function Info({
  label,
  value,
  wide,
  status,
}: {
  label: string;
  value: string;
  wide?: boolean;
  status?: boolean;
}) {
  return (
    <View style={[s.info, wide ? s.infoWide : {}]}>
      <View style={s.infoBox}>
        <Text style={s.label}>{label}</Text>
        <Text style={[s.value, status ? s.status : {}]}>{value || "—"}</Text>
      </View>
    </View>
  );
}

function Footer({ session }: { session: SmartDiagnosticSession }) {
  return (
    <View style={s.footer}>
      <Text>Webifibra · Diagnóstico verificável · {session.engineVersion}</Text>
      <Text>
        Página <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
      </Text>
    </View>
  );
}

function Header({
  session,
  evaluation,
}: {
  session: SmartDiagnosticSession;
  evaluation: DiagnosticEvaluation;
}) {
  return (
    <>
      <Text style={s.brand}>WEBI FIBRA // WEBI NOC</Text>
      <Text style={s.title}>DIAGNÓSTICO DE MANUTENÇÃO</Text>
      <Text style={s.subtitle}>Checklist dinâmico, verificável, rastreável e auditável</Text>
      <View style={s.grid}>
        <Info label="Cliente" value={session.metadata.client} wide />
        <Info label="OS" value={session.metadata.workOrder} />
        <Info label="Cidade" value={session.metadata.city} />
        <Info
          label="Checklist vinculado"
          value={session.metadata.linkedChecklistCode || "Não vinculado"}
        />
        <Info label="Equipamento" value={session.metadata.equipmentModel || "Não informado"} />
        <Info label="Revisão" value={`R${session.metadata.revision?.revisionNumber ?? 1}`} />
        <Info
          label="Localização"
          value={
            session.metadata.location?.status === "captured"
              ? `capturada · precisão ${session.metadata.location.accuracyMeters ?? "—"} m`
              : session.metadata.location?.status === "denied"
                ? "permissão negada"
                : "não disponível"
          }
        />
        <Info label="Status" value={evaluation.statusLabel} wide status />
      </View>
    </>
  );
}

function DiagnosticDocument({
  session,
  evaluation,
  aiReview,
}: {
  session: SmartDiagnosticSession;
  evaluation: DiagnosticEvaluation;
  aiReview?: AiDiagnosticReview | null;
}) {
  const events = getDiagnosticDecisionTrail(session);
  const chunks = Array.from({ length: Math.max(1, Math.ceil(events.length / 10)) }, (_, index) =>
    events.slice(index * 10, index * 10 + 10),
  );

  return (
    <Document
      title={`Diagnóstico WebiCheck — OS ${session.metadata.workOrder || session.id}`}
      author="WebiCheck"
    >
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={s.page}>
          <View style={s.frame}>
            {pageIndex === 0 ? (
              <Header session={session} evaluation={evaluation} />
            ) : (
              <>
                <Text style={s.brand}>WEBI FIBRA // CONTINUAÇÃO</Text>
                <Text style={s.title}>TRILHA DE DECISÃO</Text>
                <Text style={s.subtitle}>
                  OS {session.metadata.workOrder || "—"} · sessão {session.id.slice(0, 8)}
                </Text>
              </>
            )}
            <View style={s.panel}>
              <Text style={s.panelTitle}>
                Verificações registradas · {pageIndex * 10 + 1} a {pageIndex * 10 + chunk.length}
              </Text>
              {chunk.length ? (
                chunk.map((event, index) => (
                  <View
                    key={event.id}
                    style={[s.row, index === chunk.length - 1 ? s.lastRow : {}]}
                    wrap={false}
                  >
                    <Text style={s.number}>
                      {String(pageIndex * 10 + index + 1).padStart(2, "0")}
                    </Text>
                    <View style={s.question}>
                      <Text>{event.question}</Text>
                      <Text style={s.detail}>
                        {event.category} · {new Date(event.createdAt).toLocaleString("pt-BR")} ·
                        origem: {event.origin}
                      </Text>
                    </View>
                    <Text style={s.answer}>{event.answerLabel}</Text>
                  </View>
                ))
              ) : (
                <Text style={s.detail}>Nenhuma verificação registrada.</Text>
              )}
            </View>
            {pageIndex === chunks.length - 1 ? (
              <>
                <View style={s.panel}>
                  <Text style={s.panelTitle}>Resultado determinístico</Text>
                  <Text style={s.bullet}>Causa provável: {evaluation.probableCause}</Text>
                  <Text style={s.bullet}>
                    Validações: {evaluation.validations.join("; ") || "NÃO INFORMADO"}
                  </Text>
                  <Text style={s.bullet}>
                    Hipóteses descartadas: {evaluation.eliminated.join("; ") || "Nenhuma"}
                  </Text>
                  <Text style={s.bullet}>
                    Troca de ONT:{" "}
                    {evaluation.ontExchange.eligibleToRequest
                      ? "apta para solicitação e revisão humana"
                      : "não liberada pelo motor de regras"}
                  </Text>
                  <Text style={s.bullet}>
                    Decisão operacional: {session.metadata.operation?.decision || "NÃO INFORMADA"}
                  </Text>
                  <Text style={s.bullet}>
                    Autorização NOC: {session.metadata.operation?.nocAuthorization || "PENDENTE"}
                  </Text>
                  <Text style={s.bullet}>
                    Reteste pós-troca: {session.metadata.operation?.postExchangeRetest || "NÃO REALIZADO"}
                  </Text>
                </View>
                {evaluation.divergences.length ? (
                  <View style={s.panel}>
                    <Text style={s.panelTitle}>Divergências determinísticas</Text>
                    {evaluation.divergences.map((item) => (
                      <View
                        key={item.code}
                        style={item.severity === "critical" ? s.danger : s.warning}
                      >
                        <Text>
                          {item.title} · {item.description}
                        </Text>
                        <Text style={s.detail}>Ação: {item.requiredAction}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            <Footer session={session} />
          </View>
        </Page>
      ))}

      {aiReview ? (
        <Page size="A4" style={s.page}>
          <View style={s.frame}>
            <Text style={s.brand}>WEBI FIBRA // ANÁLISE CONSULTIVA</Text>
            <Text style={s.title}>PARECER WEBI NOC — IA</Text>
            <Text style={s.subtitle}>
              A IA não autoriza trocas e não substitui o motor determinístico ou o NOC humano.
            </Text>
            <View style={s.grid}>
              <Info label="Status" value={aiReview.status} wide status />
              <Info label="Confiança consultiva" value={`${aiReview.confianca}%`} />
              <Info label="Modelo" value={aiReview.model} />
              <Info label="Provider" value={aiReview.provider || "NÃO INFORMADO"} />
              <Info label="Prompt" value={aiReview.promptVersion} />
              <Info
                label="Analisado em"
                value={new Date(aiReview.analyzedAt).toLocaleString("pt-BR")}
              />
            </View>
            <View style={s.panel}>
              <Text style={s.panelTitle}>Diagnóstico e justificativa</Text>
              <Text style={s.bullet}>Diagnóstico: {aiReview.diagnostico_provavel}</Text>
              <Text style={s.bullet}>Próxima ação: {aiReview.proxima_acao}</Text>
              <Text style={s.bullet}>Justificativa: {aiReview.justificativa}</Text>
              <Text style={s.bullet}>Resumo: {aiReview.resumo_tecnico}</Text>
            </View>
            <View style={s.panel}>
              <Text style={s.panelTitle}>Pendências e divergências</Text>
              <Text style={s.bullet}>
                Evidências faltantes: {aiReview.evidencias_faltantes.join("; ") || "Nenhuma"}
              </Text>
              <Text style={s.bullet}>
                Testes necessários: {aiReview.testes_necessarios.join("; ") || "Nenhum"}
              </Text>
              {aiReview.divergencias.map((item) => (
                <View
                  key={`${item.codigo}-${item.descricao}`}
                  style={item.severidade === "critica" ? s.danger : s.warning}
                >
                  <Text>
                    {item.codigo} · {item.descricao}
                  </Text>
                  <Text style={s.detail}>Ação: {item.acao_corretiva}</Text>
                </View>
              ))}
            </View>
            <Footer session={session} />
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

export async function downloadSmartDiagnosticReport({
  session,
  evaluation,
  aiReview,
}: {
  session: SmartDiagnosticSession;
  evaluation: DiagnosticEvaluation;
  aiReview?: AiDiagnosticReview | null;
}) {
  const blob = await pdf(
    <DiagnosticDocument session={session} evaluation={evaluation} aiReview={aiReview} />,
  ).toBlob();
  const safeOs =
    session.metadata.workOrder.replace(/[^A-Za-z0-9_-]/g, "") || session.id.slice(0, 8);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `diagnostico-webicheck-OS-${safeOs}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}
