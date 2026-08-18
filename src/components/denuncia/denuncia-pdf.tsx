import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import {
  WB_STATUS_LABEL,
  formatWbDate,
  type PublicReportView,
  type WbStatus,
} from "@/lib/whistleblower";

const C = {
  page: "#0a0f1c",
  panel: "#111a2e",
  accent: "#4c8dff",
  soft: "#8fa3c4",
  text: "#f4f7ff",
};

const s = StyleSheet.create({
  page: {
    padding: 26,
    backgroundColor: C.page,
    color: C.text,
    fontFamily: "Helvetica",
    fontSize: 9.2,
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingBottom: 10,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontSize: 16, letterSpacing: 1.2 },
  brandSub: { fontSize: 8, color: C.soft, marginTop: 3 },
  chip: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontSize: 8,
    color: C.accent,
  },
  card: {
    backgroundColor: C.panel,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 9.5,
    color: C.accent,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  row: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", marginBottom: 6, paddingRight: 8 },
  label: { fontSize: 7, color: C.soft, letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 9.2 },
  body: { fontSize: 9.2, lineHeight: 1.45 },
  tlRow: { flexDirection: "row", marginBottom: 4 },
  tlDate: { width: 92, color: C.soft, fontSize: 8 },
  footer: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  qr: { width: 74, height: 74 },
  fine: { fontSize: 7, color: C.soft, lineHeight: 1.4 },
});

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export function DenunciaPdfDocument({
  report,
  qrDataUrl,
  publicUrl,
}: {
  report: PublicReportView;
  qrDataUrl?: string;
  publicUrl: string;
}) {
  return (
    <Document title={`Canal de Denúncias - ${report.protocol}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>CANAL DE DENÚNCIAS</Text>
            <Text style={s.brandSub}>Canal Ético • CheckTécnico — comprovante do denunciante</Text>
          </View>
          <Text style={s.chip}>{report.protocol}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>IDENTIFICAÇÃO DO RELATO</Text>
          <View style={s.row}>
            <Field label="Protocolo" value={report.protocol} />
            <Field label="Data de registro" value={formatWbDate(report.createdAt)} />
            <Field
              label="Tipo"
              value={report.reportType === "ANONYMOUS" ? "Denúncia anônima" : "Denúncia identificada"}
            />
            <Field label="Categoria" value={report.categoryLabel} />
            <Field label="Status atual" value={WB_STATUS_LABEL[report.status as WbStatus]} />
            <Field label="Última atualização" value={formatWbDate(report.updatedAt)} />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>INFORMAÇÕES RELATADAS</Text>
          <View style={{ marginBottom: 6 }}>
            <Text style={s.label}>TÍTULO</Text>
            <Text style={s.value}>{report.title}</Text>
          </View>
          <View style={{ marginBottom: 8 }}>
            <Text style={s.label}>DESCRIÇÃO</Text>
            <Text style={s.body}>{report.description}</Text>
          </View>
          <View style={s.row}>
            <Field label="Unidade" value={report.unit} />
            <Field label="Cidade" value={report.city} />
            <Field label="Setor" value={report.department} />
            <Field label="Local" value={report.locationDescription} />
            <Field label="Data aproximada" value={report.incidentDate} />
            <Field label="Horário aproximado" value={report.incidentTime} />
            <Field label="Pessoas envolvidas" value={report.peopleInvolved} />
            <Field label="Testemunhas" value={report.witnesses} />
            <Field label="Frequência" value={report.frequency} />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>EVIDÊNCIAS ANEXADAS</Text>
          {report.attachments.length === 0 ? (
            <Text style={s.fine}>Nenhuma evidência anexada.</Text>
          ) : (
            report.attachments.map((a, i) => (
              <Text key={a.id} style={s.value}>
                {i + 1}. {a.name} — {formatWbDate(a.at)}
              </Text>
            ))
          )}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>HISTÓRICO</Text>
          {report.timeline.length === 0 ? (
            <Text style={s.fine}>Sem movimentações registradas.</Text>
          ) : (
            report.timeline.map((t, i) => (
              <View key={i} style={s.tlRow}>
                <Text style={s.tlDate}>{formatWbDate(t.at)}</Text>
                <Text style={s.value}>{t.label}</Text>
              </View>
            ))
          )}
        </View>

        <View style={[s.card, s.footer]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={s.sectionTitle}>CÓDIGO DE VALIDAÇÃO</Text>
            <Text style={s.value}>{report.validationCode}</Text>
            <Text style={[s.fine, { marginTop: 6 }]}>
              Valide a autenticidade deste documento em {publicUrl}. Este comprovante não contém notas
              internas, dados de investigação ou informações confidenciais do RH.
            </Text>
          </View>
          {qrDataUrl ? <Image src={qrDataUrl} style={s.qr} /> : null}
        </View>
      </Page>
    </Document>
  );
}

export async function downloadDenunciaPdf(report: PublicReportView) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://checktecnico.life";
  const publicUrl = `${origin}/denuncia/validar/${report.validationCode}`;
  let qrDataUrl: string | undefined;
  try {
    qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 240, color: { dark: "#0a0f1c", light: "#ffffff" } });
  } catch {
    qrDataUrl = undefined;
  }
  const blob = await pdf(
    <DenunciaPdfDocument report={report} qrDataUrl={qrDataUrl} publicUrl={publicUrl} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.protocol}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
