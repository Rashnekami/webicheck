import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";

import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { ChecklistRow, FotoRow, RemapeamentoData } from "@/lib/checklist-schema";
import { computeSplitterStats, fiberColorBySlug } from "@/lib/remapeamento-fibers";
import { getMapSnapshotUrl } from "@/lib/map-snapshot.functions";
import { resolveFotoDataUris, type ResolvedFoto } from "@/lib/checklist-photo-uris";

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
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 18,
    backgroundColor: C.page,
    color: C.text,
    fontFamily: "Helvetica",
    fontSize: 8.4,
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
  title: { marginTop: 5, fontSize: 19, fontWeight: 700 },
  titleAccent: { color: C.cyan },
  subtitle: { marginTop: 2, color: C.muted, fontSize: 9 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -2.5, marginBottom: 5 },
  infoCard: { width: "25%", paddingHorizontal: 2.5, paddingBottom: 5 },
  infoWide: { width: "50%" },
  infoInner: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 7,
    padding: 5,
    backgroundColor: C.panel,
  },
  infoLabel: { color: C.muted, fontSize: 6.3, marginBottom: 2 },
  infoValue: { fontSize: 7.6, fontWeight: 700 },
  panel: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    padding: 7,
    backgroundColor: C.panel,
    marginTop: 5,
  },
  panelTitle: { fontSize: 10.5, fontWeight: 700, marginBottom: 6, color: C.text },
  mapImage: {
    width: "100%",
    height: 190,
    objectFit: "cover",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  mapMissing: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.amber,
    borderRadius: 8,
    padding: 10,
    color: C.amber,
    fontSize: 7.5,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  metaChip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginRight: 4,
    marginBottom: 3,
    color: C.muted,
    fontSize: 6.4,
  },
  link: { color: C.cyan, fontSize: 7, marginTop: 3 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 3,
    marginBottom: 2,
  },
  th: { color: C.muted, fontSize: 6.4, fontWeight: 700 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#12335c",
    paddingVertical: 3.4,
  },
  cPorta: { width: "9%", fontSize: 7.4, fontWeight: 700 },
  cCor: { width: "20%" },
  cStatus: { width: "17%" },
  cCliente: { width: "34%", fontSize: 7, color: C.text },
  cPot: { width: "20%", fontSize: 7.2, textAlign: "right" },
  colorTag: {
    borderRadius: 4,
    paddingVertical: 1.6,
    paddingHorizontal: 4,
    fontSize: 6.4,
    fontWeight: 700,
    alignSelf: "flex-start",
  },
  statusTag: {
    borderRadius: 4,
    paddingVertical: 1.6,
    paddingHorizontal: 4,
    fontSize: 6.2,
    fontWeight: 700,
    alignSelf: "flex-start",
    color: "#ffffff",
  },
  statCol: { width: "20%", paddingHorizontal: 3 },
  statCard: {
    borderWidth: 1,
    borderColor: C.cyan,
    borderRadius: 8,
    padding: 6,
    backgroundColor: "#041126",
  },
  statLabel: { color: C.cyan, fontSize: 6.2, fontWeight: 700 },
  statValue: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  signBox: {
    height: 58,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.cyan,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    padding: 4,
    marginTop: 4,
  },
  signImage: { maxHeight: 50, maxWidth: "92%", objectFit: "contain" },
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
});

const STATUS_LABEL: Record<string, { label: string; bg: string }> = {
  ocupada: { label: "OCUPADA", bg: "#1b7f3b" },
  livre: { label: "LIVRE", bg: "#0c45a5" },
  reserva: { label: "RESERVA", bg: "#8a6a12" },
  nao_identificada: { label: "NÃO IDENT.", bg: "#5a2230" },
  nao_identificado: { label: "NÃO IDENT.", bg: "#5a2230" },
};

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? [s.infoCard, s.infoWide] : s.infoCard}>
      <View style={s.infoInner}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value || "—"}</Text>
      </View>
    </View>
  );
}

type Params = {
  row: ChecklistRow;
  tecnicoNome: string;
  assinatura?: string | null;
  publicUrl?: string | null;
  fotos?: FotoRow[];
};

type RenderParams = Omit<Params, "fotos"> & {
  logoUri: string;
  qrUri: string;
  mapUri: string;
  fotos: ResolvedFoto[];
};

function RemapeamentoDocument({
  row,
  tecnicoNome,
  assinatura,
  publicUrl,
  logoUri,
  qrUri,
  mapUri,
  fotos,
}: RenderParams) {
  const d = row.dados as RemapeamentoData;
  const stats = computeSplitterStats(d);
  const ativo = d.localizacao?.ativo ?? null;
  const pos = ativo ?? d.localizacao?.confirmada ?? null;
  const meta = d.localizacao?.meta ?? null;
  const gps = d.localizacao?.gps_original ?? null;
  const data = row.data_atendimento
    ? new Date(`${row.data_atendimento}T00:00:00`).toLocaleDateString("pt-BR")
    : "—";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          <View style={s.header}>
            {logoUri ? <Image src={logoUri} style={s.logo} /> : null}
            <Text style={s.title}>
              REMAPEAMENTO DE <Text style={s.titleAccent}>CTO / NAP</Text>
            </Text>
            <Text style={s.subtitle}>
              {row.rmap_code || row.numero_publico || row.codigo_validacao || row.id.slice(0, 8)} ·
              Revisão {row.revision_number ?? 1}
            </Text>
          </View>

          <View style={s.grid}>
            <Info label="CÓDIGO RMAP" value={row.rmap_code ?? "—"} />
            <Info label="CTO / NAP" value={d.identificacao?.cto_codigo ?? ""} />
            <Info label="SETOR" value={d.identificacao?.setor ?? ""} />
            <Info label="CIDADE" value={row.cidade ?? ""} />
            <Info label="TÉCNICO" value={tecnicoNome} wide />
            <Info label="DATA" value={data} />
            <Info label="HORA" value={row.hora_atendimento ?? "—"} />
          </View>

          {/* Localização geográfica verificada */}
          <View style={s.panel}>
            <Text style={s.panelTitle}>Localização da CTO (confirmada em campo)</Text>
            {mapUri ? (
              <Image src={mapUri} style={s.mapImage} />
            ) : (
              <Text style={s.mapMissing}>
                Imagem cartográfica não gerada para esta revisão. Gere a evidência de mapa no
                checklist antes de emitir o documento definitivo.
              </Text>
            )}
            <View style={s.metaRow}>
              <Text style={s.metaChip}>
                Ativo: {pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : "não confirmado"}
              </Text>
              {gps && (
                <Text style={s.metaChip}>
                  GPS técnico: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} · ±{gps.accuracy_m ?? 0} m
                </Text>
              )}
              {d.localizacao?.distancia_m != null && (
                <Text style={s.metaChip}>Distância técnico → ativo: {d.localizacao.distancia_m} m</Text>
              )}
              {d.localizacao?.confirmada_em && (
                <Text style={s.metaChip}>
                  Confirmado em {new Date(d.localizacao.confirmada_em).toLocaleString("pt-BR")}
                </Text>
              )}
              {meta && (
                <Text style={s.metaChip}>
                  {meta.map_engine}/{meta.map_provider} · {meta.basemap_style} · zoom {meta.zoom}
                </Text>
              )}
              {d.localizacao?.snapshot && (
                <Text style={s.metaChip}>SHA-256 {d.localizacao.snapshot.sha256.slice(0, 16)}…</Text>
              )}
            </View>
            {pos && (
              <Text style={s.link}>
                Abrir no Google Maps: https://maps.google.com/?q={pos.lat},{pos.lng}
              </Text>
            )}
            <Text style={s.authText}>Fonte cartográfica: ArcGIS / Esri</Text>
          </View>

          {/* Splitter */}
          <View style={s.panel}>
            <Text style={s.panelTitle}>Splitter e potências</Text>
            <View style={{ flexDirection: "row", marginHorizontal: -3 }}>
              {[
                {
                  l: "TIPO",
                  v: d.splitter?.tipo === "outro" ? d.splitter?.tipo_outro || "Outro" : (d.splitter?.tipo ?? "—"),
                },
                { l: "ENTRADA", v: stats.entrada_dbm != null ? `${stats.entrada_dbm} dBm` : "—" },
                { l: "MÉDIA SAÍDA", v: stats.media_saida_dbm != null ? `${stats.media_saida_dbm} dBm` : "—" },
                { l: "PERDA MÉDIA", v: stats.perda_media_db != null ? `${stats.perda_media_db} dB` : "—" },
                { l: "OCUPAÇÃO", v: `${stats.ocupadas}/${stats.total}` },
              ].map((k) => (
                <View key={k.l} style={s.statCol}>
                  <View style={s.statCard}>
                    <Text style={s.statLabel}>{k.l}</Text>
                    <Text style={s.statValue}>{k.v}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Portas */}
          <View style={s.panel}>
            <Text style={s.panelTitle}>Mapeamento de portas (TIA-598-C)</Text>
            <View style={s.tableHead}>
              <Text style={[s.th, s.cPorta]}>PORTA</Text>
              <Text style={[s.th, s.cCor]}>COR DA FIBRA</Text>
              <Text style={[s.th, s.cStatus]}>STATUS</Text>
              <Text style={[s.th, s.cCliente]}>CLIENTE / ID</Text>
              <Text style={[s.th, s.cPot]}>POTÊNCIA</Text>
            </View>
            {(d.portas ?? []).map((p) => {
              const color = fiberColorBySlug(p.cor);
              const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.livre;
              return (
                <View key={p.numero} style={s.tr}>
                  <Text style={s.cPorta}>{String(p.numero).padStart(2, "0")}</Text>
                  <View style={s.cCor}>
                    <Text style={[s.colorTag, { backgroundColor: color.hex, color: color.ink }]}>
                      {p.cor_custom || color.label}
                    </Text>
                  </View>
                  <View style={s.cStatus}>
                    <Text style={[s.statusTag, { backgroundColor: st.bg }]}>{st.label}</Text>
                  </View>
                  <Text style={s.cCliente}>
                    {[p.cliente, p.cliente_id].filter(Boolean).join(" · ") || "—"}
                  </Text>
                  <Text style={s.cPot}>{p.potencia_dbm ? `${p.potencia_dbm} dBm` : "—"}</Text>
                </View>
              );
            })}
          </View>

          {/* Resultado + assinatura */}
          <View style={s.panel}>
            <Text style={s.panelTitle}>Resultado do remapeamento</Text>
            <Text style={{ color: d.resultado?.estado === "sim" ? C.green : C.amber, fontSize: 8 }}>
              {d.resultado?.estado === "sim"
                ? "CTO remapeada integralmente."
                : d.resultado?.estado === "parcialmente"
                  ? "CTO remapeada parcialmente."
                  : "Resultado não informado."}
            </Text>
            {d.resultado?.pendencia ? (
              <Text style={{ color: C.muted, fontSize: 7, marginTop: 3 }}>
                Pendências: {d.resultado.pendencia}
              </Text>
            ) : null}
            <View style={s.signBox}>
              {assinatura ? (
                <Image src={assinatura} style={s.signImage} />
              ) : (
                <Text style={{ color: "#64748b", fontSize: 7 }}>Sem assinatura cadastrada</Text>
              )}
            </View>
            <Text style={{ fontSize: 6.8, fontWeight: 700, marginTop: 3, textAlign: "center" }}>
              {tecnicoNome}
            </Text>
          </View>

          {publicUrl ? (
            <View style={s.authenticity}>
              {qrUri ? <Image src={qrUri} style={s.qr} /> : null}
              <View>
                <Text style={s.authTitle}>VALIDAÇÃO PÚBLICA DO DOCUMENTO</Text>
                <Text style={s.authText}>{publicUrl}</Text>
              </View>
            </View>
          ) : null}

          <View style={s.footer}>
            <Text>WebiCheck · Remapeamento de CTO/NAP</Text>
            <Text>Emitido em {new Date().toLocaleString("pt-BR")}</Text>
          </View>
        </View>
      </Page>
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

async function resolveMapUri(row: ChecklistRow): Promise<string> {
  const path = (row.dados as RemapeamentoData)?.localizacao?.snapshot?.snapshot_path;
  if (!path) return "";
  try {
    const signed = await getMapSnapshotUrl({ data: { path } });
    return signed ? await toDataUri(signed) : "";
  } catch {
    return "";
  }
}

export async function buildRemapeamentoPdfBlob(params: Params): Promise<Blob> {
  const [logoUri, qrUri, mapUri] = await Promise.all([
    toDataUri(logoAsset.url).catch(() => ""),
    params.publicUrl
      ? QRCode.toDataURL(params.publicUrl, { margin: 1, width: 320, errorCorrectionLevel: "M" }).catch(
          () => "",
        )
      : Promise.resolve(""),
    resolveMapUri(params.row),
  ]);
  return await pdf(
    <RemapeamentoDocument {...params} logoUri={logoUri} qrUri={qrUri} mapUri={mapUri} />,
  ).toBlob();
}

export async function generateRemapeamentoPdf(params: Params): Promise<void> {
  const blob = await buildRemapeamentoPdfBlob(params);
  const revision = params.row.revision_number ?? 1;
  const suffix = revision > 1 ? `-R${revision}` : "";
  const name = `remapeamento-${params.row.rmap_code || params.row.numero_publico || params.row.id.slice(0, 8)}${suffix}.pdf`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
