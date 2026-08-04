import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { OpticalCeoFullData } from "@/lib/optical-map-data";
import { OUTPUT_STATE_LABEL, calcLossDb, classifyLoss } from "@/lib/optical-map";

const C = {
  page: "#020817",
  panel: "#06152d",
  cyan: "#19d8ff",
  green: "#45e35f",
  amber: "#ffb020",
  red: "#ff5268",
  border: "#1769db",
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
  title: { fontSize: 18, fontWeight: 700, color: C.text },
  subtitle: { marginTop: 2, fontSize: 9, color: C.muted, marginBottom: 10 },
  panel: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 8,
    backgroundColor: C.panel,
    marginBottom: 8,
  },
  panelTitle: { fontSize: 10, fontWeight: 700, marginBottom: 5 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#1e3a6b", paddingVertical: 3 },
  headerRow: { flexDirection: "row", paddingVertical: 3, backgroundColor: "#0c1f3f" },
  cell: { flex: 1, fontSize: 7.2, paddingHorizontal: 2 },
  headCell: { flex: 1, fontSize: 7, fontWeight: 700, color: C.cyan, paddingHorizontal: 2 },
  treeLine: { fontSize: 8, marginBottom: 2 },
  footer: { position: "absolute", bottom: 14, left: 20, right: 20, fontSize: 6.5, color: C.muted, textAlign: "center" },
});

function lossColor(cls: string) {
  if (cls === "critico") return C.red;
  if (cls === "atencao") return C.amber;
  return C.text;
}

function OpticalMapDocument({ data, generatedAt }: { data: OpticalCeoFullData; generatedAt: string }) {
  const { ceo, cables, splitters } = data;
  const totalCtos = splitters.reduce(
    (acc, s) => acc + s.outputs.filter((o) => o.estado === "cto").length,
    0,
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Mapa Óptico — {ceo.codigo}</Text>
        <Text style={s.subtitle}>
          {ceo.nome ?? ""} {ceo.bairro ? `· ${ceo.bairro}` : ""} {ceo.cidade ? `· ${ceo.cidade}` : ""} — gerado em{" "}
          {generatedAt}
        </Text>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Resumo</Text>
          <Text style={{ fontSize: 8 }}>
            {cables.length} cabo(s) cadastrado(s), {splitters.length} splitter(s), {totalCtos} CTO(s)
            alimentada(s) diretamente.
          </Text>
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Cabos</Text>
          <View style={s.headerRow}>
            <Text style={s.headCell}>Código</Text>
            <Text style={s.headCell}>Capacidade</Text>
            <Text style={s.headCell}>Tubos x fibras</Text>
            <Text style={s.headCell}>Tipo</Text>
          </View>
          {cables.map((c: any) => (
            <View key={c.id} style={s.row}>
              <Text style={s.cell}>{c.codigo}</Text>
              <Text style={s.cell}>{c.capacidade}F</Text>
              <Text style={s.cell}>{c.tubos} x {c.fibras_por_tubo}</Text>
              <Text style={s.cell}>{c.tipo ?? "—"}</Text>
            </View>
          ))}
          {cables.length === 0 && <Text style={{ fontSize: 7.5, color: C.muted }}>Nenhum cabo cadastrado.</Text>}
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Diagrama em árvore</Text>
          <Text style={s.treeLine}>{ceo.codigo}</Text>
          {splitters.map((sp) => (
            <View key={sp.id}>
              <Text style={s.treeLine}>
                {"  └── "}Splitter {sp.codigo} — {sp.tipo}
                {!sp.fibra_alimentadora_id ? " (sem fibra alimentadora)" : ""}
              </Text>
              {sp.outputs.map((o) => (
                <Text key={o.id} style={s.treeLine}>
                  {"      └── "}Saída {o.porta_numero} {o.cor} —{" "}
                  {o.optical_ctos?.codigo ? `CTO ${o.optical_ctos.codigo}` : OUTPUT_STATE_LABEL[o.estado] ?? o.estado}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Matriz de conexões</Text>
          <View style={s.headerRow}>
            <Text style={s.headCell}>Splitter</Text>
            <Text style={s.headCell}>Saída</Text>
            <Text style={s.headCell}>Estado</Text>
            <Text style={s.headCell}>Pot. saída</Text>
            <Text style={s.headCell}>CTO</Text>
            <Text style={s.headCell}>Pot. CTO</Text>
            <Text style={s.headCell}>Perda</Text>
          </View>
          {splitters.flatMap((sp) =>
            sp.outputs.map((o) => {
              const loss = calcLossDb(o.potencia_saida_dbm, o.potencia_chegada_dbm);
              const cls = classifyLoss(loss, sp.perda_nominal_db, sp.tolerancia_db);
              return (
                <View key={o.id} style={s.row}>
                  <Text style={s.cell}>{sp.codigo}</Text>
                  <Text style={s.cell}>{o.porta_numero} {o.cor}</Text>
                  <Text style={s.cell}>{OUTPUT_STATE_LABEL[o.estado] ?? o.estado}</Text>
                  <Text style={s.cell}>{o.potencia_saida_dbm ?? "—"}</Text>
                  <Text style={s.cell}>{o.optical_ctos?.codigo ?? "—"}</Text>
                  <Text style={s.cell}>{o.potencia_chegada_dbm ?? "—"}</Text>
                  <Text style={[s.cell, { color: lossColor(cls) }]}>{loss ?? "—"}</Text>
                </View>
              );
            }),
          )}
        </View>

        <Text style={s.footer} fixed>
          CheckTecnico · Mapa Óptico Inteligente (módulo experimental) · {generatedAt}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateOpticalMapPdf(data: OpticalCeoFullData): Promise<void> {
  const generatedAt = new Date().toLocaleString("pt-BR");
  const blob = await pdf(<OpticalMapDocument data={data} generatedAt={generatedAt} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mapa-optico-${data.ceo.codigo}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
