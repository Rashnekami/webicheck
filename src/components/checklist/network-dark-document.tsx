import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";

import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { SnapshotPayload } from "@/lib/public-checklist.functions";
import type { ResolvedFoto } from "@/lib/checklist-photo-uris";
import type { IntervencaoData, RemapeamentoData, TipoIntervencao } from "@/lib/checklist-schema";
import { TIPO_LABEL } from "@/lib/checklist-schema";
import { computeSplitterStats, fiberColorBySlug } from "@/lib/remapeamento-fibers";
import {
  CAUSA_OPCOES,
  ESTADO_LABEL,
  INTERVENCAO_RECOMENDACAO_LABEL,
  PONTO_LABEL,
  URGENCIA_LABEL,
  routeLengthMeters,
  signalGainDb,
} from "@/lib/intervencao";

const C = {
  page: "#020817",
  panel: "#06152d",
  cyan: "#19d8ff",
  green: "#45e35f",
  amber: "#ffb020",
  border: "#1769db",
  text: "#f8fbff",
  muted: "#a9bad1",
};

const STATUS_TAG: Record<string, { label: string; bg: string }> = {
  ocupada: { label: "OCUPADA", bg: "#1b7f3b" },
  livre: { label: "LIVRE", bg: "#0c45a5" },
  reserva: { label: "RESERVA", bg: "#8a6a12" },
  nao_identificada: { label: "NÃO IDENT.", bg: "#5a2230" },
  nao_identificado: { label: "NÃO IDENT.", bg: "#5a2230" },
};

export interface NetworkDocumentProps {
  payload: SnapshotPayload;
  publicUrl?: string | null;
  shortHash?: string | null;
  version?: number | null;
  fixedWidth?: number;
  fotos?: ResolvedFoto[];
  mapUrl?: string | null;
}

function useQrDataUrl(value?: string | null) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(value, {
      width: 320,
      margin: 1,
      color: { dark: "#04142d", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((r) => active && setDataUrl(r))
      .catch(() => active && setDataUrl(""));
    return () => {
      active = false;
    };
  }, [value]);
  return dataUrl;
}

function fmtDate(value?: unknown) {
  if (!value) return "—";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR");
}

function fmtDateTime(value?: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        background: C.panel,
        padding: 14,
        marginTop: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 4,
            height: 16,
            borderRadius: 4,
            background: C.cyan,
          }}
        />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>{title}</h3>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

/** Tabela genérica em tema dark, espelhando o layout dos PDFs. */
function Table({
  columns,
  rows,
}: {
  columns: { key: string; label: string; width?: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ color: C.muted, textAlign: "left" }}>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                padding: "4px 2px",
                width: c.width,
                textAlign: c.align ?? "left",
                fontSize: 10,
                letterSpacing: 0.5,
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid #12335c" }}>
            {columns.map((c) => (
              <td key={c.key} style={{ padding: "5px 2px", textAlign: c.align ?? "left" }}>
                {r[c.key] ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {items.map((t, i) => (
        <span
          key={i}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 10,
            color: C.muted,
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: C.text, fontSize: 12, margin: "0 0 4px", lineHeight: 1.5 }}>{children}</p>
  );
}

function InfoGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", margin: -4 }}>
      {items.map((i) => (
        <div key={i.label} style={{ width: "25%", padding: 4, boxSizing: "border-box" }}>
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              background: "#041126",
              padding: "8px 10px",
              minHeight: 46,
              boxSizing: "border-box",
            }}
          >
            <div style={{ color: C.muted, fontSize: 10, letterSpacing: 0.6 }}>
              {i.label.toUpperCase()}
            </div>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 700, marginTop: 3 }}>
              {i.value || "—"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotoGrid({ fotos }: { fotos: ResolvedFoto[] }) {
  if (fotos.length === 0) {
    return (
      <p style={{ color: C.amber, fontSize: 12, margin: 0 }}>
        Nenhuma foto de evidência anexada a esta revisão.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", margin: -5 }}>
      {fotos.map((f) => (
        <div key={f.id} style={{ width: "50%", padding: 5, boxSizing: "border-box" }}>
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              background: "#041126",
              padding: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 800,
                color: "#fff",
                background:
                  f.categoria === "antes"
                    ? "#8a3b12"
                    : f.categoria === "depois"
                      ? "#1b7f3b"
                      : "#0c45a5",
              }}
            >
              {f.categoria === "antes"
                ? "ANTES"
                : f.categoria === "depois"
                  ? "DEPOIS"
                  : f.label.toUpperCase()}
            </span>
            <img
              src={f.uri}
              alt={f.label}
              crossOrigin="anonymous"
              style={{
                display: "block",
                width: "100%",
                height: 190,
                objectFit: "cover",
                borderRadius: 8,
                marginTop: 6,
              }}
            />
            {f.legenda ? (
              <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>{f.legenda}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export const NetworkDarkDocument = forwardRef<HTMLDivElement, NetworkDocumentProps>(
  function NetworkDarkDocument(
    { payload, publicUrl, shortHash, version, fixedWidth, fotos = [], mapUrl },
    ref,
  ) {
    const qr = useQrDataUrl(publicUrl ?? null);
    const tipo = payload.tipo as keyof typeof TIPO_LABEL;
    const isRemap = tipo === "remapeamento_cto";
    const h = payload.header as Record<string, string | null>;
    const remap = payload.dados as unknown as RemapeamentoData;
    const inter = payload.dados as unknown as IntervencaoData;
    const stats = isRemap ? computeSplitterStats(remap) : null;
    const pos = isRemap
      ? (remap.localizacao?.ativo ?? remap.localizacao?.confirmada ?? null)
      : null;
    const ganho = !isRemap ? signalGainDb(inter.sinal?.antes_dbm, inter.sinal?.depois_dbm) : null;

    return (
      <div
        ref={ref}
        data-validation-qr={publicUrl ? (qr ? "ready" : "loading") : "unavailable"}
        style={{
          width: fixedWidth ?? "100%",
          background: C.page,
          color: C.text,
          padding: 22,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 22,
            padding: 20,
            background:
              "radial-gradient(circle at 90% 0%, rgba(0,136,255,.17), transparent 26%), linear-gradient(150deg,#020817 0%,#041127 55%,#020817 100%)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <img
              src={logoAsset.url}
              alt="Webifibra"
              crossOrigin="anonymous"
              style={{ width: 96, height: 68, borderRadius: 16, objectFit: "cover" }}
            />
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>
              {isRemap ? (
                <>
                  REMAPEAMENTO DE <span style={{ color: C.cyan }}>CTO / NAP</span>
                </>
              ) : (
                <>
                  LAUDO DE <span style={{ color: C.cyan }}>{TIPO_LABEL[tipo]?.toUpperCase()}</span>
                </>
              )}
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              {payload.checklist_code || payload.numero_publico || payload.codigo_validacao || "—"}
              {version && version > 1 ? ` · versão ${version}` : ""}
            </div>
          </div>

          <InfoGrid
            items={
              isRemap
                ? [
                    { label: "CTO / NAP", value: remap.identificacao?.cto_codigo ?? "" },
                    { label: "Setor", value: remap.identificacao?.setor ?? "" },
                    { label: "Cidade", value: h.cidade ?? "" },
                    { label: "Técnico", value: payload.tecnico.full_name },
                    { label: "Data", value: fmtDate(h.data_atendimento) },
                    { label: "Hora", value: h.hora_atendimento ?? "—" },
                    { label: "OS", value: h.os ?? "—" },
                    {
                      label: "Ocupação",
                      value: stats ? `${stats.ocupadas}/${stats.total}` : "—",
                    },
                  ]
                : [
                    { label: "Tipo", value: TIPO_LABEL[tipo] ?? "—" },
                    { label: "Cliente", value: h.cliente ?? "—" },
                    { label: "Cidade", value: h.cidade ?? "" },
                    { label: "Técnico", value: payload.tecnico.full_name },
                    { label: "Data", value: fmtDate(h.data_atendimento) },
                    { label: "Hora", value: h.hora_atendimento ?? "—" },
                    { label: "OS", value: h.os ?? "—" },
                    {
                      label: "Urgência",
                      value: URGENCIA_LABEL[inter.contexto?.urgencia ?? ""] ?? "—",
                    },
                  ]
            }
          />

          <Panel title={isRemap ? "Localização da CTO (confirmada em campo)" : "Rota da intervenção"}>
            {mapUrl ? (
              <img
                src={mapUrl}
                alt="Evidência cartográfica"
                crossOrigin="anonymous"
                style={{
                  width: "100%",
                  height: 320,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                }}
              />
            ) : (
              <p style={{ color: C.amber, fontSize: 12, margin: 0 }}>
                Imagem cartográfica não gerada para esta revisão.
              </p>
            )}
            <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
              {isRemap
                ? pos
                  ? `Coordenada confirmada: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`
                  : "Coordenada não confirmada"
                : `${inter.rota?.pontos?.length ?? 0} ponto(s) · extensão aproximada ${routeLengthMeters(
                    inter.rota?.pontos ?? [],
                  )} m`}
              {" · Fonte cartográfica: ArcGIS / Esri"}
            </div>
          </Panel>

          {isRemap ? (
            <>
              <Panel title="Splitter e potências">
                <InfoGrid
                  items={[
                    {
                      label: "Tipo",
                      value:
                        remap.splitter?.tipo === "outro"
                          ? remap.splitter?.tipo_outro || "Outro"
                          : (remap.splitter?.tipo ?? "—"),
                    },
                    {
                      label: "Entrada",
                      value: stats?.entrada_dbm != null ? `${stats.entrada_dbm} dBm` : "—",
                    },
                    {
                      label: "Média saída",
                      value: stats?.media_saida_dbm != null ? `${stats.media_saida_dbm} dBm` : "—",
                    },
                    {
                      label: "Perda média",
                      value: stats?.perda_media_db != null ? `${stats.perda_media_db} dB` : "—",
                    },
                  ]}
                />
              </Panel>

              <Panel title="Mapeamento de portas (TIA-598-C)">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: C.muted, textAlign: "left" }}>
                      <th style={{ padding: "4px 2px" }}>PORTA</th>
                      <th style={{ padding: "4px 2px" }}>COR</th>
                      <th style={{ padding: "4px 2px" }}>STATUS</th>
                      <th style={{ padding: "4px 2px" }}>CLIENTE / ID</th>
                      <th style={{ padding: "4px 2px", textAlign: "right" }}>POTÊNCIA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(remap.portas ?? []).map((p) => {
                      const color = fiberColorBySlug(p.cor);
                      const st = STATUS_TAG[p.status] ?? STATUS_TAG.livre;
                      return (
                        <tr key={p.numero} style={{ borderTop: "1px solid #12335c" }}>
                          <td style={{ padding: "5px 2px", fontWeight: 700 }}>
                            {String(p.numero).padStart(2, "0")}
                          </td>
                          <td style={{ padding: "5px 2px" }}>
                            <span
                              style={{
                                background: color.hex,
                                color: color.ink,
                                borderRadius: 5,
                                padding: "2px 6px",
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                            >
                              {p.cor_custom || color.label}
                            </span>
                          </td>
                          <td style={{ padding: "5px 2px" }}>
                            <span
                              style={{
                                background: st.bg,
                                color: "#fff",
                                borderRadius: 5,
                                padding: "2px 6px",
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td style={{ padding: "5px 2px" }}>
                            {[p.cliente, p.cliente_id].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td style={{ padding: "5px 2px", textAlign: "right" }}>
                            {p.potencia_dbm ? `${p.potencia_dbm} dBm` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            </>
          ) : (
            <>
              <Panel title="Contexto e diagnóstico">
                <InfoGrid
                  items={[
                    {
                      label: "Causa",
                      value:
                        CAUSA_OPCOES[tipo as TipoIntervencao]?.find(
                          (o) => o.value === inter.contexto?.causa,
                        )?.label ??
                        inter.contexto?.causa ??
                        "—",
                    },
                    { label: "Estado", value: ESTADO_LABEL[inter.resultado?.estado ?? ""] ?? "—" },
                    { label: "Sinal antes", value: inter.sinal?.antes_dbm || "—" },
                    {
                      label: "Sinal depois",
                      value: inter.sinal?.depois_dbm
                        ? `${inter.sinal.depois_dbm}${ganho != null ? ` (${ganho > 0 ? "+" : ""}${ganho} dB)` : ""}`
                        : "—",
                    },
                  ]}
                />
                {inter.contexto?.descricao ? (
                  <p style={{ color: C.text, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                    {inter.contexto.descricao}
                  </p>
                ) : null}
              </Panel>

              {(inter.rota?.pontos ?? []).length > 0 ? (
                <Panel title="Pontos georreferenciados">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: C.muted, textAlign: "left" }}>
                        <th style={{ padding: "4px 2px" }}>#</th>
                        <th style={{ padding: "4px 2px" }}>TIPO</th>
                        <th style={{ padding: "4px 2px" }}>COORDENADAS</th>
                        <th style={{ padding: "4px 2px" }}>DESCRIÇÃO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inter.rota?.pontos ?? []).map((p, i) => (
                        <tr key={`${p.lat}-${p.lng}-${i}`} style={{ borderTop: "1px solid #12335c" }}>
                          <td style={{ padding: "5px 2px" }}>{i + 1}</td>
                          <td style={{ padding: "5px 2px" }}>{PONTO_LABEL[p.tipo] ?? p.tipo}</td>
                          <td style={{ padding: "5px 2px" }}>
                            {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                          </td>
                          <td style={{ padding: "5px 2px" }}>{p.descricao || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              ) : null}
            </>
          )}

          <Panel title="Evidências fotográficas (antes e depois)">
            <PhotoGrid fotos={fotos} />
          </Panel>

          <Panel title="Responsável técnico">
            <div
              style={{
                background: "#fff",
                borderRadius: 10,
                minHeight: 90,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {payload.tecnico.assinatura ? (
                <img
                  src={payload.tecnico.assinatura}
                  alt="Assinatura"
                  style={{ maxHeight: 82, maxWidth: "90%", objectFit: "contain" }}
                />
              ) : (
                <span style={{ color: "#64748b", fontSize: 12 }}>Sem assinatura cadastrada</span>
              )}
            </div>
            <div style={{ textAlign: "center", fontWeight: 800, marginTop: 6 }}>
              {payload.tecnico.full_name}
            </div>
          </Panel>

          {publicUrl ? (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                background: C.panel,
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              {qr ? (
                <img src={qr} alt="QR de validação" style={{ width: 84, height: 84 }} />
              ) : null}
              <div>
                <div style={{ color: C.cyan, fontWeight: 800, fontSize: 12 }}>
                  VALIDAÇÃO PÚBLICA DO DOCUMENTO
                </div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{publicUrl}</div>
                {shortHash ? (
                  <div style={{ color: C.muted, fontSize: 11 }}>Integridade {shortHash}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              color: C.muted,
              fontSize: 10,
            }}
          >
            <span>WebiCheck · {TIPO_LABEL[tipo]}</span>
            <span>Emitido em {new Date().toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>
    );
  },
);
