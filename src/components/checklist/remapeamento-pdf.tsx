import { Document, Image, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";

import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { ChecklistRow, FotoRow, RemapeamentoData } from "@/lib/checklist-schema";
import { fiberColorBySlug } from "@/lib/remapeamento-fibers";
import { getMapSnapshotUrl } from "@/lib/map-snapshot.functions";
import { resolveFotoDataUris, type ResolvedFoto } from "@/lib/checklist-photo-uris";
import { optimizeImageDataUri, optimizeImageDataUris } from "@/lib/pdf-image-optimize";
import {
  buildRemapReport,
  evidenceCaption,
  remapDocumentCode,
  type RemapReport,
} from "@/lib/remapeamento-report";

/* ---------------------------------------------------------------- tokens */

const C = {
  navy: "#0b2545",
  navySoft: "#13355f",
  blue: "#1667c9",
  cyan: "#0e9fc4",
  ink: "#0f172a",
  muted: "#5b6b82",
  line: "#cfe0f5",
  card: "#f5f8fc",
  white: "#ffffff",
  green: "#1f8a4c",
  amber: "#b7791f",
  red: "#c02436",
};

const STATUS_COLOR: Record<string, string> = {
  concluido: C.green,
  pendencia: C.red,
  incompleto: C.amber,
};

const s = StyleSheet.create({
  page: {
    paddingTop: 62,
    paddingBottom: 40,
    paddingHorizontal: 26,
    backgroundColor: C.white,
    color: C.ink,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.3,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: C.navy,
    paddingHorizontal: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  logo: { width: 32, height: 32, objectFit: "cover", borderRadius: 5, marginRight: 8 },
  headerTitle: { color: C.white, fontSize: 12, fontWeight: 700 },
  headerSub: { color: "#a9c6ea", fontSize: 7.5, marginTop: 1 },
  headerCode: { color: "#7fe3ff", fontSize: 10, fontFamily: "Courier-Bold", textAlign: "right" },
  headerMeta: { color: "#a9c6ea", fontSize: 7, textAlign: "right", marginTop: 1 },

  footerBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: C.navy,
    paddingHorizontal: 26,
    justifyContent: "center",
  },
  footerText: { color: "#b7d2f0", fontSize: 7 },

  sectionTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    color: C.navy,
    marginTop: 10,
    marginBottom: 5,
    borderBottomWidth: 1.2,
    borderBottomColor: C.cyan,
    paddingBottom: 2.5,
  },
  row: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  cell25: { width: "25%", paddingHorizontal: 3, paddingBottom: 6 },
  cell33: { width: "33.33%", paddingHorizontal: 3, paddingBottom: 6 },
  cell50: { width: "50%", paddingHorizontal: 3, paddingBottom: 6 },
  field: {
    borderWidth: 0.8,
    borderColor: C.line,
    borderRadius: 4,
    backgroundColor: C.card,
    paddingVertical: 4,
    paddingHorizontal: 5,
    minHeight: 30,
  },
  fieldLabel: { color: C.muted, fontSize: 6.5, fontWeight: 700 },
  fieldValue: { fontSize: 8.6, marginTop: 1.5 },
  mono: { fontFamily: "Courier" },

  badge: {
    alignSelf: "flex-start",
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    color: C.white,
    fontSize: 8.5,
    fontWeight: 700,
  },

  mapImage: {
    width: "100%",
    height: 150,
    objectFit: "cover",
    borderRadius: 5,
    borderWidth: 0.8,
    borderColor: C.line,
  },
  warnBox: {
    borderWidth: 0.8,
    borderStyle: "dashed",
    borderColor: C.amber,
    borderRadius: 4,
    padding: 6,
    color: C.amber,
    fontSize: 8,
  },
  legendRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 3 },
  legendText: { fontSize: 7.2, color: C.muted, marginRight: 10 },
  link: { color: C.blue, fontSize: 8, textDecoration: "underline" },
  credit: { fontSize: 7, color: C.muted, marginTop: 3 },

  statCard: {
    borderWidth: 0.8,
    borderColor: C.line,
    borderLeftWidth: 2.4,
    borderLeftColor: C.cyan,
    borderRadius: 4,
    backgroundColor: C.card,
    paddingVertical: 4,
    paddingHorizontal: 5,
    minHeight: 32,
  },
  statLabel: { color: C.muted, fontSize: 6.4, fontWeight: 700 },
  statValue: { fontSize: 11, fontWeight: 700, marginTop: 1 },

  th: {
    color: C.white,
    fontSize: 7.4,
    fontWeight: 700,
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  theadRow: { flexDirection: "row", backgroundColor: C.navySoft, borderRadius: 3 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.6,
    borderBottomColor: C.line,
    paddingVertical: 3.4,
    paddingHorizontal: 3,
  },
  trAlt: { backgroundColor: "#eef4fb" },
  td: { fontSize: 8.2 },
  colorTag: {
    borderRadius: 3,
    paddingVertical: 1.8,
    paddingHorizontal: 4,
    fontSize: 7,
    fontWeight: 700,
    alignSelf: "flex-start",
    borderWidth: 0.7,
    borderColor: "#334155",
  },
  statusTag: {
    borderRadius: 3,
    paddingVertical: 1.8,
    paddingHorizontal: 4,
    fontSize: 6.8,
    fontWeight: 700,
    alignSelf: "flex-start",
    color: C.white,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  chip: {
    borderWidth: 0.7,
    borderColor: C.line,
    backgroundColor: C.card,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginRight: 4,
    marginBottom: 3,
    fontSize: 7.4,
    color: C.ink,
  },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  photoCell: { width: "33.33%", paddingHorizontal: 3, paddingBottom: 6 },
  photoInner: {
    borderWidth: 0.8,
    borderColor: C.line,
    borderRadius: 4,
    padding: 3,
    backgroundColor: C.card,
  },
  photoImage: { width: "100%", height: 105, objectFit: "cover", borderRadius: 3 },
  photoCaption: { fontSize: 6.8, color: C.muted, marginTop: 2.5 },

  closure: {
    borderWidth: 0.8,
    borderColor: C.line,
    borderRadius: 5,
    padding: 8,
    backgroundColor: C.card,
    marginTop: 10,
  },
  signBox: {
    height: 62,
    borderWidth: 0.8,
    borderStyle: "dashed",
    borderColor: C.blue,
    borderRadius: 4,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  signImage: { maxHeight: 54, maxWidth: "92%", objectFit: "contain" },
  qr: { width: 62, height: 62, marginRight: 8 },
});

const STATUS_LABEL: Record<string, { label: string; bg: string }> = {
  ocupada: { label: "OCUPADA", bg: "#1f8a4c" },
  livre: { label: "LIVRE", bg: "#1667c9" },
  reserva: { label: "RESERVA", bg: "#b7791f" },
  nao_identificada: { label: "NÃO IDENT.", bg: "#7a2230" },
  nao_identificado: { label: "NÃO IDENT.", bg: "#7a2230" },
};

const COL = {
  porta: "10%",
  cor: "22%",
  status: "18%",
  cliente: "32%",
  pot: "18%",
} as const;

/* ------------------------------------------------------------ componentes */

function Field({
  label,
  value,
  mono,
  width = 25,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  width?: 25 | 33 | 50;
}) {
  const cell = width === 50 ? s.cell50 : width === 33 ? s.cell33 : s.cell25;
  return (
    <View style={cell}>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Text style={mono ? [s.fieldValue, s.mono] : s.fieldValue}>{value?.trim() || "—"}</Text>
      </View>
    </View>
  );
}

function StatusBadge({ report }: { report: RemapReport }) {
  return (
    <Text style={[s.badge, { backgroundColor: STATUS_COLOR[report.status] }]}>
      {report.statusLabel}
    </Text>
  );
}

function DocumentHeader({ code, revision }: { code: string; revision: number }) {
  return (
    <View style={s.headerBar} fixed>
      <View style={s.headerLeft}>
        {logoUriRef.value ? <Image src={logoUriRef.value} style={s.logo} /> : null}
        <View>
          <Text style={s.headerTitle}>Remapeamento de CTO/NAP</Text>
          <Text style={s.headerSub}>CheckTecnico · Documento técnico de campo</Text>
        </View>
      </View>
      <View>
        <Text style={s.headerCode}>{code}</Text>
        <Text style={s.headerMeta}>Revisão {revision}</Text>
      </View>
    </View>
  );
}

function DocumentFooter({ code, emitido }: { code: string; emitido: string }) {
  return (
    <View style={s.footerBar} fixed>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `CheckTecnico • ${code} • Emitido em ${emitido} • Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

function LocationSection({ d, mapUri }: { d: RemapeamentoData; mapUri: string }) {
  const ativo = d.localizacao?.ativo ?? null;
  const pos = ativo ?? d.localizacao?.confirmada ?? null;
  const gps = d.localizacao?.gps_original ?? null;
  const dist = d.localizacao?.distancia_m ?? d.localizacao?.meta?.distancia_tecnico_ativo_m ?? null;
  return (
    <View>
      <Text style={s.sectionTitle}>Localização</Text>
      {mapUri ? (
        <Image src={mapUri} style={s.mapImage} />
      ) : (
        <Text style={s.warnBox}>
          Imagem cartográfica não gerada para esta revisão. Gere a evidência de mapa no checklist
          antes de emitir o documento definitivo.
        </Text>
      )}
      <View style={s.legendRow}>
        <View style={[s.legendDot, { backgroundColor: "#e11d48" }]} />
        <Text style={s.legendText}>Marcador vermelho: CTO/NAP</Text>
        <View style={[s.legendDot, { backgroundColor: "#2563eb" }]} />
        <Text style={s.legendText}>Marcador azul: posição do técnico</Text>
      </View>
      <View style={s.grid}>
        <Field
          label="COORDENADAS DA CTO"
          mono
          width={33}
          value={pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : ""}
        />
        <Field
          label="COORDENADAS DO TÉCNICO"
          mono
          width={33}
          value={gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : ""}
        />
        <Field
          label="PRECISÃO DO GPS"
          width={33}
          value={gps?.accuracy_m != null ? `± ${gps.accuracy_m} m` : ""}
        />
        <Field
          label="DISTÂNCIA ENTRE TÉCNICO E ATIVO"
          width={50}
          value={dist != null ? `${dist} m` : ""}
        />
        <Field
          label="CONFIRMAÇÃO EM CAMPO"
          width={50}
          value={
            d.localizacao?.confirmada_em
              ? new Date(d.localizacao.confirmada_em).toLocaleString("pt-BR")
              : ativo?.confirmed_at
                ? new Date(ativo.confirmed_at).toLocaleString("pt-BR")
                : ""
          }
        />
      </View>
      {pos ? (
        <Link style={s.link} src={`https://maps.google.com/?q=${pos.lat},${pos.lng}`}>
          Abrir no Google Maps
        </Link>
      ) : null}
      <Text style={s.credit}>Fonte cartográfica: Esri/ArcGIS</Text>
    </View>
  );
}

function OpticalSummary({ d, report }: { d: RemapeamentoData; report: RemapReport }) {
  const st = report.stats;
  const tipo =
    d.splitter?.tipo === "outro" ? d.splitter?.tipo_outro || "Outro" : (d.splitter?.tipo ?? "");
  const cards: { l: string; v: string }[] = [
    { l: "SPLITTER", v: tipo || "—" },
    { l: "ENTRADA", v: st.entrada_dbm != null ? `${st.entrada_dbm} dBm` : "—" },
    { l: "MÉDIA DAS SAÍDAS", v: st.media_saida_dbm != null ? `${st.media_saida_dbm} dBm` : "—" },
    { l: "PERDA MÉDIA", v: st.perda_media_db != null ? `${st.perda_media_db} dB` : "—" },
    {
      l: "MELHOR SAÍDA",
      v: st.melhor ? `${st.melhor.dbm} dBm (P${String(st.melhor.porta).padStart(2, "0")})` : "—",
    },
    {
      l: "PIOR SAÍDA",
      v: st.pior ? `${st.pior.dbm} dBm (P${String(st.pior.porta).padStart(2, "0")})` : "—",
    },
    { l: "VARIAÇÃO ENTRE PORTAS", v: st.delta_db != null ? `${st.delta_db} dB` : "—" },
    { l: "OCUPAÇÃO", v: `${st.ocupadas}/${st.total}` },
    { l: "PORTAS LIVRES", v: `${report.portSummary.livres}` },
  ];
  return (
    <View wrap={false}>
      <Text style={s.sectionTitle}>Resumo óptico</Text>
      <View style={s.grid}>
        {cards.map((c) => (
          <View key={c.l} style={s.cell33}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{c.l}</Text>
              <Text style={s.statValue}>{c.v}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function FeederSection({ d }: { d: RemapeamentoData }) {
  const a = d.alimentacao;
  return (
    <View wrap={false}>
      <Text style={s.sectionTitle}>Alimentação da CTO</Text>
      <View style={s.grid}>
        <Field label="CABO (IDENTIFICAÇÃO)" value={a?.cabo} />
        <Field label="TUBO" value={a?.tubo} />
        <Field label="FIBRA" value={a?.fibra} />
        <Field label="COR DA FIBRA" value={a?.cor_fibra} />
        <Field label="ORIGEM" value={a?.origem} width={50} />
        <Field label="OBSERVAÇÃO" value={a?.observacao} width={50} />
      </View>
    </View>
  );
}

function PortTableHead() {
  return (
    <View style={s.theadRow}>
      <Text style={[s.th, { width: COL.porta }]}>PORTA</Text>
      <Text style={[s.th, { width: COL.cor }]}>COR DA FIBRA</Text>
      <Text style={[s.th, { width: COL.status }]}>STATUS</Text>
      <Text style={[s.th, { width: COL.cliente }]}>CLIENTE / ID · DESTINO/PASSANTE</Text>
      <Text style={[s.th, { width: COL.pot, textAlign: "right" }]}>POTÊNCIA FINAL</Text>
    </View>
  );
}

function PortMappingTable({ report }: { report: RemapReport }) {
  const sum = report.portSummary;
  return (
    <View>
      <Text style={s.sectionTitle}>Mapeamento de portas (TIA-598-C)</Text>
      <View style={s.chipRow}>
        <Text style={s.chip}>Ocupadas: {sum.ocupadas}</Text>
        <Text style={s.chip}>Livres: {sum.livres}</Text>
        <Text style={s.chip}>Reservadas: {sum.reservadas}</Text>
        <Text style={s.chip}>Destino/Passante: {sum.passantes}</Text>
        {sum.nao_identificadas > 0 ? (
          <Text style={s.chip}>Não identificadas: {sum.nao_identificadas}</Text>
        ) : null}
      </View>
      {report.portPages.map((block, blockIndex) => (
        <View key={`block-${blockIndex}`} break={blockIndex > 0} style={{ marginTop: 5 }}>
          <PortTableHead />
          {block.map((p, i) => {
            const color = fiberColorBySlug(p.cor);
            const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.livre;
            const destino =
              p.passante_trocado === "sim"
                ? "Passante trocado"
                : p.passante_trocado === "nao"
                  ? "Passante não trocado"
                  : "";
            const cliente = [p.cliente, p.cliente_id].filter(Boolean).join(" · ");
            return (
              <View
                key={p.numero}
                style={i % 2 === 1 ? [s.tr, s.trAlt] : s.tr}
                wrap={false}
              >
                <Text style={[s.td, s.mono, { width: COL.porta }]}>
                  {String(p.numero).padStart(2, "0")}
                </Text>
                <View style={{ width: COL.cor }}>
                  <Text style={[s.colorTag, { backgroundColor: color.hex, color: color.ink }]}>
                    {p.cor_custom || color.label}
                  </Text>
                </View>
                <View style={{ width: COL.status }}>
                  <Text style={[s.statusTag, { backgroundColor: st.bg }]}>{st.label}</Text>
                </View>
                <Text style={[s.td, { width: COL.cliente }]}>
                  {[cliente, destino].filter(Boolean).join(" · ") || "—"}
                </Text>
                <Text style={[s.td, s.mono, { width: COL.pot, textAlign: "right" }]}>
                  {p.potencia_dbm ? `${p.potencia_dbm} dBm` : "—"}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FusionSection({ d, report }: { d: RemapeamentoData; report: RemapReport }) {
  const itens = d.fusao?.itens ?? [];
  const pendente = report.pendencies.some((p) => p.code === "fusao_sem_detalhe");
  return (
    <View style={{ marginTop: 4 }} wrap={false}>
      <Text style={s.sectionTitle}>Fusões</Text>
      {itens.length > 0 ? (
        <>
          <View style={s.theadRow}>
            <Text style={[s.th, { width: "25%" }]}>FIBRA</Text>
            <Text style={[s.th, { width: "39%" }]}>MOTIVO</Text>
            <Text style={[s.th, { width: "18%", textAlign: "right" }]}>ANTES (dBm)</Text>
            <Text style={[s.th, { width: "18%", textAlign: "right" }]}>DEPOIS (dBm)</Text>
          </View>
          {itens.map((f, i) => (
            <View key={`${f.fibra}-${i}`} style={i % 2 === 1 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
              <Text style={[s.td, { width: "25%" }]}>{f.fibra || "—"}</Text>
              <Text style={[s.td, { width: "39%" }]}>{f.motivo || "—"}</Text>
              <Text style={[s.td, s.mono, { width: "18%", textAlign: "right" }]}>
                {f.antes_dbm || "—"}
              </Text>
              <Text style={[s.td, s.mono, { width: "18%", textAlign: "right" }]}>
                {f.depois_dbm || "—"}
              </Text>
            </View>
          ))}
        </>
      ) : pendente ? (
        <View
          style={{
            borderWidth: 0.9,
            borderColor: C.red,
            borderRadius: 4,
            padding: 6,
            backgroundColor: "#fdecee",
          }}
        >
          <Text style={{ color: C.red, fontSize: 8.6, fontWeight: 700 }}>
            PENDÊNCIA: fusão indicada sem detalhamento.
          </Text>
          <Text style={{ color: C.ink, fontSize: 8, marginTop: 2 }}>
            O técnico marcou que a fusão era necessária, mas nenhuma fibra foi detalhada. O
            remapeamento não pode ser considerado concluído até o detalhamento.
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 8.4, color: C.muted }}>
          {d.fusao?.necessaria === "nao"
            ? "Nenhuma fusão necessária ou realizada."
            : "Fusão não informada."}
        </Text>
      )}
    </View>
  );
}

function EvidenceGrid({ fotos }: { fotos: ResolvedFoto[] }) {
  const antes = fotos.filter((f) => f.categoria === "antes");
  const depois = fotos.filter((f) => f.categoria === "depois");
  const outras = fotos.filter((f) => f.categoria !== "antes" && f.categoria !== "depois");
  const groups: { title: string; items: ResolvedFoto[] }[] = [
    { title: "Antes da intervenção", items: antes },
    { title: "Depois da intervenção", items: depois },
    { title: "Outras evidências", items: outras },
  ].filter((g) => g.items.length > 0);

  return (
    <View>
      <Text style={s.sectionTitle}>Evidências fotográficas</Text>
      {groups.length === 0 ? (
        <Text style={s.warnBox}>
          Nenhuma foto de evidência anexada a esta revisão. Registre as fotos da CTO antes e depois
          do remapeamento.
        </Text>
      ) : (
        groups.map((g) => (
          <View key={g.title} style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 8.8, fontWeight: 700, color: C.navy, marginBottom: 3 }}>
              {g.title} ({g.items.length})
            </Text>
            <View style={s.photoGrid}>
              {g.items.map((f, i) => (
                <View key={f.id} style={s.photoCell} wrap={false}>
                  <View style={s.photoInner}>
                    <Image src={f.uri} style={s.photoImage} />
                    <Text style={s.photoCaption}>
                      {evidenceCaption(f.categoria, f.legenda, i)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function DocumentClosure({
  report,
  tecnicoNome,
  assinatura,
  assinadoEm,
  publicUrl,
  qrUri,
  publicCode,
  emitido,
}: {
  report: RemapReport;
  tecnicoNome: string;
  assinatura?: string | null;
  assinadoEm: string | null;
  publicUrl?: string | null;
  qrUri: string;
  publicCode: string;
  emitido: string;
}) {
  const naoBloqueantes = report.pendencies.filter((p) => !p.blocking);
  return (
    <View style={s.closure} wrap={false}>
      <Text style={s.sectionTitle}>Resultado e encerramento</Text>
      <Text
        style={{
          color: STATUS_COLOR[report.status],
          fontSize: 9.6,
          fontWeight: 700,
        }}
      >
        {report.conclusion}
      </Text>
      {report.pendencies.length > 0 ? (
        <View style={{ marginTop: 3 }}>
          <Text style={{ fontSize: 7.6, fontWeight: 700, color: C.muted }}>
            PENDÊNCIAS ENCONTRADAS
          </Text>
          {report.pendencies.map((p) => (
            <Text key={p.code + p.label} style={{ fontSize: 8, color: C.ink }}>
              • {p.label}
            </Text>
          ))}
          {naoBloqueantes.length === 0 ? null : null}
        </View>
      ) : (
        <Text style={{ fontSize: 8, color: C.muted, marginTop: 3 }}>
          Nenhuma pendência registrada.
        </Text>
      )}

      <View style={[s.row, { marginTop: 8 }]}>
        <View style={{ width: "56%", paddingRight: 8 }}>
          <Text style={s.fieldLabel}>ASSINATURA DO TÉCNICO RESPONSÁVEL</Text>
          <View style={s.signBox}>
            {assinatura ? (
              <Image src={assinatura} style={s.signImage} />
            ) : (
              <Text style={{ color: C.muted, fontSize: 8 }}>Sem assinatura cadastrada</Text>
            )}
          </View>
          <Text style={{ fontSize: 8.6, fontWeight: 700, marginTop: 3 }}>{tecnicoNome || "—"}</Text>
          <Text style={{ fontSize: 7.4, color: C.muted }}>
            {assinadoEm ? `Assinado em ${assinadoEm}` : "Data da assinatura não registrada"}
          </Text>
        </View>
        <View style={{ width: "44%", flexDirection: "row" }}>
          {qrUri ? <Image src={qrUri} style={s.qr} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.6, fontWeight: 700, color: C.navy }}>
              VALIDAÇÃO PÚBLICA
            </Text>
            <Text style={[s.mono, { fontSize: 8, marginTop: 2 }]}>{publicCode}</Text>
            {publicUrl ? (
              <Link style={[s.link, { marginTop: 2 }]} src={publicUrl}>
                Validar documento online
              </Link>
            ) : (
              <Text style={{ fontSize: 7.4, color: C.muted, marginTop: 2 }}>
                Link público não disponível.
              </Text>
            )}
            <Text style={{ fontSize: 7.2, color: C.muted, marginTop: 3 }}>
              Emitido em {emitido}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- documento */

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
  emittedAt?: Date;
};

/** O cabeçalho fixo precisa do logo; guardado fora do componente para não
 * propagar props por toda a árvore de páginas. */
const logoUriRef: { value: string } = { value: "" };

export function RemapeamentoDocument({
  row,
  tecnicoNome,
  assinatura,
  publicUrl,
  logoUri,
  qrUri,
  mapUri,
  fotos,
  emittedAt,
}: RenderParams) {
  logoUriRef.value = logoUri;
  const d = row.dados as RemapeamentoData;
  const report = buildRemapReport(d);
  const code = remapDocumentCode(row);
  const emitido = (emittedAt ?? new Date()).toLocaleString("pt-BR");
  const revision = row.revision_number ?? 1;
  const dataExec = row.data_atendimento
    ? new Date(`${row.data_atendimento}T00:00:00`).toLocaleDateString("pt-BR")
    : "";
  const assinadoEm = row.finalizado_em
    ? new Date(row.finalizado_em).toLocaleString("pt-BR")
    : null;
  const publicCode = row.numero_publico || row.codigo_validacao || code;

  const chrome = (
    <>
      <DocumentHeader code={code} revision={revision} />
      <DocumentFooter code={code} emitido={emitido} />
    </>
  );

  return (
    <Document
      title={`Remapeamento ${code}`}
      author="CheckTecnico"
      subject="Remapeamento de CTO/NAP"
    >
      {/* Página 1 — identificação, localização, resumo óptico, alimentação */}
      <Page size="A4" style={s.page}>
        {chrome}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
            Identificação e resumo técnico
          </Text>
          <StatusBadge report={report} />
        </View>
        <View style={[s.grid, { marginTop: 6 }]}>
          <Field label="CÓDIGO RMAP" value={row.rmap_code ?? code} mono />
          <Field label="REVISÃO" value={`R${revision}`} />
          <Field label="CTO / NAP" value={d.identificacao?.cto_codigo} />
          <Field label="SETOR" value={d.identificacao?.setor} />
          <Field label="CIDADE" value={row.cidade} />
          <Field label="TÉCNICO" value={tecnicoNome} width={50} />
          <Field
            label="EXECUÇÃO"
            value={[dataExec, row.hora_atendimento].filter(Boolean).join(" · ")}
          />
        </View>

        <LocationSection d={d} mapUri={mapUri} />
        <OpticalSummary d={d} report={report} />
        <FeederSection d={d} />
      </Page>

      {/* Página 2 — mapeamento de portas + fusões */}
      <Page size="A4" style={s.page}>
        {chrome}
        <PortMappingTable report={report} />
        <FusionSection d={d} report={report} />
      </Page>

      {/* Página 3 — evidências e encerramento */}
      <Page size="A4" style={s.page}>
        {chrome}
        <EvidenceGrid fotos={fotos} />
        <DocumentClosure
          report={report}
          tecnicoNome={tecnicoNome}
          assinatura={assinatura}
          assinadoEm={assinadoEm}
          publicUrl={publicUrl}
          qrUri={qrUri}
          publicCode={publicCode}
          emitido={emitido}
        />
      </Page>
    </Document>
  );
}

/* --------------------------------------------------------------- geração */

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
    if (!signed) return "";
    return await optimizeImageDataUri(await toDataUri(signed), 1400, 0.82);
  } catch {
    return "";
  }
}

export async function buildRemapeamentoPdfBlob(params: Params): Promise<Blob> {
  const { fotos: fotoRows, ...rest } = params;
  const [logoUri, qrUri, mapUri, fotosRaw] = await Promise.all([
    toDataUri(logoAsset.url).catch(() => ""),
    params.publicUrl
      ? QRCode.toDataURL(params.publicUrl, { margin: 1, width: 320, errorCorrectionLevel: "M" }).catch(
          () => "",
        )
      : Promise.resolve(""),
    resolveMapUri(params.row),
    resolveFotoDataUris(fotoRows ?? []).catch(() => [] as ResolvedFoto[]),
  ]);
  // Evidências entram no PDF como miniaturas: 1600 px no maior lado já é
  // superior ao necessário e derruba o arquivo de ~11 MB para poucos MB.
  const fotos = await optimizeImageDataUris(fotosRaw);
  return await pdf(
    <RemapeamentoDocument
      {...rest}
      logoUri={logoUri}
      qrUri={qrUri}
      mapUri={mapUri}
      fotos={fotos}
    />,
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
