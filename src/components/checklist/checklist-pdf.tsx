import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ChecklistRow, FotoRow } from "@/lib/checklist-schema";
import { FOTO_CATEGORIAS } from "@/lib/checklist-schema";
import { signedFotoUrl } from "@/lib/checklists";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";

const BRAND = "#1a53ff";
const BORDER = "#c9d3e6";

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    marginBottom: 8,
  },
  headerLogo: { width: 90, height: 45, objectFit: "contain", margin: 6 },
  headerTextBox: {
    flex: 1,
    padding: 8,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    backgroundColor: "#f4f7ff",
  },
  headerTitle: { fontSize: 12, fontWeight: 700, color: BRAND },
  headerSub: { fontSize: 9, color: "#334155", marginTop: 2 },
  warn: {
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    padding: 6,
    borderRadius: 4,
    marginBottom: 8,
    fontSize: 9,
  },
  sectionTitle: {
    backgroundColor: BRAND,
    color: "white",
    fontWeight: 700,
    padding: 4,
    marginTop: 8,
    marginBottom: 4,
    fontSize: 10,
    borderRadius: 2,
  },
  grid2: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "50%",
    paddingRight: 6,
    paddingVertical: 1.5,
    flexDirection: "row",
  },
  cell3: { width: "33.33%", paddingRight: 6, paddingVertical: 1.5, flexDirection: "row" },
  label: { color: "#475569", marginRight: 3 },
  value: { fontWeight: 700 },
  checkboxRow: {
    width: "50%",
    flexDirection: "row",
    paddingVertical: 1.5,
    paddingRight: 6,
  },
  checkbox: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 4,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { fontSize: 9, lineHeight: 1, color: BRAND, fontWeight: 700 },
  relato: {
    borderWidth: 1,
    borderColor: BORDER,
    padding: 6,
    minHeight: 60,
    borderRadius: 3,
  },
  footer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#475569",
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap" },
  photoItem: {
    width: "48%",
    marginRight: "2%",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    borderRadius: 3,
  },
  photoImg: { width: "100%", height: 180, objectFit: "cover" },
  photoLabel: { fontSize: 8, marginTop: 3, color: "#334155" },
});

const Chk = ({ v, label }: { v: boolean; label: string }) => (
  <View style={styles.checkboxRow}>
    <View style={styles.checkbox}>
      {v ? <Text style={styles.checkboxMark}>X</Text> : null}
    </View>
    <Text>{label}</Text>
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
};

function ChecklistDocument({
  row,
  fotos,
  tecnicoNome,
  logoUri,
}: Params & { logoUri: string }) {
  const d = row.dados;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {logoUri ? <Image src={logoUri} style={styles.headerLogo} /> : null}
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>
              CHECKLIST TÉCNICO DE VALIDAÇÃO DE ONT
            </Text>
            <Text style={styles.headerSub}>Uso exclusivo do técnico de campo</Text>
          </View>
        </View>

        <View style={styles.warn}>
          <Text>
            IMPORTANTE: preencher antes de solicitar a troca e não restaurar a
            ONT antes de enviar as evidências ao NOC.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. Identificação do atendimento</Text>
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

        <Text style={styles.sectionTitle}>2. Sintoma confirmado em campo</Text>
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

        <Text style={styles.sectionTitle}>3. Validação física</Text>
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

        <Text style={styles.sectionTitle}>4. Teste cabeado</Text>
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

        <Text style={styles.sectionTitle}>5. Teste Wi-Fi</Text>
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

        <Text style={styles.sectionTitle}>6. Evidências marcadas</Text>
        <View style={styles.grid2}>
          <Chk v={d.evidencias_marcadas.etiqueta} label="Foto da etiqueta (modelo/serial)" />
          <Chk v={d.evidencias_marcadas.leds} label="Foto dos LEDs da ONT" />
          <Chk v={d.evidencias_marcadas.fonte} label="Foto da fonte/conexões" />
          <Chk v={d.evidencias_marcadas.teste_cabeado} label="Evidência do teste cabeado" />
          <Chk v={d.evidencias_marcadas.teste_wifi} label="Evidência do teste Wi-Fi" />
        </View>

        <Text style={styles.sectionTitle}>7. Resultado após reset/teste final</Text>
        <View style={styles.grid2}>
          <Chk v={d.resultado_final.permaneceu} label="Falha permaneceu" />
          <Chk v={d.resultado_final.parou} label="Falha parou" />
          <Chk v={d.resultado_final.nao_reproduzida} label="Não foi reproduzida" />
          <Field label="Encaminhado ao NOC" value={yesNo(d.resultado_final.encaminhado_noc)} />
          <Field label="Interrompeu atendimento" value={yesNo(d.resultado_final.interrompeu)} />
          <Field label="Motivo" value={d.resultado_final.motivo} w="100%" />
        </View>

        <Text style={styles.sectionTitle}>8. Relato objetivo do técnico</Text>
        <View style={styles.relato}>
          <Text>{d.relato || "—"}</Text>
        </View>

        <Text style={styles.sectionTitle}>9. Registro da autorização do NOC</Text>
        <View style={styles.grid2}>
          <Field label="Troca autorizada" value={yesNo(d.noc.autorizada)} />
          <Field label="Analista" value={d.noc.analista} />
          <Field label="Data" value={d.noc.data} />
          <Field label="Hora" value={d.noc.hora} />
          <Field label="Protocolo/OS do NOC" value={d.noc.protocolo} w="100%" />
        </View>

        <View style={styles.footer}>
          <Text>Técnico: {tecnicoNome || "—"}</Text>
          <Text>
            Finalizado:{" "}
            {row.finalizado_em
              ? new Date(row.finalizado_em).toLocaleString("pt-BR")
              : "rascunho"}
          </Text>
          <Text>Validação: {row.codigo_validacao || "—"}</Text>
        </View>
      </Page>

      {fotos.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Evidências fotográficas</Text>
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
        </Page>
      )}
    </Document>
  );
}

export async function generateChecklistPdf({ row, fotos, tecnicoNome }: Params) {
  // Baixa o logo e as fotos como data-URIs (react-pdf on-web precisa de URL acessível)
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

  const blob = await pdf(
    <ChecklistDocument
      row={row}
      fotos={fotosComUri}
      tecnicoNome={tecnicoNome}
      logoUri={logoUri}
    />,
  ).toBlob();

  const nome = `checklist-${row.codigo_validacao || row.id.slice(0, 8)}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
