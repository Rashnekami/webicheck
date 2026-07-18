import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ChecklistRow, InstalacaoData } from "@/lib/checklist-schema";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";

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
    marginBottom: 8,
    overflow: "hidden",
  },
  headerLogoBox: {
    width: 82,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    backgroundColor: "white",
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  headerLogo: { width: 70, height: 48, objectFit: "contain" },
  headerTextBox: { flex: 1, padding: 10, backgroundColor: SOFT_BG },
  headerTitle: { fontSize: 13, fontWeight: 700, color: BRAND_DARK },
  headerSub: { fontSize: 9, color: MUTED, marginTop: 2 },
  headerBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: BRAND,
    color: "white",
    fontSize: 9,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    letterSpacing: 0.4,
  },
  numberBanner: {
    marginBottom: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: SOFT_BG,
  },
  numberLabel: { fontSize: 8, color: MUTED, letterSpacing: 0.6 },
  numberValue: { fontSize: 13, fontWeight: 700, color: BRAND_DARK, letterSpacing: 1 },
  sectionTitle: {
    backgroundColor: BRAND,
    color: "white",
    fontWeight: 700,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 4,
    fontSize: 10,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  sectionBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
    padding: 6,
    marginTop: -4,
    marginBottom: 2,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  grid2: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "50%",
    paddingRight: 6,
    paddingVertical: 1.5,
    flexDirection: "row",
  },
  label: { color: MUTED, marginRight: 3 },
  value: { fontWeight: 700 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
  },
  checkboxOuter: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 2,
    marginRight: 5,
    marginTop: 2,
    padding: 1,
  },
  checkboxInner: { flex: 1, backgroundColor: BRAND, borderRadius: 1 },
  checkboxLabel: { fontSize: 9.5, color: INK, flex: 1, lineHeight: 1.3 },
  obsBox: {
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    minHeight: 70,
    borderRadius: 3,
    backgroundColor: "#fafbff",
    lineHeight: 1.4,
  },
  declaracao: {
    marginTop: 10,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
    backgroundColor: SOFT_BG,
    fontSize: 9,
    color: INK,
    lineHeight: 1.4,
  },
  signRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 6,
    minHeight: 95,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "white",
  },
  signImage: { height: 65, objectFit: "contain" },
  signLine: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    width: "90%",
    paddingTop: 3,
    alignItems: "center",
  },
  signLabel: { fontSize: 8, color: MUTED },
  signName: { fontSize: 9, fontWeight: 700, color: INK },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 22,
    right: 22,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
  },
});

const Chk = ({ v, label }: { v: boolean; label: string }) => (
  <View style={styles.checkboxRow}>
    <View style={styles.checkboxOuter}>
      {v ? <View style={styles.checkboxInner} /> : null}
    </View>
    <Text style={styles.checkboxLabel}>{label}</Text>
  </View>
);

const Field = ({
  label,
  value,
  w = "50%",
}: {
  label: string;
  value?: string | null;
  w?: string;
}) => (
  <View style={{ ...styles.cell, width: w }}>
    <Text style={styles.label}>{label}:</Text>
    <Text style={styles.value}>{value || "—"}</Text>
  </View>
);

async function toDataUri(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

type Params = {
  row: ChecklistRow;
  tecnicoNome: string;
  assinatura?: string | null;
};

function InstalacaoDocument({
  row,
  tecnicoNome,
  assinatura,
  logoUri,
}: Params & { logoUri: string }) {
  const d = row.dados as InstalacaoData;
  const rev = (row as unknown as { revision_number?: number }).revision_number ?? 1;
  const revSuffix = rev > 1 ? `-R${rev}` : "";
  const numero = (row.numero_publico || "— pendente —") + revSuffix;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLogoBox}>
            {logoUri ? <Image src={logoUri} style={styles.headerLogo} /> : null}
          </View>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>CHECKLIST DE INSTALAÇÃO</Text>
            <Text style={styles.headerSub}>
              Validação técnica e orientação ao cliente · Webifibra
            </Text>
            <Text style={styles.headerBadge}>DOCUMENTO OFICIAL</Text>
          </View>
        </View>

        <View style={styles.numberBanner}>
          <View>
            <Text style={styles.numberLabel}>NÚMERO DO CHECKLIST</Text>
            <Text style={styles.numberValue}>{numero}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.numberLabel}>CÓDIGO DE VALIDAÇÃO</Text>
            <Text style={{ fontSize: 9, fontWeight: 700, color: INK }}>
              {row.codigo_validacao || "—"}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>1. Identificação do atendimento</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Field label="OS" value={row.os} />
            <Field label="Plano" value={row.plano} />
            <Field label="Cliente" value={row.cliente} w="100%" />
            <Field label="Endereço" value={row.endereco} w="100%" />
            <Field label="Cidade" value={row.cidade} />
            <Field label="Técnico" value={tecnicoNome} />
            <Field
              label="Data"
              value={
                row.data_atendimento
                  ? new Date(row.data_atendimento).toLocaleDateString("pt-BR")
                  : null
              }
              w="50%"
            />
            <Field label="Hora" value={row.hora_atendimento} w="50%" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          2. Validação técnica e orientação ao cliente
        </Text>
        <View style={styles.sectionBox}>
          <Chk
            v={d.itens.velocidade_ok}
            label="Teste de velocidade realizado via cabo/roteador, comprovando a entrega da banda contratada."
          />
          <Chk
            v={d.itens.navegacao_ok}
            label="Navegação e estabilidade da conexão validadas no momento da instalação."
          />
          <Chk
            v={d.itens.wifi_orientado}
            label="Cliente orientado sobre a diferença das redes Wi-Fi: 5 GHz (maior velocidade, menor alcance) e 2,4 GHz (maior alcance, menor velocidade)."
          />
          <Chk
            v={d.itens.placa_orientado}
            label="Cliente orientado que a velocidade via Wi-Fi depende da capacidade da placa de rede do aparelho (celular, TV, console, etc.)."
          />
          <Chk
            v={d.itens.cabo_orientado}
            label="Orientado a utilizar cabo de rede em Smart TVs, videogames e equipamentos que exigem maior estabilidade."
          />
          <Chk
            v={d.itens.posicionamento_ok}
            label="Posicionamento do roteador validado e orientado sobre possíveis interferências físicas (paredes, móveis, espelhos, eletrodomésticos, etc.)."
          />
          <Chk
            v={d.itens.downdetector}
            label="Apresentado o site Downdetector ao cliente e orientado a verificar possíveis quedas globais de aplicativos antes de acionar o suporte."
          />
          <Chk
            v={d.itens.duvidas_sanadas}
            label="Dúvidas finais do cliente sanadas no local."
          />
        </View>

        <Text style={styles.sectionTitle}>3. Medições do teste de velocidade</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Field label="Download (Mbps)" value={d.velocidade.download} w="33.33%" />
            <Field label="Upload (Mbps)" value={d.velocidade.upload} w="33.33%" />
            <Field label="Ping (ms)" value={d.velocidade.ping_ms} w="33.33%" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>4. Observações adicionais</Text>
        <View style={styles.obsBox}>
          <Text>{d.observacoes || "—"}</Text>
        </View>

        <View style={styles.declaracao}>
          <Text>
            Declaro que os testes foram realizados, as orientações acima foram
            repassadas e o cliente acompanhou a conclusão do serviço.
          </Text>
        </View>

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            {assinatura ? (
              <Image src={assinatura} style={styles.signImage} />
            ) : (
              <Text style={{ color: MUTED, fontSize: 8 }}>
                (assinatura não cadastrada)
              </Text>
            )}
            <View style={styles.signLine}>
              <Text style={styles.signName}>{tecnicoNome || "—"}</Text>
              <Text style={styles.signLabel}>Assinatura do técnico</Text>
            </View>
          </View>
          <View style={styles.signBox}>
            {d.assinatura_cliente ? (
              <Image src={d.assinatura_cliente} style={styles.signImage} />
            ) : (
              <Text style={{ color: MUTED, fontSize: 8 }}>
                (cliente não assinou)
              </Text>
            )}
            <View style={styles.signLine}>
              <Text style={styles.signName}>{row.cliente || "—"}</Text>
              <Text style={styles.signLabel}>Assinatura do cliente</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Webifibra · {numero}</Text>
          <Text>
            Finalizado:{" "}
            {row.finalizado_em
              ? new Date(row.finalizado_em).toLocaleString("pt-BR")
              : "rascunho"}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function buildInstalacaoPdfBlob({
  row,
  tecnicoNome,
  assinatura,
}: Params): Promise<Blob> {
  const logoUri = await toDataUri(logoAsset.url).catch(() => "");
  return await pdf(
    <InstalacaoDocument
      row={row}
      tecnicoNome={tecnicoNome}
      assinatura={assinatura ?? null}
      logoUri={logoUri}
    />,
  ).toBlob();
}

export async function generateInstalacaoPdf(params: Params) {
  const blob = await buildInstalacaoPdfBlob(params);
  const nome = `instalacao-${params.row.numero_publico || params.row.codigo_validacao || params.row.id.slice(0, 8)}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

