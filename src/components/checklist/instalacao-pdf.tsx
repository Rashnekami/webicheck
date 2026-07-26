import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { ChecklistRow, InstalacaoData } from "@/lib/checklist-schema";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";
import { CustomerCounterproofPdfPage } from "@/components/checklist/customer-counterproof-pdf-page";
import {
  INSTALACAO_TECHNICIAN_QUESTIONS,
  readInstalacaoAnswer,
} from "@/lib/instalacao-checklist";

const C = {
  page: "#020817",
  panel: "#06152d",
  blue: "#1479ff",
  cyan: "#19d8ff",
  green: "#45e35f",
  red: "#ff5268",
  border: "#1769db",
  text: "#f8fbff",
  muted: "#a9bad1",
  line: "#17365d",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 18,
    backgroundColor: C.page,
    color: C.text,
    fontFamily: "Helvetica",
    fontSize: 7.4,
  },
  frame: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#031027",
  },
  header: { alignItems: "center", marginBottom: 8 },
  logo: { width: 68, height: 48, objectFit: "cover", borderRadius: 10 },
  title: { marginTop: 5, fontSize: 21, fontWeight: 700, color: C.text },
  titleAccent: { color: C.cyan },
  subtitle: { marginTop: 2, color: C.muted, fontSize: 9.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -2.5, marginBottom: 5 },
  infoCard: { width: "25%", paddingHorizontal: 2.5, paddingBottom: 5 },
  infoCardWide: { width: "50%" },
  infoInner: {
    minHeight: 35,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 7,
    padding: 5,
    backgroundColor: C.panel,
  },
  infoLabel: { color: C.muted, fontSize: 6.3, marginBottom: 2 },
  infoValue: { color: C.text, fontSize: 7.4, fontWeight: 700 },
  infoStatus: { color: C.green },
  validated: {
    borderWidth: 1,
    borderColor: C.green,
    borderRadius: 7,
    backgroundColor: "#0b2d25",
    color: C.green,
    padding: 5,
    marginBottom: 5,
    fontSize: 7,
    fontWeight: 700,
  },
  panel: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    padding: 7,
    backgroundColor: C.panel,
    marginTop: 5,
  },
  panelTitle: { color: C.text, fontSize: 9.5, fontWeight: 700, marginBottom: 4 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingVertical: 2.2,
  },
  firstItem: { borderTopWidth: 0 },
  itemNumber: {
    width: 24,
    backgroundColor: "#0c45a5",
    color: "white",
    borderRadius: 4,
    paddingVertical: 1.4,
    textAlign: "center",
    fontSize: 6.2,
    fontWeight: 700,
  },
  itemQuestion: { flex: 1, paddingHorizontal: 6, lineHeight: 1.2, color: C.text },
  answer: {
    width: 42,
    borderRadius: 8,
    paddingVertical: 1.7,
    textAlign: "center",
    color: "white",
    fontSize: 6.3,
    fontWeight: 700,
  },
  answerSim: { backgroundColor: "#25b62f" },
  answerNao: { backgroundColor: "#d82e49" },
  speedTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  wifi: { color: C.cyan, fontSize: 7, fontWeight: 700 },
  speedRow: { flexDirection: "row", marginHorizontal: -4 },
  speedCol: { width: "33.333%", paddingHorizontal: 4 },
  speedCard: {
    borderWidth: 1,
    borderColor: C.cyan,
    borderRadius: 8,
    padding: 7,
    backgroundColor: "#041126",
  },
  speedLabel: { color: C.cyan, fontSize: 6.5, fontWeight: 700 },
  speedValue: { color: C.text, fontSize: 18, fontWeight: 700, marginTop: 2 },
  speedUnit: { color: C.cyan, fontSize: 7 },
  bottomRow: { flexDirection: "row", marginHorizontal: -4, marginTop: 5 },
  bottomCol: { width: "50%", paddingHorizontal: 4 },
  bottomCard: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 7,
    backgroundColor: C.panel,
  },
  bottomTitle: { color: C.text, fontSize: 8.5, fontWeight: 700, marginBottom: 5 },
  obs: { color: C.muted, fontSize: 7, lineHeight: 1.4 },
  signBox: {
    height: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.border,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  signImage: { maxHeight: 42, maxWidth: "92%", objectFit: "contain" },
  signName: { color: C.text, fontSize: 6.8, fontWeight: 700, marginTop: 3, textAlign: "center" },
  authenticity: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 6,
    backgroundColor: C.panel,
    flexDirection: "row",
    alignItems: "center",
  },
  qr: { width: 42, height: 42, borderRadius: 4, marginRight: 8 },
  authTitle: { color: C.cyan, fontSize: 7.5, fontWeight: 700 },
  authText: { color: C.muted, fontSize: 6.3, marginTop: 2 },
  footer: {
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.muted,
    fontSize: 6,
  },
  continuation: {
    color: C.cyan,
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 7,
    letterSpacing: 0.8,
  },
});

type Params = {
  row: ChecklistRow;
  tecnicoNome: string;
  assinatura?: string | null;
  publicUrl?: string | null;
  counterproof?: CounterproofDocumentInfo | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function fmtDateTime(value?: string | null) {
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

function TechnicianPdfPage({
  row,
  tecnicoNome,
  assinatura,
  logoUri,
  qrUri,
  counterproof,
}: Params & { logoUri: string; qrUri: string }) {
  const data = row.dados as InstalacaoData;
  const revision = row.revision_number ?? 1;
  const number = `${row.numero_publico || "—"}${revision > 1 ? `-R${revision}` : ""}`;

  return (
    <Page size="A4" style={s.page} wrap>
      <View style={s.frame}>
        <View style={s.header}>
          {logoUri ? <Image src={logoUri} style={s.logo} /> : null}
          <Text style={s.title}>
            CHECKLIST DO <Text style={s.titleAccent}>TÉCNICO</Text>
          </Text>
          <Text style={s.subtitle}>Validação técnica do atendimento</Text>
        </View>

        <View style={s.grid}>
          <InfoCard label="Cliente" value={row.cliente} wide />
          <InfoCard label="OS" value={row.os} />
          <InfoCard label="Checklist" value={number} />
          <InfoCard label="Código de validação" value={row.codigo_validacao} wide />
          <InfoCard label="Técnico" value={tecnicoNome} wide />
          <InfoCard label="Cidade" value={row.cidade} />
          <InfoCard label="Data" value={fmtDate(row.data_atendimento)} />
          <InfoCard label="Hora" value={row.hora_atendimento} />
          <InfoCard label="Status" value="VALIDADO" status />
        </View>

        {counterproof?.status === "validated" ? (
          <Text style={s.validated}>
            CONTRA-PROVA VALIDADA PELO CLIENTE · {counterproof.code} ·{" "}
            {fmtDateTime(counterproof.validated_at)}
          </Text>
        ) : null}

        <View style={s.panel}>
          <Text style={s.panelTitle}>Perguntas do técnico</Text>
          {INSTALACAO_TECHNICIAN_QUESTIONS.map((question, index) => {
            const answer = readInstalacaoAnswer(data.respostas, question.id);
            return (
              <View
                key={question.id}
                style={[s.itemRow, index === 0 ? s.firstItem : {}]}
                wrap={false}
              >
                <Text style={s.itemNumber}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={s.itemQuestion}>{question.question}</Text>
                <Text
                  style={[
                    s.answer,
                    answer === "sim"
                      ? s.answerSim
                      : answer === "nao"
                        ? s.answerNao
                        : { backgroundColor: "#334155" },
                  ]}
                >
                  {answer === "sim" ? "SIM" : answer === "nao" ? "NÃO" : "N/A"}
                </Text>
              </View>
            );
          })}
        </View>

        <View break>
        <Text style={s.continuation}>CHECKLIST DO TÉCNICO · CONTINUAÇÃO</Text>
        <View style={s.panel} wrap={false}>
          <View style={s.speedTitleRow}>
            <Text style={s.panelTitle}>Teste de velocidade</Text>
            <Text style={s.wifi}>Teste realizado via Wi-Fi</Text>
          </View>
          <View style={s.speedRow}>
            {[
              { label: "DOWNLOAD", value: data.velocidade?.download, unit: "Mbps" },
              { label: "UPLOAD", value: data.velocidade?.upload, unit: "Mbps" },
              { label: "PING", value: data.velocidade?.ping_ms, unit: "ms" },
            ].map((metric) => (
              <View key={metric.label} style={s.speedCol}>
                <View style={s.speedCard}>
                  <Text style={s.speedLabel}>{metric.label}</Text>
                  <Text style={s.speedValue}>
                    {metric.value || "—"} <Text style={s.speedUnit}>{metric.unit}</Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={s.bottomRow} wrap={false}>
          <View style={s.bottomCol}>
            <View style={s.bottomCard}>
              <Text style={s.bottomTitle}>Observações adicionais</Text>
              <Text style={s.obs}>
                {data.observacoes || "Nenhuma observação adicional registrada."}
              </Text>
            </View>
          </View>
          <View style={s.bottomCol}>
            <View style={s.bottomCard}>
              <Text style={s.bottomTitle}>Assinatura do técnico</Text>
              <View style={s.signBox}>
                {assinatura ? (
                  <Image src={assinatura} style={s.signImage} />
                ) : (
                  <Text style={s.obs}>(assinatura não cadastrada)</Text>
                )}
              </View>
              <Text style={s.signName}>{tecnicoNome || "—"}</Text>
            </View>
          </View>
        </View>

        <View style={s.authenticity} wrap={false}>
          {qrUri ? <Image src={qrUri} style={s.qr} /> : null}
          <View>
            <Text style={s.authTitle}>Autenticidade e validação</Text>
            <Text style={s.authText}>Código: {row.codigo_validacao || "—"}</Text>
            <Text style={s.authText}>Checklist: {number}</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text>Webifibra · Conectividade que aproxima</Text>
          <Text>
            Finalizado: {fmtDateTime(row.finalizado_em)} · Página{" "}
            <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </Text>
        </View>
        </View>
      </View>
    </Page>
  );
}

function InstallationDocument({
  row,
  tecnicoNome,
  assinatura,
  logoUri,
  qrUri,
  publicUrl,
  counterproof,
}: Params & { logoUri: string; qrUri: string }) {
  return (
    <Document>
      <TechnicianPdfPage
        row={row}
        tecnicoNome={tecnicoNome}
        assinatura={assinatura}
        logoUri={logoUri}
        qrUri={qrUri}
        publicUrl={publicUrl}
        counterproof={counterproof}
      />
      {counterproof?.status === "validated" ? (
        <CustomerCounterproofPdfPage
          counterproof={counterproof}
          logoUri={logoUri}
          city={row.cidade}
          validationCode={row.codigo_validacao}
        />
      ) : null}
    </Document>
  );
}

async function toDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function buildInstalacaoPdfBlob(params: Params): Promise<Blob> {
  const [logoUri, qrUri] = await Promise.all([
    toDataUri(logoAsset.url).catch(() => ""),
    params.publicUrl
      ? QRCode.toDataURL(params.publicUrl, {
          margin: 1,
          width: 320,
          errorCorrectionLevel: "M",
        }).catch(() => "")
      : Promise.resolve(""),
  ]);
  return await pdf(
    <InstallationDocument {...params} logoUri={logoUri} qrUri={qrUri} />,
  ).toBlob();
}

export async function generateInstalacaoPdf(params: Params) {
  const blob = await buildInstalacaoPdfBlob(params);
  const revision = params.row.revision_number ?? 1;
  const revisionSuffix = revision > 1 ? `-R${revision}` : "";
  const name = `instalacao-${params.row.numero_publico || params.row.codigo_validacao || params.row.id.slice(0, 8)}${revisionSuffix}.pdf`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
