import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { WB_PRIORITY_LABEL, WB_STATUS_LABEL, formatWbDate, type WbPriority, type WbStatus } from "@/lib/whistleblower";

/* eslint-disable @typescript-eslint/no-explicit-any */

const C = { page: "#0a0f1c", panel: "#121b30", accent: "#ffb648", soft: "#93a5c4", text: "#f4f7ff", red: "#ff6b7d" };

const s = StyleSheet.create({
  page: { padding: 26, backgroundColor: C.page, color: C.text, fontFamily: "Helvetica", fontSize: 9 },
  header: { borderBottomWidth: 1.5, borderBottomColor: C.accent, paddingBottom: 10, marginBottom: 12 },
  brand: { fontSize: 15, letterSpacing: 1.2 },
  confidential: { fontSize: 9, color: C.red, marginTop: 4, letterSpacing: 1 },
  card: { backgroundColor: C.panel, borderRadius: 8, padding: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 9.5, color: C.accent, letterSpacing: 0.8, marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "33.3%", marginBottom: 6, paddingRight: 8 },
  label: { fontSize: 7, color: C.soft, marginBottom: 2 },
  value: { fontSize: 9 },
  body: { fontSize: 9, lineHeight: 1.45 },
  item: { marginBottom: 5 },
  meta: { fontSize: 7.5, color: C.soft },
});

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={s.value}>{value || "—"}</Text>
    </View>
  );
}

export type InternalPdfInput = {
  report: any;
  messages: any[];
  history: any[];
  notes: any[];
  attachments: any[];
  logs: any[];
  names: Record<string, string>;
  /** Triagem gerada por IA (opcional). */
  ai?: any | null;
};


export function DenunciaInternaPdfDocument({ data }: { data: InternalPdfInput }) {
  const { report, messages, history, notes, attachments, logs, names, ai } = data;

  return (
    <Document title={`CONFIDENCIAL - ${report.protocol}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>CANAL DE DENÚNCIAS — RELATÓRIO INTERNO</Text>
          <Text style={s.confidential}>CONFIDENCIAL — USO INTERNO</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>IDENTIFICAÇÃO</Text>
          <View style={s.row}>
            <Field label="Protocolo" value={report.protocol} />
            <Field label="Recebida em" value={formatWbDate(report.created_at)} />
            <Field label="Tipo" value={report.report_type === "ANONYMOUS" ? "ANÔNIMA" : "IDENTIFICADA"} />
            <Field label="Categoria" value={report.category_label} />
            <Field label="Status" value={WB_STATUS_LABEL[report.status as WbStatus]} />
            <Field label="Prioridade" value={WB_PRIORITY_LABEL[report.priority as WbPriority]} />
            <Field label="Unidade" value={report.unit} />
            <Field label="Cidade" value={report.city} />
            <Field label="Responsável" value={report.assigned_to ? names[report.assigned_to] : null} />
          </View>
          {report.report_type === "IDENTIFIED" ? (
            <View style={s.row}>
              <Field label="Nome informado" value={report.identified_name} />
              <Field label="E-mail" value={report.identified_email} />
              <Field label="Telefone" value={report.identified_phone} />
            </View>
          ) : null}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>RELATO</Text>
          <Text style={[s.value, { marginBottom: 6 }]}>{report.title}</Text>
          <Text style={s.body}>{report.description}</Text>
          <View style={[s.row, { marginTop: 8 }]}>
            <Field label="Setor" value={report.department} />
            <Field label="Local" value={report.location_description} />
            <Field label="Data aproximada" value={report.incident_date} />
            <Field label="Horário" value={report.incident_time} />
            <Field label="Envolvidos" value={report.people_involved} />
            <Field label="Testemunhas" value={report.witnesses} />
            <Field label="Frequência" value={report.frequency} />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>EVIDÊNCIAS</Text>
          {attachments.length === 0 ? (
            <Text style={s.meta}>Nenhuma.</Text>
          ) : (
            attachments.map((a, i) => (
              <Text key={a.id} style={s.value}>
                {i + 1}. {a.display_name} ({a.mime_type}) — {a.origin === "RH" ? "RH" : "Denunciante"} —{" "}
                {formatWbDate(a.created_at)}
              </Text>
            ))
          )}
        </View>

        <View style={s.aiCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[s.sectionTitle, { color: C.purple }]}>TRIAGEM ASSISTIDA POR IA</Text>
            {ai ? (
              <Text style={s.meta}>
                {ai.modelo} • {formatWbDate(ai.gerado_em)}
              </Text>
            ) : null}
          </View>
          {!ai ? (
            <Text style={s.meta}>Nenhuma análise de IA foi gerada para esta denúncia.</Text>
          ) : (
            <View>
              <View style={s.row}>
                <Field label="Classificação de risco" value={String(ai.classificacao_risco || "").toUpperCase()} />
                <Field label="Risco de retaliação" value={ai.risco_retaliacao} />
                <Field label="Prazo sugerido" value={`${ai.prazo_sugerido_dias} dias`} />
              </View>
              <Text style={[s.label, { marginTop: 2 }]}>RESUMO</Text>
              <Text style={s.body}>{ai.resumo}</Text>
              <AiList title="TEMAS IDENTIFICADOS" items={ai.temas} />
              <AiList title="INDÍCIOS RELATADOS" items={ai.indicios} />
              <AiList title="LACUNAS DE INFORMAÇÃO" items={ai.lacunas} />
              <AiList title="SUGESTÕES DE APURAÇÃO" items={ai.sugestoes_apuracao} />
              <Text style={[s.meta, { marginTop: 5 }]}>
                Conteúdo gerado por IA a partir dos dados desta denúncia. Apoio à triagem — não substitui a
                apuração humana nem constitui conclusão da investigação.
              </Text>
            </View>
          )}
        </View>

        <View style={s.card} break={false}>

          <Text style={s.sectionTitle}>COMUNICAÇÃO COM O DENUNCIANTE</Text>
          {messages.length === 0 ? (
            <Text style={s.meta}>Sem mensagens.</Text>
          ) : (
            messages.map((m) => (
              <View key={m.id} style={s.item}>
                <Text style={s.meta}>
                  {m.sender_type === "RH" ? `RH${m.sender_user_id ? ` (${names[m.sender_user_id] ?? ""})` : ""}` : "Denunciante"}{" "}
                  • {formatWbDate(m.created_at)}
                </Text>
                <Text style={s.body}>{m.message}</Text>
              </View>
            ))
          )}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>NOTAS INTERNAS</Text>
          {notes.length === 0 ? (
            <Text style={s.meta}>Nenhuma nota interna.</Text>
          ) : (
            notes.map((n) => (
              <View key={n.id} style={s.item}>
                <Text style={s.meta}>
                  {names[n.author_user_id] ?? "RH"} • {formatWbDate(n.created_at)}
                </Text>
                <Text style={s.body}>{n.note}</Text>
              </View>
            ))
          )}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>HISTÓRICO</Text>
          {history.map((h) => (
            <Text key={h.id} style={s.value}>
              {formatWbDate(h.created_at)} — {h.public_note ?? h.internal_note ?? h.event_type}
              {h.to_status ? ` (${WB_STATUS_LABEL[h.to_status as WbStatus]})` : ""}
            </Text>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>CONCLUSÃO INTERNA</Text>
          <Text style={s.body}>{report.conclusion || "Não registrada."}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>TRILHA DE AUDITORIA (ÚLTIMOS ACESSOS)</Text>
          {logs.slice(0, 25).map((l) => (
            <Text key={l.id} style={s.meta}>
              {formatWbDate(l.created_at)} — {names[l.user_id] ?? "Usuário"} — {l.action}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function downloadDenunciaInternaPdf(data: InternalPdfInput) {
  const blob = await pdf(<DenunciaInternaPdfDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CONFIDENCIAL-${data.report.protocol}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
