import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";

const BRAND_DARK = "#0f3fd4";
const BORDER = "#c9d3e6";
const INK = "#0f172a";
const MUTED = "#475569";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: INK, fontFamily: "Helvetica" },
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
    width: 80,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 60, height: 30, objectFit: "contain" },
  headerText: { flex: 1, padding: 10, backgroundColor: "#f4f7ff" },
  title: { fontSize: 13, fontWeight: 700, color: BRAND_DARK },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  badge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "#059669",
    color: "white",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    fontWeight: 700,
    borderRadius: 3,
  },
  info: {
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { color: MUTED, marginRight: 3 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: BRAND_DARK,
    marginBottom: 6,
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  itemNumber: { width: 18, color: MUTED, fontWeight: 700 },
  itemQuestion: { flex: 1, paddingRight: 6 },
  answer: {
    width: 40,
    textAlign: "center",
    fontSize: 9,
    fontWeight: 700,
    paddingVertical: 2,
    borderRadius: 3,
  },
  answerSim: { color: "#166534", backgroundColor: "#dcfce7" },
  answerNao: { color: "#92400e", backgroundColor: "#fef3c7" },
  note: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    padding: 8,
  },
  sign: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 8,
    minHeight: 90,
    alignItems: "center",
    justifyContent: "center",
    width: 260,
  },
  signImg: { maxHeight: 60, objectFit: "contain" },
  signTitle: { fontSize: 8, color: MUTED, marginTop: 4 },
  footer: {
    marginTop: 14,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
  },
});

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return d;
  }
}

export function CustomerCounterproofPdfPage({
  counterproof,
  logoUri,
}: {
  counterproof: CounterproofDocumentInfo;
  logoUri?: string | null;
}) {
  const items = counterproof.client_checklist?.items ?? [];
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <View style={s.logoBox}>
          {logoUri ? <Image src={logoUri} style={s.logo} /> : null}
        </View>
        <View style={s.headerText}>
          <Text style={s.title}>CHECKLIST DO CLIENTE</Text>
          <Text style={s.subtitle}>Contra-Prova Digital vinculada ao atendimento técnico</Text>
          <Text style={s.badge}>VALIDADA PELO CLIENTE</Text>
        </View>
      </View>

      <View style={s.info}>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Contra-Prova:</Text>
          <Text style={{ fontWeight: 700 }}>{counterproof.code}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Checklist técnico:</Text>
          <Text style={{ fontWeight: 700 }}>{counterproof.checklist_code}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Cliente:</Text>
          <Text style={{ fontWeight: 700 }}>{counterproof.client_name || "—"}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>OS:</Text>
          <Text style={{ fontWeight: 700 }}>{counterproof.service_order || "—"}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Data/hora:</Text>
          <Text style={{ fontWeight: 700 }}>{fmt(counterproof.validated_at)}</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Respostas do cliente — Sim ou Não</Text>
      <View>
        {items.length ? (
          items.map((item, index) => (
            <View key={item.id} style={s.itemRow}>
              <Text style={s.itemNumber}>{index + 1}.</Text>
              <Text style={s.itemQuestion}>{item.question}</Text>
              <Text
                style={[s.answer, item.answer === "sim" ? s.answerSim : s.answerNao]}
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

      <View style={s.note}>
        <Text style={{ fontWeight: 700, color: BRAND_DARK }}>
          Evidência de identificação registrada
        </Text>
        <Text style={{ marginTop: 2, color: MUTED, fontSize: 9 }}>
          A foto com RG/CNH é privada e pode ser consultada somente pela administração autorizada.
        </Text>
      </View>

      <View style={s.sign}>
        {counterproof.signature_data_url ? (
          <Image src={counterproof.signature_data_url} style={s.signImg} />
        ) : (
          <Text style={{ color: MUTED, fontSize: 9 }}>(assinatura não registrada)</Text>
        )}
        <Text style={s.signTitle}>
          Assinatura digital do cliente — {counterproof.client_name || "—"}
        </Text>
      </View>

      <View style={s.footer}>
        <Text>Webifibra · Contra-Prova {counterproof.code}</Text>
        <Text>Checklist {counterproof.checklist_code}</Text>
      </View>
    </Page>
  );
}

// Also export the Document wrapper in case needed elsewhere.
export function CustomerCounterproofPdfDocument(props: {
  counterproof: CounterproofDocumentInfo;
  logoUri?: string | null;
}) {
  return (
    <Document>
      <CustomerCounterproofPdfPage {...props} />
    </Document>
  );
}
