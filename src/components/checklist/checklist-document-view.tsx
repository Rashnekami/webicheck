import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { SnapshotPayload } from "@/lib/public-checklist.functions";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";
import {
  INSTALACAO_TECHNICIAN_QUESTIONS,
  readInstalacaoAnswer,
} from "@/lib/instalacao-checklist";
import {
  InstallationDarkDocument,
  type InstallationDocumentPart,
} from "@/components/checklist/installation-dark-document";
import { ValidationDarkDocument } from "@/components/checklist/validation-dark-document";
import { labelTipoManutencao, RECOMENDACAO_LABEL } from "@/lib/ont-checklist-ai";
import type { StoredAiAnalysis } from "@/lib/checklist-schema";


interface Props {
  payload: SnapshotPayload;
  publicUrl?: string | null;
  shortHash?: string | null;
  version?: number | null;
  /** Renderiza com largura fixa em px (para exportação PNG). */
  fixedWidth?: number;
  counterproof?: CounterproofDocumentInfo | null;
  documentPart?: InstallationDocumentPart;
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
  function ChecklistDocumentView(
    {
      payload,
      publicUrl,
      shortHash,
      version,
      fixedWidth,
      counterproof,
      documentPart = "combined",
    },
    ref,
  ) {
    const isInstal = payload.tipo === "instalacao";
    const h = payload.header;
    const d = payload.dados as Record<string, Record<string, unknown> | string>;
    const qr = useQrDataUrl(publicUrl ?? null);

    if (isInstal) {
      return (
        <InstallationDarkDocument
          ref={ref}
          payload={payload}
          publicUrl={publicUrl}
          shortHash={shortHash}
          version={version}
          fixedWidth={fixedWidth}
          counterproof={counterproof}
          documentPart={documentPart}
        />
      );
    }

    return (
      <ValidationDarkDocument
        ref={ref}
        payload={payload}
        publicUrl={publicUrl}
        shortHash={shortHash}
        version={version}
        fixedWidth={fixedWidth}
        counterproof={counterproof}
        documentPart={documentPart}
      />
    );
  },
);


function CustomerCounterproofDocumentSection({
  counterproof,
}: {
  counterproof: CounterproofDocumentInfo;
}) {
  const items = counterproof.client_checklist?.items ?? [];
  return (
    <div
      style={{
        marginTop: 36,
        borderTop: "10px solid #e2e8f0",
        paddingTop: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 96,
            padding: 10,
            borderRight: `1px solid ${BORDER}`,
            display: "flex",
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
          <div style={{ fontSize: 16, fontWeight: 800, color: BRAND_DARK }}>
            CHECKLIST DO CLIENTE
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            Contra-Prova Digital vinculada ao atendimento técnico
          </div>
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              borderRadius: 4,
              background: "#059669",
              color: "white",
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            VALIDADA PELO CLIENTE
          </span>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #86efac",
          borderRadius: 6,
          background: "#f0fdf4",
          padding: 10,
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
        }}
      >
        <div><span style={{ color: MUTED }}>Contra-Prova: </span><b>{counterproof.code}</b></div>
        <div><span style={{ color: MUTED }}>Checklist técnico: </span><b>{counterproof.checklist_code}</b></div>
        <div><span style={{ color: MUTED }}>Cliente: </span><b>{counterproof.client_name || "—"}</b></div>
        <div><span style={{ color: MUTED }}>OS: </span><b>{counterproof.service_order || "—"}</b></div>
        <div style={{ gridColumn: "1 / -1" }}><span style={{ color: MUTED }}>Data/hora: </span><b>{fmtDateTime(counterproof.validated_at)}</b></div>
      </div>

      <SectionTitle>Respostas do cliente - Sim ou Não</SectionTitle>
      <SectionBox>
        {items.length ? items.map((item, index) => (
          <div
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: "26px 1fr 58px",
              gap: 8,
              alignItems: "start",
              padding: "8px 0",
              borderBottom: index === items.length - 1 ? "none" : "1px solid #e2e8f0",
            }}
          >
            <b style={{ color: MUTED }}>{index + 1}.</b>
            <span>{item.question}</span>
            <b
              style={{
                borderRadius: 4,
                padding: "2px 4px",
                textAlign: "center",
                color: item.answer === "sim" ? "#166534" : "#92400e",
                background: item.answer === "sim" ? "#dcfce7" : "#fef3c7",
              }}
            >
              {item.answer === "sim" ? "SIM" : "NÃO"}
            </b>
          </div>
        )) : (
          <div style={{ color: MUTED }}>
            Respostas não registradas. Esta Contra-Prova foi concluída antes da versão com
            checklist do cliente.
          </div>
        )}
      </SectionBox>

      <div
        style={{
          marginTop: 12,
          border: "1px solid #bfdbfe",
          borderRadius: 6,
          background: "#eff6ff",
          padding: 10,
        }}
      >
        <b style={{ color: BRAND_DARK }}>Evidência de identificação registrada</b>
        <div style={{ marginTop: 3, color: MUTED, fontSize: 11 }}>
          A foto com RG/CNH é privada e pode ser consultada somente pela administração autorizada.
        </div>
      </div>

      <div style={{ marginTop: 14, maxWidth: 380 }}>
        <SignBox
          title="Assinatura digital do cliente"
          name={counterproof.client_name || "—"}
          image={counterproof.signature_data_url}
        />
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
        <span>Webifibra · Contra-Prova {counterproof.code}</span>
        <span>Checklist {counterproof.checklist_code}</span>
      </div>
    </div>
  );
}

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

function ValidacaoBody({ d }: { d: Record<string, Record<string, unknown>> }) {
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

      <SectionTitle>9. Registro da autorização do NOC</SectionTitle>
      <SectionBox>
        <div style={grid2}>
          <Field label="Troca autorizada" value={yesNo(noc.autorizada)} />
          <Field label="Analista" value={noc.analista as string} />
          <Field label="Data" value={noc.data as string} />
          <Field label="Hora" value={noc.hora as string} />
        </div>
        <Field label="Protocolo / OS do NOC" value={noc.protocolo as string} />
      </SectionBox>

      <AiAnalysisSection
        analysis={(d.ai_analysis as unknown as StoredAiAnalysis | null | undefined) ?? null}
        tipoManutencao={(d.tipo_manutencao as unknown as string | null | undefined) ?? null}
      />

      <TrocaBox />
    </>
  );
}

function AiAnalysisSection({
  analysis,
  tipoManutencao,
}: {
  analysis: StoredAiAnalysis | null | undefined;
  tipoManutencao: string | null | undefined;
}) {
  if (!analysis && !tipoManutencao) return null;
  return (
    <>
      <SectionTitle>10. Análise por IA (consultiva)</SectionTitle>
      <SectionBox>
        <Field label="Tipo de manutenção" value={labelTipoManutencao(tipoManutencao)} />
        {analysis ? (
          <>
            <Field
              label="Recomendação"
              value={RECOMENDACAO_LABEL[analysis.recomendacao] ?? analysis.recomendacao}
            />
            <Field label="Diagnóstico provável" value={analysis.diagnostico_provavel} />
            <Field label="Causa raiz" value={analysis.causa_raiz} />
            <Field label="Justificativa" value={analysis.justificativa} />
            <Field
              label="Inconsistências"
              value={
                analysis.inconsistencias.length
                  ? analysis.inconsistencias.map((item) => `• ${item}`).join("\n")
                  : "Nenhuma"
              }
            />
            <Field label="Resumo técnico" value={analysis.resumo_tecnico} />
            <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>
              Gerado em {new Date(analysis.gerado_em).toLocaleString("pt-BR")} · {analysis.modelo_ia}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: MUTED }}>Análise por IA não solicitada.</div>
        )}
      </SectionBox>
    </>
  );
}


function TrocaBox() {
  return null;
}

function InstalacaoBody({ d }: { d: Record<string, Record<string, unknown>> }) {
  const respostas = (d.respostas ?? {}) as Record<string, unknown>;
  const vel = d.velocidade ?? {};
  const legacyItens = (d.itens ?? {}) as Record<string, unknown>;
  const hasNew = INSTALACAO_TECHNICIAN_QUESTIONS.some(
    (q) => readInstalacaoAnswer(respostas, q.id) !== null,
  );
  return (
    <>
      <SectionTitle>2. Checklist do técnico (Sim / Não)</SectionTitle>
      <SectionBox>
        {hasNew || Object.keys(legacyItens).length === 0 ? (
          <div style={{ display: "grid", rowGap: 4 }}>
            {INSTALACAO_TECHNICIAN_QUESTIONS.map((q, idx) => {
              const ans = readInstalacaoAnswer(respostas, q.id);
              return (
                <div
                  key={q.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "4px 0",
                    borderBottom: `1px dashed ${BORDER}`,
                    fontSize: 12,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <span style={{ color: "#64748b", marginRight: 6 }}>{idx + 1}.</span>
                    {q.question}
                  </span>
                  <b
                    style={{
                      color:
                        ans === "nao" ? "#b45309" : ans === "sim" ? "#166534" : "#94a3b8",
                    }}
                  >
                    {ans === "sim" ? "Sim" : ans === "nao" ? "Não" : "—"}
                  </b>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <Chk
              v={legacyItens.velocidade_ok}
              label="Teste de velocidade realizado via cabo, comprovando a entrega da banda contratada."
            />
            <Chk v={legacyItens.navegacao_ok} label="Navegação e estabilidade da conexão validadas." />
            <Chk
              v={legacyItens.wifi_orientado}
              label="Cliente orientado sobre a diferença das redes Wi-Fi (2,4 GHz x 5 GHz)."
            />
            <Chk
              v={legacyItens.placa_orientado}
              label="Cliente orientado que a velocidade via Wi-Fi depende da placa de rede do aparelho."
            />
            <Chk
              v={legacyItens.cabo_orientado}
              label="Orientado a utilizar cabo em Smart TVs, videogames e equipamentos que exigem estabilidade."
            />
            <Chk
              v={legacyItens.posicionamento_ok}
              label="Posicionamento do roteador validado e orientado sobre interferências."
            />
            <Chk
              v={legacyItens.downdetector}
              label="Apresentado o Downdetector para verificar quedas globais antes de acionar o suporte."
            />
            <Chk v={legacyItens.duvidas_sanadas} label="Dúvidas finais do cliente sanadas no local." />
          </>
        )}
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
