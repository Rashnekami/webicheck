import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ChecklistData, ChecklistRow, FotoRow } from "@/lib/checklist-schema";
import { FOTO_CATEGORIAS } from "@/lib/checklist-schema";
import { signedFotoUrl } from "@/lib/checklists";
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
    fontSize: 9,
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
  headerTextBox: {
    flex: 1,
    padding: 10,
    backgroundColor: SOFT_BG,
  },
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
  warn: {
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    backgroundColor: "#fffbeb",
    padding: 6,
    borderRadius: 3,
    marginBottom: 8,
    fontSize: 8.5,
    color: "#78350f",
  },
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
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingRight: 6,
  },
  checkboxOuter: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 2,
    marginRight: 5,
    padding: 1,
  },
  checkboxInner: {
    flex: 1,
    backgroundColor: BRAND,
    borderRadius: 1,
  },
  checkboxLabel: { fontSize: 9, color: INK },
  relato: {
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    minHeight: 60,
    borderRadius: 3,
    backgroundColor: "#fafbff",
    lineHeight: 1.4,
  },
  signRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 6,
    minHeight: 90,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "white",
  },
  signImage: { height: 60, objectFit: "contain" },
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
  photoGrid: { flexDirection: "row", flexWrap: "wrap" },
  photoItem: {
    width: "48%",
    marginRight: "2%",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    borderRadius: 3,
    backgroundColor: "white",
  },
  photoImg: { width: "100%", height: 180, objectFit: "cover", borderRadius: 2 },
  photoLabel: { fontSize: 8, marginTop: 3, color: MUTED, textAlign: "center" },
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

function yesNo(v: "sim" | "nao" | null) {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  return "—";
}

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
  fotos: FotoRow[];
  tecnicoNome: string;
  assinatura?: string | null;
};

function ChecklistDocument({
  row,
  fotos,
  tecnicoNome,
  assinatura,
  logoUri,
}: Params & { logoUri: string }) {
  const d = row.dados as ChecklistData;
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
            <Text style={styles.headerTitle}>
              CHECKLIST TÉCNICO DE VALIDAÇÃO DE ONT
            </Text>
            <Text style={styles.headerSub}>Uso exclusivo do técnico de campo · Webifibra</Text>
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

        <View style={styles.warn}>
          <Text>
            IMPORTANTE: preencher antes de solicitar a troca e não restaurar a
            ONT antes de enviar as evidências ao NOC.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. Identificação do atendimento</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Field label="OS" value={row.os} />
            <Field
              label="Data"
              value={
                row.data_atendimento
                  ? new Date(row.data_atendimento).toLocaleDateString("pt-BR")
                  : null
              }
              w="25%"
            />
            <Field label="Hora" value={row.hora_atendimento} w="25%" />
            <Field label="Cliente" value={row.cliente} />
            <Field label="Cidade" value={row.cidade} w="25%" />
            <Field label="Técnico" value={tecnicoNome} w="25%" />
            <Field label="Modelo" value={row.modelo} w="33.33%" />
            <Field label="Serial" value={row.serial} w="33.33%" />
            <Field label="CTO/Porta" value={row.cto_porta} w="33.33%" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>2. Sintoma confirmado em campo</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Chk v={d.sintoma.ont_nao_liga} label="ONT não liga" />
            <Chk v={d.sintoma.ont_reinicia} label="ONT reinicia/desliga" />
            <Chk v={d.sintoma.perde_internet} label="Perde internet/provisionamento" />
            <Chk v={d.sintoma.internet_cai_pon_acesa} label="Internet cai com PON acesa" />
            <Chk v={d.sintoma.los_acende} label="LOS acende" />
            <Chk v={d.sintoma.wifi_5g_desaparece} label="Wi-Fi 5 GHz desaparece" />
            <Chk v={d.sintoma.wifi_ambas_desaparecem} label="Wi-Fi 2,4 e 5 GHz desaparecem" />
            <Chk v={d.sintoma.wifi_falha_cabo_ok} label="Wi-Fi falha, cabo OK" />
            <Chk v={d.sintoma.lan_nao_funciona} label="Porta LAN não funciona" />
            <Chk v={d.sintoma.lentidao} label="Lentidão" />
          </View>
          <View style={styles.grid2}>
            <Field label="Outro" value={d.sintoma.outro_texto} w="100%" />
            <Field label="Falha presenciada" value={yesNo(d.sintoma.falha_presenciada)} />
            <Field label="Horário" value={d.sintoma.horario} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>3. Validação física</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Chk v={d.validacao_fisica.tomada} label="Tomada e alimentação verificadas" />
            <Chk v={d.validacao_fisica.fonte} label="Fonte e conector verificados" />
            <Chk v={d.validacao_fisica.outra_tomada} label="Testada em outra tomada" />
            <Chk v={d.validacao_fisica.outra_fonte} label="Testada com outra fonte" />
            <Chk v={d.validacao_fisica.patch_cord} label="Patch cord óptico verificado" />
            <Chk v={d.validacao_fisica.sem_dobras} label="Sem dobras no cabo óptico" />
            <Chk v={d.validacao_fisica.luz_verde_ok} label="LED PON/Óptico OK" />
            <Chk v={d.validacao_fisica.roseta_ok} label="Roseta/adaptador OK" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>4. Teste cabeado</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Chk v={d.teste_cabeado.navegacao} label="Navegação testada" />
            <Chk v={d.teste_cabeado.ping} label="Ping testado" />
            <Chk v={d.teste_cabeado.velocidade} label="Velocidade testada" />
            <Chk v={d.teste_cabeado.cabo_substituido} label="Cabo substituído" />
          </View>
          <View style={styles.grid2}>
            <Field label="Download (Mbps)" value={d.teste_cabeado.download} w="33.33%" />
            <Field label="Upload (Mbps)" value={d.teste_cabeado.upload} w="33.33%" />
            <Field label="Ping (ms)" value={d.teste_cabeado.ping_ms} w="33.33%" />
          </View>
          <View style={styles.grid2}>
            <Chk v={d.teste_cabeado.funcionou} label="Funcionou normalmente" />
            <Chk v={d.teste_cabeado.apresentou_falha} label="Também apresentou falha" />
            <Chk v={d.teste_cabeado.ont_reiniciou} label="ONT reiniciou" />
            <Chk v={d.teste_cabeado.lan_falhou} label="Porta LAN não funcionou" />
            <Chk v={d.teste_cabeado.nao_testado} label="Não foi possível testar" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>5. Teste Wi-Fi</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Chk v={d.teste_wifi.rede_24} label="Rede 2,4 GHz testada" />
            <Chk v={d.teste_wifi.rede_5} label="Rede 5 GHz testada" />
            <Chk v={d.teste_wifi.mais_aparelhos} label="Testado em mais de um aparelho" />
            <Chk v={d.teste_wifi.cabo_funcionando} label="Cabo permanece funcionando" />
            <Chk v={d.teste_wifi.apenas_5g_desaparece} label="Apenas 5 GHz desaparece" />
            <Chk v={d.teste_wifi.ambas_desaparecem} label="Ambas as redes desaparecem" />
            <Chk v={d.teste_wifi.sem_internet} label="Wi-Fi visível sem internet" />
            <Chk v={d.teste_wifi.um_aparelho} label="Ocorreu apenas em um aparelho" />
            <Chk v={d.teste_wifi.nao_reproduzida} label="Falha não reproduzida" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>6. Evidências marcadas</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Chk v={d.evidencias_marcadas.etiqueta} label="Foto da etiqueta (modelo/serial)" />
            <Chk v={d.evidencias_marcadas.leds} label="Foto dos LEDs da ONT" />
            <Chk v={d.evidencias_marcadas.fonte} label="Foto da fonte/conexões" />
            <Chk v={d.evidencias_marcadas.teste_cabeado} label="Evidência do teste cabeado" />
            <Chk v={d.evidencias_marcadas.teste_wifi} label="Evidência do teste Wi-Fi" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>7. Resultado após reset/teste final</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Chk v={d.resultado_final.permaneceu} label="Falha permaneceu" />
            <Chk v={d.resultado_final.parou} label="Falha parou" />
            <Chk v={d.resultado_final.nao_reproduzida} label="Não foi reproduzida" />
            <Field label="Encaminhado ao NOC" value={yesNo(d.resultado_final.encaminhado_noc)} />
            <Field label="Interrompeu atendimento" value={yesNo(d.resultado_final.interrompeu)} />
            <Field label="Motivo" value={d.resultado_final.motivo} w="100%" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>8. Relato objetivo do técnico</Text>
        <View style={styles.relato}>
          <Text>{d.relato || "—"}</Text>
        </View>

        <Text style={styles.sectionTitle}>9. Registro da autorização do NOC</Text>
        <View style={styles.sectionBox}>
          <View style={styles.grid2}>
            <Field label="Troca autorizada" value={yesNo(d.noc.autorizada)} />
            <Field label="Analista" value={d.noc.analista} />
            <Field label="Data" value={d.noc.data} />
            <Field label="Hora" value={d.noc.hora} />
            <Field label="Protocolo/OS do NOC" value={d.noc.protocolo} w="100%" />
          </View>
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
              <Text style={styles.signLabel}>Técnico responsável</Text>
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

      {fotos.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <View style={styles.headerLogoBox}>
              {logoUri ? <Image src={logoUri} style={styles.headerLogo} /> : null}
            </View>
            <View style={styles.headerTextBox}>
              <Text style={styles.headerTitle}>EVIDÊNCIAS FOTOGRÁFICAS</Text>
              <Text style={styles.headerSub}>Anexo do checklist {numero}</Text>
            </View>
          </View>
          <View style={styles.photoGrid}>
            {fotos.map((f) => (
              <View key={f.id} style={styles.photoItem} wrap={false}>
                {(f as FotoRow & { _uri?: string })._uri ? (
                  <Image
                    src={(f as FotoRow & { _uri: string })._uri}
                    style={styles.photoImg}
                  />
                ) : null}
                <Text style={styles.photoLabel}>
                  {FOTO_CATEGORIAS.find((c) => c.value === f.categoria)?.label}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.footer} fixed>
            <Text>Webifibra · {numero}</Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Página ${pageNumber} de ${totalPages}`
              }
            />
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function buildChecklistPdfBlob({
  row,
  fotos,
  tecnicoNome,
  assinatura,
}: Params): Promise<Blob> {
  const [logoUri, fotosComUri] = await Promise.all([
    toDataUri(logoAsset.url).catch(() => ""),
    Promise.all(
      fotos.map(async (f) => {
        try {
          const url = await signedFotoUrl(f.storage_path, 300);
          const uri = await toDataUri(url);
          return { ...f, _uri: uri } as FotoRow & { _uri: string };
        } catch {
          return f;
        }
      }),
    ),
  ]);

  return await pdf(
    <ChecklistDocument
      row={row}
      fotos={fotosComUri}
      tecnicoNome={tecnicoNome}
      assinatura={assinatura ?? null}
      logoUri={logoUri}
    />,
  ).toBlob();
}

export async function generateChecklistPdf(params: Params) {
  const blob = await buildChecklistPdfBlob(params);
  const rev = (params.row as unknown as { revision_number?: number }).revision_number ?? 1;
  const revSuffix = rev > 1 ? `-R${rev}` : "";
  const nome = `checklist-${params.row.numero_publico || params.row.codigo_validacao || params.row.id.slice(0, 8)}${revSuffix}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

