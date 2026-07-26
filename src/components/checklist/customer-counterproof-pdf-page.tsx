import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";

const C = {
  page: "#020817",
  panel: "#06152d",
  panel2: "#071c3b",
  blue: "#1479ff",
  cyan: "#19d8ff",
  green: "#45e35f",
  red: "#ff5268",
  amber: "#ffb020",
  border: "#1769db",
  text: "#f8fbff",
  muted: "#a9bad1",
  line: "#17365d",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    backgroundColor: C.page,
    color: C.text,
    fontFamily: "Helvetica",
    fontSize: 8,
  },
  frame: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 10,
    backgroundColor: "#031027",
  },
  header: { alignItems: "center", marginBottom: 6 },
  logo: { width: 52, height: 36, objectFit: "cover", borderRadius: 8 },
  title: { marginTop: 4, fontSize: 18, fontWeight: 700, color: C.text },
  titleAccent: { color: C.cyan },
  subtitle: { marginTop: 2, color: C.muted, fontSize: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -2, marginBottom: 4 },
  infoCard: {
    width: "25%",
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  infoCardWide: { width: "50%" },
  infoInner: {
    minHeight: 31,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 4.5,
    backgroundColor: C.panel,
  },
  infoLabel: { color: C.muted, fontSize: 6.8, marginBottom: 2 },
  infoValue: { color: C.text, fontSize: 8, fontWeight: 700 },
  infoStatus: { color: C.green },
  panel: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 7,
    backgroundColor: C.panel,
    marginTop: 4,
  },
  panelTitle: { color: C.text, fontSize: 9.5, fontWeight: 700, marginBottom: 4 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingVertical: 3,
  },
  firstItem: { borderTopWidth: 0 },
  itemNumber: {
    width: 28,
    backgroundColor: "#0c45a5",
    color: "white",
    borderRadius: 5,
    paddingVertical: 2,
    textAlign: "center",
    fontSize: 7,
    fontWeight: 700,
  },
  itemQuestion: { flex: 1, paddingHorizontal: 7, lineHeight: 1.25, color: C.text },
  answer: {
    width: 45,
    borderRadius: 8,
    paddingVertical: 2.5,
    textAlign: "center",
    color: "white",
    fontSize: 7,
    fontWeight: 700,
  },
  answerSim: { backgroundColor: "#25b62f" },
  answerNao: { backgroundColor: "#d82e49" },
  identityRow: { flexDirection: "row", marginHorizontal: -4 },
  identityCol: { width: "42%", paddingHorizontal: 4 },
  signCol: { width: "58%", paddingHorizontal: 4 },
  subCard: {
    minHeight: 67,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 6,
    backgroundColor: "#041126",
  },
  privacyTitle: { color: C.cyan, fontWeight: 700, fontSize: 8.5, marginBottom: 5 },
  privacyText: { color: C.muted, lineHeight: 1.45, fontSize: 7.3 },
  signTitle: { color: C.cyan, fontWeight: 700, fontSize: 8.5, textAlign: "center" },
  signImageBox: {
    height: 38,
    marginTop: 5,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.border,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  signImage: { maxHeight: 34, maxWidth: "90%", objectFit: "contain" },
  signName: { marginTop: 4, color: C.text, fontSize: 7.5, fontWeight: 700, textAlign: "center" },
  summaryRow: { flexDirection: "row", marginHorizontal: -4 },
  summaryCol: { width: "33.333%", paddingHorizontal: 4 },
  summaryCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 6,
    backgroundColor: "#041126",
  },
  summaryLabel: { color: C.muted, fontSize: 6.5 },
  summaryValue: { color: C.text, fontWeight: 700, fontSize: 16, marginTop: 2 },
  summaryGreen: { color: C.green, fontSize: 12 },
  summaryDetail: { color: C.cyan, fontSize: 6.5, marginTop: 2 },
  warning: {
    color: C.amber,
    borderWidth: 1,
    borderColor: C.amber,
    borderRadius: 7,
    padding: 5,
    marginBottom: 6,
    fontWeight: 700,
  },
  footer: {
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.muted,
    fontSize: 6.5,
  },
});

function fmt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function InfoCard({
  label,
  value,
  wide,
  status,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
  status?: boolean;
}) {
  return (
    <View style={[s.infoCard, wide ? s.infoCardWide : {}]}>
      <View style={s.infoInner}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, status ? s.infoStatus : {}]}>{value || "—"}</Text>
      </View>
    </View>
  );
}

export function CustomerCounterproofPdfPage({
  counterproof,
  logoUri,
  city,
  validationCode,
}: {
  counterproof: CounterproofDocumentInfo;
  logoUri?: string | null;
  city?: string | null;
  validationCode?: string | null;
}) {
  const items = counterproof.client_checklist?.items ?? [];
  const confirmed = items.filter((item) => item.answer === "sim").length;
  const divergences = items.filter((item) => item.answer === "nao").length;
  const validated = counterproof.validated_at ? new Date(counterproof.validated_at) : null;

  return (
    <Page size="A4" style={s.page} wrap>
      <View style={s.frame}>
        <View style={s.header}>
          {logoUri ? <Image src={logoUri} style={s.logo} /> : null}
          <Text style={s.title}>
            CHECKLIST DO <Text style={s.titleAccent}>CLIENTE</Text>
          </Text>
          <Text style={s.subtitle}>Contra-prova digital do atendimento</Text>
        </View>

        <View style={s.grid}>
          <InfoCard label="Cliente" value={counterproof.client_name} wide />
          <InfoCard label="OS" value={counterproof.service_order} />
          <InfoCard label="Contra-Prova" value={counterproof.code} />
          <InfoCard label="Checklist técnico" value={counterproof.checklist_code} wide />
          <InfoCard
            label="Código de validação"
            value={validationCode || counterproof.validation_code}
            wide
          />
          <InfoCard label="Cidade" value={city || counterproof.city} />
          <InfoCard
            label="Data"
            value={validated ? validated.toLocaleDateString("pt-BR") : "—"}
          />
          <InfoCard
            label="Hora"
            value={
              validated
                ? validated.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }
          />
          <InfoCard label="Status" value="VALIDADO PELO CLIENTE" status />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Perguntas do cliente</Text>
          {items.length ? (
            items.map((item, index) => (
              <View key={item.id} style={[s.itemRow, index === 0 ? s.firstItem : {}]} wrap={false}>
                <Text style={s.itemNumber}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={s.itemQuestion}>{item.question}</Text>
                <Text
                  style={[s.answer, item.answer === "sim" ? s.answerSim : s.answerNao]}
                >
                  {item.answer === "sim" ? "SIM" : "NÃO"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: C.muted }}>
              Respostas não registradas nesta versão histórica da Contra-Prova.
            </Text>
          )}
        </View>

        <View style={s.panel} wrap={false}>
          <Text style={s.panelTitle}>Identificação e assinatura</Text>
          <View style={s.identityRow}>
            <View style={s.identityCol}>
              <View style={s.subCard}>
                <Text style={s.privacyTitle}>Evidência de identificação registrada</Text>
                <Text style={s.privacyText}>
                  A foto com RG/CNH é privada e pode ser consultada somente pela administração
                  autorizada.
                </Text>
              </View>
            </View>
            <View style={s.signCol}>
              <View style={s.subCard}>
                <Text style={s.signTitle}>Assinatura digital do cliente</Text>
                <View style={s.signImageBox}>
                  {counterproof.signature_data_url ? (
                    <Image src={counterproof.signature_data_url} style={s.signImage} />
                  ) : (
                    <Text style={{ color: C.muted }}>(assinatura não registrada)</Text>
                  )}
                </View>
                <Text style={s.signName}>
                  {counterproof.client_name || "—"} · {fmt(counterproof.validated_at)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.panel} wrap={false}>
          <Text style={s.panelTitle}>Validação final</Text>
          {divergences > 0 ? (
            <Text style={s.warning}>DIVERGÊNCIA IDENTIFICADA</Text>
          ) : null}
          <View style={s.summaryRow}>
            <View style={s.summaryCol}>
              <View style={s.summaryCard}>
                <Text style={s.summaryLabel}>CLIENTE</Text>
                <Text style={s.summaryValue}>
                  {confirmed}/{items.length || 10}
                </Text>
                <Text style={s.summaryDetail}>Itens confirmados</Text>
              </View>
            </View>
            <View style={s.summaryCol}>
              <View style={s.summaryCard}>
                <Text style={s.summaryLabel}>DIVERGÊNCIAS</Text>
                <Text style={s.summaryValue}>{divergences}</Text>
                <Text style={s.summaryDetail}>Respostas negativas</Text>
              </View>
            </View>
            <View style={s.summaryCol}>
              <View style={s.summaryCard}>
                <Text style={s.summaryLabel}>STATUS FINAL</Text>
                <Text style={[s.summaryValue, s.summaryGreen]}>VALIDADO</Text>
                <Text style={s.summaryDetail}>Pelo cliente</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.footer}>
          <Text>Webifibra · Contra-Prova {counterproof.code}</Text>
          <Text>Checklist {counterproof.checklist_code}</Text>
        </View>
      </View>
    </Page>
  );
}

export function CustomerCounterproofPdfDocument(props: {
  counterproof: CounterproofDocumentInfo;
  logoUri?: string | null;
  city?: string | null;
  validationCode?: string | null;
}) {
  return (
    <Document>
      <CustomerCounterproofPdfPage {...props} />
    </Document>
  );
}
