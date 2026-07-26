import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";

const BRAND = "#1a53ff";
const BRAND_DARK = "#0f3fd4";
const BORDER = "#c9d3e6";
const INK = "#0f172a";
const MUTED = "#475569";
const SOFT_BG = "#f4f7ff";

const styles = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 32,
    paddingHorizontal: 22,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    marginBottom: 10,
    overflow: "hidden",
  },
  logoBox: {
    width: 82,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    backgroundColor: "white",
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  logo: { width: 70, height: 48, objectFit: "contain" },
  headerText: { flex: 1, padding: 10, backgroundColor: SOFT_BG },
  title: { fontSize: 13, fontWeight: 700, color: BRAND_DARK },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  badge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "#059669",
    color: "white",
    fontSize: 8.5,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  summary: {
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
    borderRadius: 5,
    padding: 8,
    marginBottom: 10,
  },
  summaryTitle: { fontSize: 10, fontWeight: 700, color: "#166534", marginBottom: 4 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  summaryLabel: { color: MUTED, marginRight: 3 },
  summaryValue: { fontWeight: 700, marginRight: 14 },
  sectionTitle: {
    backgroundColor: BRAND,
    color: "white",
    fontWeight: 700,
    paddingVertical: 5,
    paddingHorizontal: 7,
    fontSize: 10,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  answers: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    padding: 7,
    marginBottom: 10,
  },
  answerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  questionNumber: { width: 18, color: MUTED, fontWeight: 700 },
  question: { flex: 1, lineHeight: 1.35, paddingRight: 8 },
  answer: {
    width: 42,
    textAlign: "center",
    fontWeight: 700,
    borderRadius: 3,
    paddingVertical: 2,
  },
  evidence: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  evidenceTitle: { color: BRAND_DARK, fontWeight: 700, marginBottom: 3 },
  signBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 5,
    minHeight: 105,
    padding: 8,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  signImage: { width: 180, height: 58, objectFit: "contain" },
  signLine: {
    width: "70%",
    borderTopWidth: 1,
    borderTopColor: "#64748b",
    paddingTop: 4,
    alignItems: "center",
  },
  signName: { fontWeight: 700 },
  signLabel: { color: MUTED, fontSize: 8 },
  footer: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 4,
    color: MUTED,
    fontSize: 7.5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function CustomerCounterproofPdfPage({
  counterproof,
  logoUri,
}: {
  counterproof: CounterproofDocumentInfo;
  logoUri: string;
}) {
  const items = counterproof.client_checklist?.items ?? [];
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.logoBox}>
          {logoUri ? <Image src={logoUri} style={styles.logo} /> : null}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>CHECKLIST DO CLIENTE</Text>
          <Text style={styles.subtitle}>Contra-Prova Digital vinculada ao atendimento técnico</Text>
          <Text style={styles.badge}>VALIDADA PELO CLIENTE</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Vínculo e validação</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Contra-Prova:</Text>
          <Text style={styles.summaryValue}>{counterproof.code}</Text>
          <Text style={styles.summaryLabel}>Checklist técnico:</Text>
          <Text style={styles.summaryValue}>{counterproof.checklist_code}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Cliente:</Text>
          <Text style={styles.summaryValue}>{counterproof.client_name || "—"}</Text>
          <Text style={styles.summaryLabel}>OS:</Text>
          <Text style={styles.summaryValue}>{counterproof.service_order || "—"}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Data/hora:</Text>
          <Text style={styles.summaryValue}>
            {counterproof.validated_at
              ? new Date(counterproof.validated_at).toLocaleString("pt-BR")
              : "—"}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Respostas do cliente - Sim ou Não</Text>
      <View style={styles.answers}>
        {items.length ? (
          items.map((item, index) => (
            <View
              key={item.id}
              style={{
                ...styles.answerRow,
                borderBottomWidth: index === items.length - 1 ? 0 : 1,
              }}
              wrap={false}
            >
              <Text style={styles.questionNumber}>{index + 1}.</Text>
              <Text style={styles.question}>{item.question}</Text>
              <Text
                style={{
                  ...styles.answer,
                  color: item.answer === "sim" ? "#166534" : "#92400e",
                  backgroundColor: item.answer === "sim" ? "#dcfce7" : "#fef3c7",
                }}
              >
                {item.answer === "sim" ? "SIM" : "NÃO"}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: MUTED }}>
            Respostas não registradas. Esta Contra-Prova foi concluída antes da versão com
            checklist do cliente.
          </Text>
        )}
      </View>

      <View style={styles.evidence}>
        <Text style={styles.evidenceTitle}>Identificação</Text>
        <Text>Evidência de identificação registrada.</Text>
        <Text style={{ color: MUTED, fontSize: 8, marginTop: 2 }}>
          A foto com RG/CNH é privada, não integra este documento e pode ser consultada somente
          pela administração autorizada.
        </Text>
      </View>

      <View style={styles.signBox}>
        {counterproof.signature_data_url ? (
          <Image src={counterproof.signature_data_url} style={styles.signImage} />
        ) : (
          <Text style={{ color: MUTED, fontSize: 8 }}>(assinatura indisponível)</Text>
        )}
        <View style={styles.signLine}>
          <Text style={styles.signName}>{counterproof.client_name || "—"}</Text>
          <Text style={styles.signLabel}>Assinatura digital do cliente</Text>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>Webifibra · Contra-Prova {counterproof.code}</Text>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>
  );
}

