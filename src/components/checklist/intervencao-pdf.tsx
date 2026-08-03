import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";

import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type {
  ChecklistRow,
  FotoRow,
  IntervencaoData,
  TipoIntervencao,
} from "@/lib/checklist-schema";
import { TIPO_LABEL } from "@/lib/checklist-schema";
import {
  CAUSA_OPCOES,
  ESTADO_LABEL,
  INTERVENCAO_RECOMENDACAO_LABEL,
  PONTO_LABEL,
  URGENCIA_LABEL,
  routeLengthMeters,
  signalGainDb,
} from "@/lib/intervencao";
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
  title: { marginTop: 5, fontSize: 18, fontWeight: 700 },
  titleAccent: { color: C.cyan },
  subtitle: { marginTop: 2, color: C.muted, fontSize: 9 },
  code: { marginTop: 4, fontSize: 13, fontWeight: 700, color: C.cyan, letterSpacing: 1 },
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
  panelTitle: { fontSize: 10.5, fontWeight: 700, marginBottom: 6 },
  body: { fontSize: 7.8, color: C.text, lineHeight: 1.45 },
  mapImage: {
    width: "100%",
    height: 200,
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
    paddingVertical: 3.2,
  },
  td: { fontSize: 7.2 },
  signatureRow: { flexDirection: "row", marginTop: 10 },
  signatureBox: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderStyle: "dashed",
    marginHorizontal: 6,
    paddingTop: 4,
    alignItems: "center",
  },
  signatureImage: { width: 120, height: 40, objectFit: "contain", marginBottom: 2 },
  signatureLabel: { color: C.muted, fontSize: 6.6 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  photoCell: { width: "50%", paddingHorizontal: 3, paddingBottom: 6 },
  photoInner: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 7,
    padding: 4,
    backgroundColor: "#041126",
  },
  photoTag: {
    borderRadius: 4,
    paddingVertical: 1.6,
    paddingHorizontal: 5,
    fontSize: 6.4,
    fontWeight: 700,
    color: "#ffffff",
    alignSelf: "flex-start",
    marginBottom: 3,
  },
  photoImage: { width: "100%", height: 118, objectFit: "cover", borderRadius: 5 },
  photoCaption: { color: C.muted, fontSize: 6.2, marginTop: 2 },
  qrBox: { alignItems: "center", marginTop: 8 },
  qr: { width: 74, height: 74 },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.muted,
    fontSize: 6.4,
  },
});

type Params = {
  row: ChecklistRow;
  tecnicoNome: string;
  assinatura?: string | null;
  publicUrl?: string | null;
  fotos?: FotoRow[];
};

type DocProps = Omit<Params, "fotos"> & {
  logoUri: string;
  qrUri: string;
  mapUri: string;
  fotos: ResolvedFoto[];
};

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[s.infoCard, ...(wide ? [s.infoWide] : [])]}>
      <View style={s.infoInner}>
        <Text style={s.infoLabel}>{label.toUpperCase()}</Text>
        <Text style={s.infoValue}>{value || "—"}</Text>
      </View>
    </View>
  );
}

function causaLabel(tipo: TipoIntervencao, value: string): string {
  return CAUSA_OPCOES[tipo]?.find((o) => o.value === value)?.label || value || "—";
}

function fmtDateTime(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

function IntervencaoDocument({
  row,
  tecnicoNome,
  assinatura,
  publicUrl,
  logoUri,
  qrUri,
  mapUri,
  fotos,
}: DocProps) {
  const tipo = row.tipo as TipoIntervencao;
  const d = row.dados as IntervencaoData;
  const extensao = routeLengthMeters(d.rota?.pontos ?? []);
  const ganho = signalGainDb(d.sinal?.antes_dbm, d.sinal?.depois_dbm);
  const ai = d.ai_analysis ?? null;
  const revision = row.revision_number ?? 1;

  return (
    <Document
      title={`${TIPO_LABEL[tipo]} ${row.intervention_code ?? ""}`}
      author="CheckTecnico"
    >
      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          <View style={s.header}>
            {logoUri ? <Image src={logoUri} style={s.logo} /> : null}
            <Text style={s.title}>
              Check<Text style={s.titleAccent}>Tecnico</Text>
            </Text>
            <Text style={s.subtitle}>
              {TIPO_LABEL[tipo]} · Laudo técnico de intervenção de rede
              {revision > 1 ? ` · Revisão ${revision}` : ""}
            </Text>
            <Text style={s.code}>{row.intervention_code || "CÓDIGO PENDENTE"}</Text>
          </View>

          <View style={s.grid}>
            <Info label="Ordem de serviço" value={row.os || "—"} />
            <Info label="Cidade" value={row.cidade || "—"} />
            <Info label="Data" value={row.data_atendimento || "—"} />
            <Info label="Hora" value={row.hora_atendimento || "—"} />
            <Info label="Técnico responsável" value={tecnicoNome} wide />
            <Info label="CTO/NAP relacionada" value={d.contexto?.cto_codigo || "—"} />
            <Info label="Clientes afetados" value={d.contexto?.afetados_estimados || "—"} />
            <Info label="Causa" value={causaLabel(tipo, d.contexto?.causa)} wide />
            <Info label="Urgência" value={URGENCIA_LABEL[d.contexto?.urgencia ?? ""] || "—"} />
            <Info label="Estado final" value={ESTADO_LABEL[d.resultado?.estado ?? ""] || "—"} />
            {tipo === "rompimento" ? (
              <>
                <Info label="Início da interrupção" value={fmtDateTime(d.contexto?.inicio_interrupcao)} wide />
                <Info label="Normalização" value={fmtDateTime(d.contexto?.fim_interrupcao)} wide />
              </>
            ) : null}
          </View>

          <View style={s.panel}>
            <Text style={s.panelTitle}>Descrição da ocorrência</Text>
            <Text style={s.body}>{d.contexto?.descricao || "Sem descrição registrada."}</Text>
          </View>

          <View style={s.panel}>
            <Text style={s.panelTitle}>Evidência cartográfica da rota</Text>
            {mapUri ? (
              <Image src={mapUri} style={s.mapImage} />
            ) : (
              <Text style={s.mapMissing}>
                Snapshot cartográfico não gerado para esta intervenção.
              </Text>
            )}
            <View style={s.metaRow}>
              <Text style={s.metaChip}>Provedor: ArcGIS / Esri</Text>
              <Text style={s.metaChip}>Motor: MapLibre GL</Text>
              <Text style={s.metaChip}>Estilo: {d.rota?.meta?.basemap_style || "arcgis/imagery"}</Text>
              <Text style={s.metaChip}>Zoom: {d.rota?.snapshot?.zoom ?? d.rota?.meta?.zoom ?? "—"}</Text>
              <Text style={s.metaChip}>Pontos: {d.rota?.pontos?.length ?? 0}</Text>
              <Text style={s.metaChip}>Extensão calculada: {extensao} m</Text>
              {d.rota?.extensao_estimada_m ? (
                <Text style={s.metaChip}>Extensão informada: {d.rota.extensao_estimada_m} m</Text>
              ) : null}
              {d.rota?.gps_tecnico ? (
                <Text style={s.metaChip}>
                  GPS técnico: {d.rota.gps_tecnico.lat.toFixed(6)}, {d.rota.gps_tecnico.lng.toFixed(6)} · ±
                  {d.rota.gps_tecnico.accuracy_m ?? 0} m
                </Text>
              ) : null}
              {d.rota?.snapshot?.sha256 ? (
                <Text style={s.metaChip}>SHA-256: {d.rota.snapshot.sha256.slice(0, 24)}…</Text>
              ) : null}
            </View>
          </View>

          {(d.rota?.pontos ?? []).length > 0 ? (
            <View style={s.panel}>
              <Text style={s.panelTitle}>Pontos georreferenciados</Text>
              <View style={s.tableHead}>
                <Text style={[s.th, { width: "8%" }]}>#</Text>
                <Text style={[s.th, { width: "24%" }]}>TIPO</Text>
                <Text style={[s.th, { width: "30%" }]}>COORDENADAS</Text>
                <Text style={[s.th, { width: "38%" }]}>DESCRIÇÃO</Text>
              </View>
              {d.rota.pontos.map((p, i) => (
                <View key={p.id} style={s.tr}>
                  <Text style={[s.td, { width: "8%" }]}>{i + 1}</Text>
                  <Text style={[s.td, { width: "24%" }]}>{PONTO_LABEL[p.tipo] ?? p.tipo}</Text>
                  <Text style={[s.td, { width: "30%" }]}>
                    {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                  </Text>
                  <Text style={[s.td, { width: "38%" }]}>{p.descricao || "—"}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Materiais aplicados</Text>
            <View style={s.grid}>
              <Info label="Tipo de cabo" value={d.materiais?.cabo_tipo} wide />
              <Info label="Cabo (m)" value={d.materiais?.cabo_metros} />
              <Info label="Fusões" value={d.materiais?.fusoes_qtd} />
              <Info label="Conectores" value={d.materiais?.conectores_qtd} />
              <Info label="Postes" value={d.materiais?.postes_qtd} />
            </View>
            {d.materiais?.outros ? <Text style={s.body}>{d.materiais.outros}</Text> : null}
          </View>

          <View style={s.panel}>
            <Text style={s.panelTitle}>
              Medições OTDR {d.otdr?.realizado === "sim" ? "" : "— ensaio não realizado"}
            </Text>
            {(d.otdr?.medicoes ?? []).length > 0 ? (
              <>
                <View style={s.tableHead}>
                  <Text style={[s.th, { width: "14%" }]}>MOMENTO</Text>
                  <Text style={[s.th, { width: "16%" }]}>FIBRA</Text>
                  <Text style={[s.th, { width: "16%" }]}>DIST. (KM)</Text>
                  <Text style={[s.th, { width: "18%" }]}>ATENUAÇÃO (dB)</Text>
                  <Text style={[s.th, { width: "18%" }]}>PERDA EVENTO</Text>
                  <Text style={[s.th, { width: "18%" }]}>OBS.</Text>
                </View>
                {d.otdr.medicoes.map((m) => (
                  <View key={m.id} style={s.tr}>
                    <Text style={[s.td, { width: "14%", color: m.momento === "antes" ? C.amber : C.green }]}>
                      {m.momento === "antes" ? "Antes" : "Depois"}
                    </Text>
                    <Text style={[s.td, { width: "16%" }]}>{m.fibra || "—"}</Text>
                    <Text style={[s.td, { width: "16%" }]}>{m.distancia_km || "—"}</Text>
                    <Text style={[s.td, { width: "18%" }]}>{m.atenuacao_db || "—"}</Text>
                    <Text style={[s.td, { width: "18%" }]}>{m.perda_evento_db || "—"}</Text>
                    <Text style={[s.td, { width: "18%" }]}>{m.observacao || "—"}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={s.body}>Nenhuma medição registrada.</Text>
            )}
            <View style={s.metaRow}>
              <Text style={s.metaChip}>Laudos anexados: {(d.otdr?.laudos ?? []).length}</Text>
              {(d.otdr?.laudos ?? []).map((l) => (
                <Text key={l.id} style={s.metaChip}>
                  {l.momento === "antes" ? "Antes" : "Depois"}: {l.filename}
                </Text>
              ))}
            </View>
          </View>

          <View style={s.panel}>
            <Text style={s.panelTitle}>Potência óptica</Text>
            <View style={s.grid}>
              <Info label="Antes (dBm)" value={d.sinal?.antes_dbm} />
              <Info label="Depois (dBm)" value={d.sinal?.depois_dbm} />
              <Info
                label="Ganho apurado"
                value={ganho === null ? "—" : `${ganho > 0 ? "+" : ""}${ganho} dB`}
              />
              <Info label="Referência" value={d.sinal?.cliente_afetado} />
            </View>
          </View>

          <View style={s.panel}>
            <Text style={s.panelTitle}>Execução e resultado</Text>
            <View style={s.grid}>
              <Info label="Equipe" value={d.execucao?.equipe} wide />
              <Info label="Início" value={d.execucao?.inicio} />
              <Info label="Fim" value={d.execucao?.fim} />
              <Info
                label="Concluída"
                value={d.execucao?.concluida === "sim" ? "Sim" : d.execucao?.concluida === "nao" ? "Não" : "—"}
              />
              <Info label="Estado" value={ESTADO_LABEL[d.resultado?.estado ?? ""] || "—"} />
              <Info label="Pendência" value={d.execucao?.pendencia} wide />
            </View>
            {d.resultado?.observacoes ? <Text style={s.body}>{d.resultado.observacoes}</Text> : null}
          </View>

          {ai ? (
            <View style={s.panel}>
              <Text style={s.panelTitle}>Revisão consultiva por IA</Text>
              <Text style={s.body}>Diagnóstico: {ai.diagnostico_provavel}</Text>
              <Text style={s.body}>Causa raiz: {ai.causa_raiz}</Text>
              <Text style={s.body}>
                Recomendação: {INTERVENCAO_RECOMENDACAO_LABEL[ai.recomendacao] || ai.recomendacao}
              </Text>
              <Text style={s.body}>{ai.resumo_tecnico}</Text>
              {ai.inconsistencias?.length ? (
                <Text style={[s.body, { color: C.amber, marginTop: 3 }]}>
                  Pontos de atenção: {ai.inconsistencias.join(" · ")}
                </Text>
              ) : null}
              <Text style={[s.signatureLabel, { marginTop: 3 }]}>
                Gerado em {fmtDateTime(ai.gerado_em)} · modelo {ai.modelo_ia}
              </Text>
            </View>
          ) : null}

          <View style={s.panel} wrap={false}>
            <Text style={s.panelTitle}>Evidências fotográficas (antes e depois)</Text>
            {fotos.length === 0 ? (
              <Text style={s.body}>
                Nenhuma foto de evidência anexada a esta revisão.
              </Text>
            ) : (
              <View style={s.photoGrid}>
                {fotos.map((f) => (
                  <View key={f.id} style={s.photoCell}>
                    <View style={s.photoInner}>
                      <Text
                        style={[
                          s.photoTag,
                          {
                            backgroundColor:
                              f.categoria === "antes"
                                ? "#8a3b12"
                                : f.categoria === "depois"
                                  ? "#1b7f3b"
                                  : "#0c45a5",
                          },
                        ]}
                      >
                        {f.categoria === "antes"
                          ? "ANTES"
                          : f.categoria === "depois"
                            ? "DEPOIS"
                            : f.label.toUpperCase()}
                      </Text>
                      <Image src={f.uri} style={s.photoImage} />
                      {f.legenda ? <Text style={s.photoCaption}>{f.legenda}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={s.signatureRow}>
            <View style={s.signatureBox}>
              {assinatura ? <Image src={assinatura} style={s.signatureImage} /> : null}
              <Text style={s.signatureLabel}>{tecnicoNome}</Text>
              <Text style={s.signatureLabel}>Técnico responsável</Text>
            </View>
            <View style={s.signatureBox}>
              <Text style={s.signatureLabel}>Supervisão / NOC</Text>
            </View>
          </View>

          {qrUri ? (
            <View style={s.qrBox}>
              <Image src={qrUri} style={s.qr} />
              <Text style={s.signatureLabel}>Validação pública do documento</Text>
              <Text style={s.signatureLabel}>{publicUrl}</Text>
            </View>
          ) : null}

          <View style={s.footer}>
            <Text>CheckTecnico · {TIPO_LABEL[tipo]}</Text>
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
  const path = (row.dados as IntervencaoData)?.rota?.snapshot?.snapshot_path;
  if (!path) return "";
  try {
    const signed = await getMapSnapshotUrl({ data: { path } });
    return signed ? await toDataUri(signed) : "";
  } catch {
    return "";
  }
}

export async function buildIntervencaoPdfBlob(params: Params): Promise<Blob> {
  const { fotos: fotoRows, ...rest } = params;
  const [logoUri, qrUri, mapUri, fotos] = await Promise.all([
    toDataUri(logoAsset.url).catch(() => ""),
    params.publicUrl
      ? QRCode.toDataURL(params.publicUrl, {
          margin: 1,
          width: 320,
          errorCorrectionLevel: "M",
        }).catch(() => "")
      : Promise.resolve(""),
    resolveMapUri(params.row),
    resolveFotoDataUris(fotoRows ?? []).catch(() => [] as ResolvedFoto[]),
  ]);
  return await pdf(
    <IntervencaoDocument
      {...rest}
      logoUri={logoUri}
      qrUri={qrUri}
      mapUri={mapUri}
      fotos={fotos}
    />,
  ).toBlob();
}

export async function generateIntervencaoPdf(params: Params): Promise<void> {
  const blob = await buildIntervencaoPdfBlob(params);
  const revision = params.row.revision_number ?? 1;
  const suffix = revision > 1 ? `-R${revision}` : "";
  const code =
    params.row.intervention_code || params.row.numero_publico || params.row.id.slice(0, 8);
  const blob_url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blob_url;
  anchor.download = `${params.row.tipo}-${code}${suffix}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(blob_url), 4000);
}
