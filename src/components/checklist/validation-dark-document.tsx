import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { SnapshotPayload } from "@/lib/public-checklist.functions";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";
import type { ChecklistData, StoredAiAnalysis } from "@/lib/checklist-schema";
import { labelTipoManutencao, RECOMENDACAO_LABEL } from "@/lib/ont-checklist-ai";
import {
  CustomerDocument,
  type InstallationDocumentPart,
} from "@/components/checklist/installation-dark-document";

type Props = {
  payload: SnapshotPayload;
  publicUrl?: string | null;
  shortHash?: string | null;
  version?: number | null;
  fixedWidth?: number;
  counterproof?: CounterproofDocumentInfo | null;
  documentPart?: InstallationDocumentPart;
};

const C = {
  page: "#020817",
  panel: "#06152d",
  blue: "#1479ff",
  cyan: "#19d8ff",
  green: "#45e35f",
  red: "#ff5268",
  amber: "#ffb020",
  border: "#1769db",
  text: "#f8fbff",
  muted: "#a9bad1",
  line: "#17365d",
};

function fmtDate(value?: unknown) {
  if (!value) return "—";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR");
}

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function yesNo(value: unknown) {
  if (value === "sim" || value === true) return "Sim";
  if (value === "nao" || value === false) return "Não";
  return "—";
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
      .then((result) => active && setDataUrl(result))
      .catch(() => active && setDataUrl(""));
    return () => {
      active = false;
    };
  }, [value]);
  return dataUrl;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 24,
        padding: 22,
        background:
          "radial-gradient(circle at 90% 0%, rgba(0,136,255,.17), transparent 26%), linear-gradient(150deg,#020817 0%,#041127 55%,#020817 100%)",
        boxShadow: "inset 0 0 48px rgba(0,86,190,.12), 0 0 25px rgba(0,123,255,.16)",
      }}
    >
      {children}
    </section>
  );
}

function Header({ version }: { version?: number | null }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 18 }}>
      <img
        src={logoAsset.url}
        alt="Webifibra"
        crossOrigin="anonymous"
        style={{
          width: 100,
          height: 70,
          borderRadius: 18,
          objectFit: "cover",
          boxShadow: "0 0 26px rgba(0,174,255,.28)",
        }}
      />
      <div
        style={{
          marginTop: 10,
          color: C.text,
          fontWeight: 900,
          fontSize: 26,
          letterSpacing: 0.5,
          lineHeight: 1.05,
        }}
      >
        VALIDAÇÃO DE <span style={{ color: C.cyan }}>ONT</span>
      </div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>
        Checklist técnico oficial · uso interno Webifibra
        {version && version > 1 ? ` · versão ${version}` : ""}
      </div>
    </div>
  );
}

const infoIcons: Record<string, string> = {
  Cliente: "👤",
  OS: "📋",
  Checklist: "✓",
  Código: "🛡",
  Técnico: "👷",
  Cidade: "📍",
  Data: "📅",
  Hora: "🕐",
  Status: "✓",
  Modelo: "📦",
  Serial: "🏷",
  "CTO/Porta": "🔌",
  "Tipo": "🧰",
};

function InfoGrid({
  items,
}: {
  items: { label: string; value: unknown; status?: boolean; wide?: boolean }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
        gap: 8,
        marginBottom: 14,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            minWidth: 0,
            gridColumn: item.wide ? "span 2" : undefined,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            background: "linear-gradient(145deg,#071b3a,#041126)",
            padding: "9px 10px",
            display: "flex",
            gap: 8,
            alignItems: "center",
            boxShadow: "inset 0 0 18px rgba(0,91,200,.08)",
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              flex: "0 0 28px",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color: C.cyan,
              background: "#0b3d91",
              fontSize: 13,
              boxShadow: "0 0 13px rgba(0,119,255,.35)",
            }}
          >
            {infoIcons[item.label] ?? "•"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.muted, fontSize: 9.5 }}>{item.label}</div>
            <div
              style={{
                color: item.status ? C.green : C.text,
                fontSize: 11.5,
                fontWeight: 800,
                overflowWrap: "anywhere",
                lineHeight: 1.2,
              }}
            >
              {(item.value ?? "") === "" ? "—" : String(item.value)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        background: "linear-gradient(155deg,rgba(7,29,62,.96),rgba(3,15,34,.96))",
        padding: 14,
        marginTop: 10,
        boxShadow: "inset 0 0 26px rgba(0,111,255,.08)",
      }}
    >
      {children}
    </div>
  );
}

function PanelTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.text,
        fontWeight: 800,
        fontSize: 16,
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ color: C.cyan }}>{icon}</span>
      {children}
    </div>
  );
}

function Chk({ v, label }: { v: unknown; label: string }) {
  const on = Boolean(v);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "5px 0",
        fontSize: 11.5,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: 4,
          background: on ? C.green : "transparent",
          border: `1.5px solid ${on ? C.green : C.border}`,
          color: "#04142d",
          textAlign: "center",
          lineHeight: "11px",
          fontSize: 10,
          fontWeight: 900,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ color: on ? C.text : C.muted, lineHeight: 1.35 }}>{label}</span>
    </div>
  );
}

function KV({ label, value, tone }: { label: string; value: unknown; tone?: "green" | "amber" | "red" }) {
  const colorMap = { green: C.green, amber: C.amber, red: C.red } as const;
  const valueColor = tone ? colorMap[tone] : C.text;
  return (
    <div style={{ padding: "4px 0", fontSize: 11.5, display: "flex", gap: 6 }}>
      <span style={{ color: C.muted }}>{label}:</span>
      <span style={{ color: valueColor, fontWeight: 800, overflowWrap: "anywhere" }}>
        {(value ?? "") === "" ? "—" : String(value)}
      </span>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        columnGap: 14,
      }}
    >
      {children}
    </div>
  );
}

function Grid3({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        columnGap: 14,
      }}
    >
      {children}
    </div>
  );
}

function SpeedCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: string;
  label: string;
  value?: string;
  unit: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.cyan}`,
        borderRadius: 16,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "42px 1fr",
        gap: 10,
        alignItems: "center",
        background: C.panel,
        boxShadow: "inset 0 0 20px rgba(0,168,255,.08)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: `2px solid ${C.cyan}`,
          display: "grid",
          placeItems: "center",
          color: C.cyan,
          fontSize: 22,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ color: C.cyan, fontSize: 10, fontWeight: 800 }}>{label}</div>
        <div style={{ color: C.text, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
          {value || "—"} <span style={{ color: C.cyan, fontSize: 11 }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

function SignatureCard({
  title,
  name,
  image,
}: {
  title: string;
  name: string;
  image?: string | null;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 13,
        minHeight: 125,
        background: C.panel,
      }}
    >
      <div style={{ color: C.text, fontSize: 13, fontWeight: 800 }}>✍ {title}</div>
      <div
        style={{
          height: 72,
          marginTop: 8,
          border: `1px dashed ${C.border}`,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {image ? (
          <img
            src={image}
            alt={title}
            crossOrigin="anonymous"
            style={{ maxWidth: "92%", maxHeight: 64, objectFit: "contain", filter: "invert(1)" }}
          />
        ) : (
          <span style={{ color: C.muted, fontSize: 10 }}>(assinatura não registrada)</span>
        )}
      </div>
      <div style={{ color: C.text, fontSize: 10.5, fontWeight: 800, marginTop: 6 }}>{name}</div>
    </div>
  );
}

function Footer({ code }: { code: string }) {
  return (
    <div
      style={{
        borderTop: `1px solid ${C.border}`,
        marginTop: 14,
        paddingTop: 9,
        display: "flex",
        justifyContent: "space-between",
        color: C.muted,
        fontSize: 9,
      }}
    >
      <b style={{ color: C.text }}>Webifibra · Conectividade que aproxima</b>
      <span>{code}</span>
    </div>
  );
}

function AiPanel({
  analysis,
  tipoManutencao,
}: {
  analysis: StoredAiAnalysis | null | undefined;
  tipoManutencao: string | null | undefined;
}) {
  if (!analysis && !tipoManutencao) return null;
  return (
    <Panel>
      <PanelTitle icon="🤖">Análise por IA (consultiva)</PanelTitle>
      <KV label="Tipo de manutenção" value={labelTipoManutencao(tipoManutencao)} />
      {analysis ? (
        <>
          <KV
            label="Recomendação"
            value={RECOMENDACAO_LABEL[analysis.recomendacao] ?? analysis.recomendacao}
            tone="green"
          />
          <KV label="Diagnóstico provável" value={analysis.diagnostico_provavel} />
          <KV label="Causa raiz" value={analysis.causa_raiz} />
          <KV label="Justificativa" value={analysis.justificativa} />
          <div style={{ marginTop: 6, fontSize: 11.5 }}>
            <div style={{ color: C.muted }}>Inconsistências:</div>
            {analysis.inconsistencias.length ? (
              <ul style={{ margin: "4px 0 0 16px", padding: 0, color: C.amber }}>
                {analysis.inconsistencias.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <div style={{ color: C.green, fontWeight: 800 }}>Nenhuma</div>
            )}
          </div>
          <div style={{ marginTop: 8, color: C.text, fontSize: 11.5, whiteSpace: "pre-wrap" }}>
            <span style={{ color: C.muted }}>Resumo técnico: </span>
            {analysis.resumo_tecnico}
          </div>
          <div style={{ marginTop: 6, fontSize: 9.5, color: C.muted }}>
            Gerado em {new Date(analysis.gerado_em).toLocaleString("pt-BR")} · {analysis.modelo_ia} ·
            uso consultivo.
          </div>
        </>
      ) : (
        <div style={{ color: C.muted, fontSize: 11 }}>Análise por IA não solicitada.</div>
      )}
    </Panel>
  );
}

export const ValidationDarkDocument = forwardRef<HTMLDivElement, Props>(
  function ValidationDarkDocument(
    { payload, publicUrl, shortHash, version, fixedWidth, counterproof, documentPart = "combined" },
    ref,
  ) {
    const h = payload.header;
    const d = payload.dados as unknown as ChecklistData;
    const qr = useQrDataUrl(publicUrl);

    const s = d.sintoma ?? ({} as ChecklistData["sintoma"]);
    const vf = d.validacao_fisica ?? ({} as ChecklistData["validacao_fisica"]);
    const tc = d.teste_cabeado ?? ({} as ChecklistData["teste_cabeado"]);
    const tw = d.teste_wifi ?? ({} as ChecklistData["teste_wifi"]);
    const ev = d.evidencias_marcadas ?? ({} as ChecklistData["evidencias_marcadas"]);
    const rf = d.resultado_final ?? ({} as ChecklistData["resultado_final"]);
    const noc = d.noc ?? ({} as ChecklistData["noc"]);

    const trocaFeita = (h as { troca_realizada?: boolean | null }).troca_realizada === true;

    if (documentPart === "customer" && counterproof?.status === "validated") {
      return (
        <div
          ref={ref}
          data-checklist-document
          data-document-part="customer"
          style={{
            width: fixedWidth ? `${fixedWidth}px` : "100%",
            maxWidth: fixedWidth ? `${fixedWidth}px` : "900px",
            padding: fixedWidth ? 18 : 10,
            boxSizing: "border-box",
            background: C.page,
            color: C.text,
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <CustomerDocument payload={payload} counterproof={counterproof} />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-checklist-document
        data-document-part={documentPart}
        style={{
          width: fixedWidth ? `${fixedWidth}px` : "100%",
          maxWidth: fixedWidth ? `${fixedWidth}px` : "900px",
          padding: fixedWidth ? 18 : 10,
          boxSizing: "border-box",
          background: C.page,
          color: C.text,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <Frame>
          <Header version={version} />

          <InfoGrid
            items={[
              { label: "Cliente", value: h.cliente, wide: true },
              { label: "OS", value: h.os },
              { label: "Checklist", value: payload.checklist_code || payload.numero_publico },
              { label: "Código", value: payload.codigo_validacao, wide: true },
              { label: "Técnico", value: payload.tecnico.full_name, wide: true },
              { label: "Cidade", value: h.cidade },
              { label: "Data", value: fmtDate(h.data_atendimento) },
              { label: "Hora", value: h.hora_atendimento },
              { label: "Modelo", value: h.modelo },
              { label: "Serial", value: h.serial },
              { label: "CTO/Porta", value: h.cto_porta },
              { label: "Tipo", value: labelTipoManutencao(d.tipo_manutencao) },
              { label: "Status", value: "VALIDADO", status: true },
            ]}
          />

          {counterproof?.status === "validated" ? (
            <div
              style={{
                border: "1px solid rgba(69,227,95,.55)",
                borderRadius: 14,
                background: "rgba(17,92,43,.25)",
                color: C.green,
                padding: "9px 12px",
                fontWeight: 800,
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              ✓ Contra-Prova validada pelo cliente · {counterproof.code} ·{" "}
              {fmtDateTime(counterproof.validated_at)}
            </div>
          ) : null}

          {trocaFeita ? (
            <div
              style={{
                border: `1px solid ${C.amber}`,
                borderRadius: 14,
                background: "rgba(255,176,32,.08)",
                color: C.amber,
                padding: "9px 12px",
                fontWeight: 800,
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              ⚙ Troca de ONT executada nesta visita — os dados abaixo referem-se ao equipamento
              retirado.
            </div>
          ) : null}

          <Panel>
            <PanelTitle icon="🩺">Sintoma confirmado em campo</PanelTitle>
            <Grid2>
              <Chk v={s.ont_nao_liga} label="ONT não liga" />
              <Chk v={s.ont_queimada} label="ONT/ONU queimada" />
              <Chk v={s.ont_danificada_cliente} label="ONT danificada pelo cliente" />
              <Chk v={s.ont_reinicia} label="ONT reinicia/desliga" />
              <Chk v={s.perde_internet} label="Perde internet/provisionamento" />
              <Chk v={s.internet_cai_pon_acesa} label="Internet cai com PON acesa" />
              <Chk v={s.los_acende} label="LOS acende" />
              <Chk v={s.wifi_5g_desaparece} label="Wi-Fi 5 GHz desaparece" />
              <Chk v={s.wifi_ambas_desaparecem} label="Wi-Fi 2,4 e 5 GHz desaparecem" />
              <Chk v={s.wifi_falha_cabo_ok} label="Wi-Fi falha, cabo OK" />
              <Chk v={s.lan_nao_funciona} label="Porta LAN não funciona" />
              <Chk v={s.lentidao} label="Lentidão" />
            </Grid2>
            <div style={{ marginTop: 6 }}>
              <KV label="Outro" value={s.outro_texto} />
              <Grid2>
                <KV label="Falha presenciada" value={yesNo(s.falha_presenciada)} />
                <KV label="Horário" value={s.horario} />
              </Grid2>
            </div>
          </Panel>

          <Panel>
            <PanelTitle icon="🔧">Validação física</PanelTitle>
            <Grid2>
              <Chk v={vf.tomada} label="Tomada e alimentação verificadas" />
              <Chk v={vf.fonte} label="Fonte e conector verificados" />
              <Chk v={vf.outra_tomada} label="Testada em outra tomada" />
              <Chk v={vf.outra_fonte} label="Testada com outra fonte" />
              <Chk v={vf.patch_cord} label="Patch cord óptico verificado" />
              <Chk v={vf.sem_dobras} label="Sem dobras no cabo óptico" />
              <Chk v={vf.luz_verde_ok} label="LED PON/Óptico OK" />
              <Chk v={vf.roseta_ok} label="Roseta/adaptador OK" />
            </Grid2>
          </Panel>

          <Panel>
            <PanelTitle icon="🔌">Teste cabeado</PanelTitle>
            <KV label="Aplica-se ao atendimento" value={yesNo(tc.aplicabilidade)} />
            {tc.aplicabilidade === "nao" ? (
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                Não se aplica — atendimento realizado sem equipamento para teste cabeado.
              </div>
            ) : (
              <>
                <Grid2>
                  <Chk v={tc.navegacao} label="Navegação testada" />
                  <Chk v={tc.ping} label="Ping testado" />
                  <Chk v={tc.velocidade} label="Velocidade testada" />
                  <Chk v={tc.cabo_substituido} label="Cabo substituído" />
                </Grid2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginTop: 10,
                  }}
                >
                  <SpeedCard icon="↓" label="DOWNLOAD" value={tc.download} unit="Mbps" />
                  <SpeedCard icon="↑" label="UPLOAD" value={tc.upload} unit="Mbps" />
                  <SpeedCard icon="◉" label="PING" value={tc.ping_ms} unit="ms" />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Grid2>
                    <Chk v={tc.funcionou} label="Funcionou normalmente" />
                    <Chk v={tc.apresentou_falha} label="Também apresentou falha" />
                    <Chk v={tc.ont_reiniciou} label="ONT reiniciou" />
                    <Chk v={tc.lan_falhou} label="Porta LAN não funcionou" />
                    <Chk v={tc.nao_testado} label="Aplicável, mas não foi possível testar" />
                  </Grid2>
                </div>
              </>
            )}
          </Panel>

          <Panel>
            <PanelTitle icon="📶">Teste Wi-Fi</PanelTitle>
            <Grid2>
              <Chk v={tw.rede_24} label="Rede 2,4 GHz testada" />
              <Chk v={tw.rede_5} label="Rede 5 GHz testada" />
              <Chk v={tw.mais_aparelhos} label="Testado em mais de um aparelho" />
              <Chk v={tw.cabo_funcionando} label="Cabo permanece funcionando" />
            </Grid2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginTop: 10,
              }}
            >
              <SpeedCard icon="↓" label="DOWNLOAD" value={tw.download} unit="Mbps" />
              <SpeedCard icon="↑" label="UPLOAD" value={tw.upload} unit="Mbps" />
              <SpeedCard icon="◉" label="PING" value={tw.ping_ms} unit="ms" />
            </div>
            <div style={{ marginTop: 10 }}>
              <Grid2>
                <Chk v={tw.apenas_5g_desaparece} label="Apenas 5 GHz desaparece" />
                <Chk v={tw.ambas_desaparecem} label="Ambas as redes desaparecem" />
                <Chk v={tw.sem_internet} label="Wi-Fi visível sem internet" />
                <Chk v={tw.um_aparelho} label="Ocorreu apenas em um aparelho" />
                <Chk v={tw.nao_reproduzida} label="Falha não reproduzida" />
              </Grid2>
            </div>
          </Panel>

          <Panel>
            <PanelTitle icon="📷">Evidências marcadas</PanelTitle>
            <Grid2>
              <Chk v={ev.etiqueta} label="Foto da etiqueta (modelo/serial)" />
              <Chk v={ev.leds} label="Foto dos LEDs da ONT" />
              <Chk v={ev.fonte} label="Foto da fonte/conexões" />
              <Chk v={ev.teste_cabeado} label="Evidência do teste cabeado" />
              <Chk v={ev.teste_wifi} label="Evidência do teste Wi-Fi" />
            </Grid2>
          </Panel>

          <Panel>
            <PanelTitle icon="🎯">Resultado após reset/teste final</PanelTitle>
            <Grid2>
              <Chk v={rf.permaneceu} label="Falha permaneceu" />
              <Chk v={rf.parou} label="Falha parou" />
              <Chk v={rf.nao_reproduzida} label="Não foi reproduzida" />
            </Grid2>
            <Grid2>
              <KV
                label="Encaminhado ao NOC"
                value={yesNo(rf.encaminhado_noc)}
                tone={rf.encaminhado_noc === "sim" ? "amber" : undefined}
              />
              <KV label="Interrompeu atendimento" value={yesNo(rf.interrompeu)} />
            </Grid2>
            <KV label="Motivo" value={rf.motivo} />
          </Panel>

          <Panel>
            <PanelTitle icon="📝">Relato objetivo do técnico</PanelTitle>
            <div
              style={{
                color: d.relato ? C.text : C.muted,
                fontSize: 11.5,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {d.relato || "Nenhum relato registrado."}
            </div>
          </Panel>

          <Panel>
            <PanelTitle icon="🛰">Autorização do NOC</PanelTitle>
            <Grid2>
              <KV
                label="Troca autorizada"
                value={yesNo(noc.autorizada)}
                tone={noc.autorizada === "sim" ? "green" : undefined}
              />
              <KV label="Analista" value={noc.analista} />
            </Grid2>
            <Grid3>
              <KV label="Data" value={noc.data} />
              <KV label="Hora" value={noc.hora} />
              <KV label="Protocolo" value={noc.protocolo} />
            </Grid3>
          </Panel>

          <AiPanel analysis={d.ai_analysis} tipoManutencao={d.tipo_manutencao} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
              marginTop: 10,
            }}
          >
            <SignatureCard
              title="Assinatura do técnico"
              name={payload.tecnico.full_name || "—"}
              image={payload.tecnico.assinatura}
            />
            <div
              data-validation-qr={qr ? "ready" : publicUrl ? "loading" : "unavailable"}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 10,
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: C.panel,
              }}
            >
              {qr ? (
                <img
                  src={qr}
                  alt="QR de validação"
                  data-validation-qr-image="ready"
                  style={{ width: 88, height: 88, borderRadius: 8 }}
                />
              ) : null}
              <div>
                <div style={{ color: C.cyan, fontWeight: 800, fontSize: 11 }}>🛡 Autenticidade</div>
                <div style={{ color: C.muted, fontSize: 9.5, marginTop: 3 }}>
                  Código: {payload.codigo_validacao || "—"}
                </div>
                <div style={{ color: C.muted, fontSize: 9.5 }}>
                  Integridade: {shortHash || "—"}
                </div>
                {payload.finalizado_em ? (
                  <div style={{ color: C.muted, fontSize: 9.5 }}>
                    Finalizado: {fmtDateTime(payload.finalizado_em)}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <Footer code={payload.checklist_code || payload.numero_publico || "—"} />
        </Frame>
      </div>
    );
  },
);
