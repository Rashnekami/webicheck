import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { JsonValue, SnapshotPayload } from "@/lib/public-checklist.functions";

interface Props {
  payload: SnapshotPayload;
  publicUrl?: string | null;
  shortHash?: string | null;
  version?: number | null;
  /** Renderiza com largura fixa em px (para exportação PNG). */
  fixedWidth?: number;
}

const BRAND = "#1a53ff";
const BRAND_DARK = "#0f3fd4";
const BORDER = "#c9d3e6";
const INK = "#0f172a";
const MUTED = "#64748b";
const SOFT = "#f4f7ff";

function fmtDateISO(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}
function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}
function yesNo(v: unknown) {
  if (v === "sim" || v === true) return "Sim";
  if (v === "nao" || v === false) return "Não";
  return "—";
}

function Field({ label, value }: { label: string; value?: unknown }) {
  return (
    <div style={{ display: "flex", padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: MUTED, marginRight: 6 }}>{label}:</span>
      <span style={{ fontWeight: 600, color: INK }}>
        {(value ?? "") === "" ? "—" : String(value)}
      </span>
    </div>
  );
}
function Chk({ v, label }: { v: unknown; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "4px 0",
        fontSize: 13,
        gap: 8,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          border: "1.5px solid #334155",
          borderRadius: 3,
          background: v ? BRAND : "white",
          flexShrink: 0,
          marginTop: 2,
          boxShadow: v ? "inset 0 0 0 2px white" : "none",
        }}
      />
      <span style={{ color: INK, lineHeight: 1.35 }}>{label}</span>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: BRAND,
        color: "white",
        fontWeight: 700,
        padding: "6px 10px",
        marginTop: 14,
        fontSize: 14,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        letterSpacing: 0.2,
      }}
    >
      {children}
    </div>
  );
}
function SectionBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderTop: 0,
        padding: 10,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        background: "white",
      }}
    >
      {children}
    </div>
  );
}

function SubsectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 8,
        marginBottom: 3,
        fontSize: 10,
        fontWeight: 800,
        color: BRAND_DARK,
        textTransform: "uppercase",
        letterSpacing: 0.7,
      }}
    >
      {children}
    </div>
  );
}

function useQrDataUrl(text: string | null | undefined) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let ok = true;
    if (!text) {
      setUrl("");
      return;
    }
    QRCode.toDataURL(text, {
      margin: 1,
      width: 320,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((u) => {
        if (ok) setUrl(u);
      })
      .catch(() => setUrl(""));
    return () => {
      ok = false;
    };
  }, [text]);
  return url;
}

export const ChecklistDocumentView = forwardRef<HTMLDivElement, Props>(
  function ChecklistDocumentView({ payload, publicUrl, shortHash, version, fixedWidth }, ref) {
    const isInstal = payload.tipo === "instalacao";
    const h = payload.header;
    const d = payload.dados as Record<string, Record<string, unknown> | string>;
    const qr = useQrDataUrl(publicUrl ?? null);

    const containerStyle: React.CSSProperties = {
      width: fixedWidth ? `${fixedWidth}px` : "100%",
      maxWidth: fixedWidth ? `${fixedWidth}px` : "820px",
      background: "white",
      color: INK,
      padding: 24,
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 13,
      lineHeight: 1.4,
      boxSizing: "border-box",
    };

    const tecAssinatura = payload.tecnico.assinatura;
    const clienteAssinatura = isInstal
      ? ((d.assinatura_cliente as string | null | undefined) ?? null)
      : null;

    return (
      <div ref={ref} style={containerStyle} data-checklist-document>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 96,
              padding: 10,
              background: "white",
              borderRight: `1px solid ${BORDER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={logoAsset.url}
              alt="Webifibra"
              crossOrigin="anonymous"
              style={{ width: 76, height: "auto", objectFit: "contain" }}
            />
          </div>
          <div style={{ flex: 1, background: SOFT, padding: 12 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: BRAND_DARK,
                letterSpacing: 0.2,
              }}
            >
              {isInstal ? "CHECKLIST DE INSTALAÇÃO" : "CHECKLIST TÉCNICO DE VALIDAÇÃO DE ONT"}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Documento oficial Webifibra · uso interno e comprovação técnica
            </div>
            <span
              style={{
                display: "inline-block",
                marginTop: 6,
                background: BRAND,
                color: "white",
                fontWeight: 700,
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                letterSpacing: 0.5,
              }}
            >
              {version && version > 1 ? `VERSÃO ${version}` : "DOCUMENTO OFICIAL"}
            </span>
          </div>
        </div>

        {/* Number banner */}
        <div
          style={{
            border: `1px solid ${BRAND}`,
            borderRadius: 6,
            background: SOFT,
            padding: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: 0.8 }}>
              NÚMERO DO CHECKLIST
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: BRAND_DARK,
                letterSpacing: 1,
              }}
            >
              {payload.checklist_code || payload.numero_publico || "—"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: 0.8 }}>
              CÓDIGO DE VALIDAÇÃO
            </div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{payload.codigo_validacao || "—"}</div>
          </div>
        </div>

        {/* 1 — Identificação */}
        <SectionTitle>1. Identificação do atendimento</SectionTitle>
        <SectionBox>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              rowGap: 2,
              columnGap: 12,
            }}
          >
            <Field label="OS" value={h.os as string} />
            <Field label="Cliente" value={h.cliente as string} />
            <Field label="Cidade" value={h.cidade as string} />
            <Field label="Técnico" value={payload.tecnico.full_name} />
            <Field label="Data" value={fmtDateISO(h.data_atendimento as string)} />
            <Field label="Hora" value={h.hora_atendimento as string} />
            {isInstal ? (
              <>
                <Field label="Plano" value={h.plano as string} />
                <Field label="Endereço" value={h.endereco as string} />
              </>
            ) : (
              <>
                <Field label="Modelo" value={h.modelo as string} />
                <Field label="Serial" value={h.serial as string} />
                <Field label="CTO/Porta" value={h.cto_porta as string} />
              </>
            )}
          </div>
        </SectionBox>

        {isInstal ? <InstalacaoBody d={d as never} /> : <ValidacaoBody d={d as never} h={h} />}

        {/* Assinaturas + Autenticidade */}
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isInstal ? "1fr 1fr 220px" : "1fr 220px",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <SignBox
            title="Técnico responsável"
            name={payload.tecnico.full_name}
            image={tecAssinatura}
          />
          {isInstal && (
            <SignBox
              title="Assinatura do cliente"
              name={(h.cliente as string) || "—"}
              image={clienteAssinatura}
            />
          )}
          <AuthBox qr={qr} publicUrl={publicUrl} shortHash={shortHash} />
        </div>

        <div
          style={{
            marginTop: 14,
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 6,
            fontSize: 11,
            color: MUTED,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Webifibra · {payload.checklist_code || payload.numero_publico || "—"}</span>
          <span>Finalizado: {fmtDateTime(payload.finalizado_em)}</span>
        </div>
      </div>
    );
  },
);

function SignBox({ title, name, image }: { title: string; name: string; image?: string | null }) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: 8,
        minHeight: 130,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        background: "white",
      }}
    >
      {image ? (
        <img
          src={image}
          alt={title}
          crossOrigin="anonymous"
          style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain" }}
        />
      ) : (
        <span style={{ color: MUTED, fontSize: 11 }}>(assinatura não registrada)</span>
      )}
      <div
        style={{
          marginTop: 6,
          borderTop: "1px solid #334155",
          width: "90%",
          paddingTop: 4,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700 }}>{name || "—"}</div>
        <div style={{ fontSize: 10, color: MUTED }}>{title}</div>
      </div>
    </div>
  );
}

function AuthBox({
  qr,
  publicUrl,
  shortHash,
}: {
  qr: string;
  publicUrl?: string | null;
  shortHash?: string | null;
}) {
  return (
    <div
      data-validation-qr={qr ? "ready" : publicUrl ? "loading" : "unavailable"}
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: 8,
        background: SOFT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        textAlign: "center",
      }}
    >
      {qr ? (
        <img
          src={qr}
          alt="QR de validação"
          data-validation-qr-image="ready"
          style={{ width: 130, height: 130 }}
        />
      ) : (
        <div
          style={{
            width: 130,
            height: 130,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: MUTED,
          }}
        >
          (link não disponível)
        </div>
      )}
      <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>
        Escaneie para consultar e validar
      </div>
      {shortHash && (
        <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>
          Integridade: <b style={{ color: INK }}>{shortHash}</b>
        </div>
      )}
      {publicUrl && (
        <div
          style={{
            fontSize: 9,
            color: MUTED,
            wordBreak: "break-all",
            marginTop: 2,
            maxWidth: 200,
          }}
        >
          {publicUrl}
        </div>
      )}
    </div>
  );
}

function ValidacaoBody({
  d,
  h,
}: {
  d: Record<string, Record<string, unknown>>;
  h: Record<string, JsonValue>;
}) {
  const s = d.sintoma ?? {};
  const vf = d.validacao_fisica ?? {};
  const tc = d.teste_cabeado ?? {};
  const tw = d.teste_wifi ?? {};
  const ev = d.evidencias_marcadas ?? {};
  const rf = d.resultado_final ?? {};
  const noc = d.noc ?? {};
  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: 12,
  };

  return (
    <>
      <SectionTitle>2. Sintoma confirmado em campo</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Chk v={s.ont_nao_liga} label="ONT não liga" />
          <Chk v={s.ont_queimada} label="ONT/ONU queimada" />
          <Chk v={s.ont_danificada_cliente} label="ONT/ONU danificada pelo cliente" />
          <Chk v={s.ont_reinicia} label="ONT reinicia/desliga" />
          <Chk v={s.perde_internet} label="Perde internet/provisionamento" />
          <Chk v={s.internet_cai_pon_acesa} label="Internet cai com PON acesa" />
          <Chk v={s.los_acende} label="LOS acende" />
          <Chk v={s.wifi_5g_desaparece} label="Wi-Fi 5 GHz desaparece" />
          <Chk v={s.wifi_ambas_desaparecem} label="Wi-Fi 2,4 e 5 GHz desaparecem" />
          <Chk v={s.wifi_falha_cabo_ok} label="Wi-Fi falha, cabo OK" />
          <Chk v={s.lan_nao_funciona} label="Porta LAN não funciona" />
          <Chk v={s.lentidao} label="Lentidão" />
        </div>
        <div style={{ marginTop: 6 }}>
          <Field label="Outro" value={s.outro_texto as string} />
          <div style={grid2}>
            <Field label="Falha presenciada" value={yesNo(s.falha_presenciada)} />
            <Field label="Horário" value={s.horario as string} />
          </div>
        </div>
      </SectionBox>

      <SectionTitle>3. Validação física</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Chk v={vf.tomada} label="Tomada e alimentação verificadas" />
          <Chk v={vf.fonte} label="Fonte e conector verificados" />
          <Chk v={vf.outra_tomada} label="Testada em outra tomada" />
          <Chk v={vf.outra_fonte} label="Testada com outra fonte" />
          <Chk v={vf.patch_cord} label="Patch cord óptico verificado" />
          <Chk v={vf.sem_dobras} label="Sem dobras no cabo óptico" />
          <Chk v={vf.luz_verde_ok} label="LED PON/Óptico OK" />
          <Chk v={vf.roseta_ok} label="Roseta/adaptador OK" />
        </div>
      </SectionBox>

      <SectionTitle>4. Teste cabeado</SectionTitle>
      <SectionBox>
        <Field label="Aplica-se ao atendimento" value={yesNo(tc.aplicabilidade)} />
        {tc.aplicabilidade === "nao" ? (
          <div style={{ marginTop: 5, color: MUTED }}>
            Não se aplica — atendimento realizado sem equipamento para teste cabeado.
          </div>
        ) : (
          <>
            <SubsectionLabel>Execução do teste</SubsectionLabel>
            <div style={grid2}>
              <Chk v={tc.navegacao} label="Navegação testada" />
              <Chk v={tc.ping} label="Ping testado" />
              <Chk v={tc.velocidade} label="Velocidade testada" />
              <Chk v={tc.cabo_substituido} label="Cabo substituído" />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                columnGap: 12,
                marginTop: 4,
              }}
            >
              <Field label="Download (Mbps)" value={tc.download as string} />
              <Field label="Upload (Mbps)" value={tc.upload as string} />
              <Field label="Ping (ms)" value={tc.ping_ms as string} />
            </div>
            <SubsectionLabel>Resultado do teste</SubsectionLabel>
            <div style={grid2}>
              <Chk v={tc.funcionou} label="Funcionou normalmente" />
              <Chk v={tc.apresentou_falha} label="Também apresentou falha" />
              <Chk v={tc.ont_reiniciou} label="ONT reiniciou" />
              <Chk v={tc.lan_falhou} label="Porta LAN não funcionou" />
              <Chk v={tc.nao_testado} label="Aplicável, mas não foi possível testar" />
            </div>
          </>
        )}
      </SectionBox>

      <SectionTitle>5. Teste Wi-Fi</SectionTitle>
      <SectionBox>
        <SubsectionLabel>Execução do teste</SubsectionLabel>
        <div style={grid2}>
          <Chk v={tw.rede_24} label="Rede 2,4 GHz testada" />
          <Chk v={tw.rede_5} label="Rede 5 GHz testada" />
          <Chk v={tw.mais_aparelhos} label="Testado em mais de um aparelho" />
          <Chk v={tw.cabo_funcionando} label="Cabo permanece funcionando" />
        </div>
        <SubsectionLabel>Velocidade medida no Wi-Fi</SubsectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 12 }}>
          <Field label="Download (Mbps)" value={tw.download as string} />
          <Field label="Upload (Mbps)" value={tw.upload as string} />
          <Field label="Ping (ms)" value={tw.ping_ms as string} />
        </div>
        <SubsectionLabel>Resultado do teste</SubsectionLabel>
        <div style={grid2}>
          <Chk v={tw.apenas_5g_desaparece} label="Apenas 5 GHz desaparece" />
          <Chk v={tw.ambas_desaparecem} label="Ambas as redes desaparecem" />
          <Chk v={tw.sem_internet} label="Wi-Fi visível sem internet" />
          <Chk v={tw.um_aparelho} label="Ocorreu apenas em um aparelho" />
          <Chk v={tw.nao_reproduzida} label="Falha não reproduzida" />
        </div>
      </SectionBox>

      <SectionTitle>6. Evidências marcadas</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Chk v={ev.etiqueta} label="Foto da etiqueta (modelo/serial)" />
          <Chk v={ev.leds} label="Foto dos LEDs da ONT" />
          <Chk v={ev.fonte} label="Foto da fonte/conexões" />
          <Chk v={ev.teste_cabeado} label="Evidência do teste cabeado" />
          <Chk v={ev.teste_wifi} label="Evidência do teste Wi-Fi" />
        </div>
      </SectionBox>

      <SectionTitle>7. Resultado após reset/teste final</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Chk v={rf.permaneceu} label="Falha permaneceu" />
          <Chk v={rf.parou} label="Falha parou" />
          <Chk v={rf.nao_reproduzida} label="Não foi reproduzida" />
          <Field label="Encaminhado ao NOC" value={yesNo(rf.encaminhado_noc)} />
          <Field label="Interrompeu atendimento" value={yesNo(rf.interrompeu)} />
        </div>
        <Field label="Motivo" value={rf.motivo as string} />
      </SectionBox>

      <SectionTitle>8. Relato objetivo do técnico</SectionTitle>
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderTop: 0,
          padding: 12,
          minHeight: 70,
          background: "#fafbff",
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          whiteSpace: "pre-wrap",
          fontSize: 13,
        }}
      >
        {(d.relato as unknown as string) || "—"}
      </div>

      <SectionTitle>9. Equipamento e conclusão da troca</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Field label="Troca realizada" value={yesNo(h.troca_realizada)} />
          <Field label="Etiqueta da ONT retirada" value={h.equipment_tag_code} />
          <Field label="Modelo retirado" value={h.modelo_ont_retirada || h.modelo} />
          <Field label="Serial retirado" value={h.serial_ont_retirada || h.serial} />
          <Field label="Modelo instalado" value={h.modelo_ont_instalada} />
          <Field label="Serial instalado" value={h.serial_ont_instalada} />
        </div>
      </SectionBox>

      <SectionTitle>10. Registro da autorização do NOC</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Field label="Troca autorizada" value={yesNo(noc.autorizada)} />
          <Field label="Analista" value={noc.analista as string} />
          <Field label="Data" value={noc.data as string} />
          <Field label="Hora" value={noc.hora as string} />
        </div>
        <Field label="Protocolo / OS do NOC" value={noc.protocolo as string} />
      </SectionBox>
    </>
  );
}

function InstalacaoBody({ d }: { d: Record<string, Record<string, unknown>> }) {
  const itens = d.itens ?? {};
  const vel = d.velocidade ?? {};
  return (
    <>
      <SectionTitle>2. Validação técnica e orientação ao cliente</SectionTitle>
      <SectionBox>
        <Chk
          v={itens.velocidade_ok}
          label="Teste de velocidade realizado via cabo, comprovando a entrega da banda contratada."
        />
        <Chk v={itens.navegacao_ok} label="Navegação e estabilidade da conexão validadas." />
        <Chk
          v={itens.wifi_orientado}
          label="Cliente orientado sobre a diferença das redes Wi-Fi (2,4 GHz x 5 GHz)."
        />
        <Chk
          v={itens.placa_orientado}
          label="Cliente orientado que a velocidade via Wi-Fi depende da placa de rede do aparelho."
        />
        <Chk
          v={itens.cabo_orientado}
          label="Orientado a utilizar cabo em Smart TVs, videogames e equipamentos que exigem estabilidade."
        />
        <Chk
          v={itens.posicionamento_ok}
          label="Posicionamento do roteador validado e orientado sobre interferências."
        />
        <Chk
          v={itens.downdetector}
          label="Apresentado o Downdetector para verificar quedas globais antes de acionar o suporte."
        />
        <Chk v={itens.duvidas_sanadas} label="Dúvidas finais do cliente sanadas no local." />
      </SectionBox>

      <SectionTitle>3. Medições do teste de velocidade</SectionTitle>
      <SectionBox>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            columnGap: 12,
          }}
        >
          <Field label="Download (Mbps)" value={vel.download as string} />
          <Field label="Upload (Mbps)" value={vel.upload as string} />
          <Field label="Ping (ms)" value={vel.ping_ms as string} />
        </div>
      </SectionBox>

      <SectionTitle>4. Observações adicionais</SectionTitle>
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderTop: 0,
          padding: 12,
          minHeight: 60,
          background: "#fafbff",
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          whiteSpace: "pre-wrap",
          fontSize: 13,
        }}
      >
        {(d.observacoes as unknown as string) || "—"}
      </div>
    </>
  );
}
