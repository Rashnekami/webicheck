import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import type { SnapshotPayload } from "@/lib/public-checklist.functions";
import type { CounterproofDocumentInfo } from "@/lib/customer-counterproof.functions";
import {
  INSTALACAO_TECHNICIAN_QUESTIONS,
  readInstalacaoAnswer,
} from "@/lib/instalacao-checklist";
import type { InstalacaoData } from "@/lib/checklist-schema";

export type InstallationDocumentPart = "combined" | "technician" | "customer";

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
  panel2: "#071c3b",
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

function Frame({
  children,
  separated,
}: {
  children: React.ReactNode;
  separated?: boolean;
}) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 24,
        padding: 22,
        marginTop: separated ? 34 : 0,
        background:
          "radial-gradient(circle at 90% 0%, rgba(0,136,255,.17), transparent 26%), linear-gradient(150deg,#020817 0%,#041127 55%,#020817 100%)",
        boxShadow:
          "inset 0 0 48px rgba(0,86,190,.12), 0 0 25px rgba(0,123,255,.16)",
      }}
    >
      {children}
    </section>
  );
}

function Header({
  accent,
  subtitle,
}: {
  accent: string;
  subtitle: string;
}) {
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
          fontSize: 28,
          letterSpacing: 0.5,
          lineHeight: 1.05,
        }}
      >
        CHECKLIST DO <span style={{ color: C.cyan }}>{accent}</span>
      </div>
      <div style={{ color: C.muted, fontSize: 14, marginTop: 5 }}>{subtitle}</div>
    </div>
  );
}

const infoIcons: Record<string, string> = {
  Cliente: "👤",
  OS: "📋",
  Checklist: "✓",
  "Contra-Prova": "✓",
  Código: "🛡",
  Técnico: "👷",
  Cidade: "📍",
  Data: "📅",
  Hora: "🕐",
  Status: "✓",
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

function PanelTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.text,
        fontWeight: 800,
        fontSize: 17,
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

function AnswerBadge({ answer }: { answer: "sim" | "nao" | null }) {
  const positive = answer === "sim";
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "3px 10px",
        minWidth: 64,
        textAlign: "center",
        background: answer === null ? "#334155" : positive ? "#25b62f" : "#d82e49",
        color: "white",
        fontWeight: 900,
        fontSize: 10,
        boxShadow:
          answer === null
            ? "none"
            : `0 0 12px ${positive ? "rgba(69,227,95,.25)" : "rgba(255,82,104,.25)"}`,
      }}
    >
      {answer === null ? "— N/A" : positive ? "✓ SIM" : "✕ NÃO"}
    </span>
  );
}

function QuestionRows({
  items,
}: {
  items: { id: string; question: string; answer: "sim" | "nao" | null }[];
}) {
  return (
    <div>
      {items.map((item, index) => (
        <div
          key={item.id}
          style={{
            display: "grid",
            gridTemplateColumns: "42px 1fr auto",
            alignItems: "center",
            gap: 9,
            borderTop: index === 0 ? "none" : `1px solid ${C.line}`,
            padding: "6px 0",
          }}
        >
          <span
            style={{
              color: "white",
              background: "#0c45a5",
              borderRadius: 9,
              padding: "3px 0",
              textAlign: "center",
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span style={{ color: C.text, fontSize: 11.5, lineHeight: 1.3 }}>
            {item.question}
          </span>
          <AnswerBadge answer={item.answer} />
        </div>
      ))}
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
        padding: "13px 14px",
        display: "grid",
        gridTemplateColumns: "42px 1fr",
        gap: 10,
        alignItems: "center",
        background: "#06152d",
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
        <div style={{ color: C.text, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
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
  date,
}: {
  title: string;
  name: string;
  image?: string | null;
  date?: string | null;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 13,
        minHeight: 125,
        background: "#06152d",
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
      {date ? <div style={{ color: C.muted, fontSize: 9 }}>{fmtDateTime(date)}</div> : null}
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

function TechnicianDocument({
  payload,
  qr,
  publicUrl,
  shortHash,
  counterproof,
}: {
  payload: SnapshotPayload;
  qr: string;
  publicUrl?: string | null;
  shortHash?: string | null;
  counterproof?: CounterproofDocumentInfo | null;
}) {
  const h = payload.header;
  const data = payload.dados as unknown as InstalacaoData;
  const questions = INSTALACAO_TECHNICIAN_QUESTIONS.map((question) => ({
    ...question,
    answer: readInstalacaoAnswer(data.respostas, question.id),
  }));

  return (
    <Frame>
      <Header
        accent="TÉCNICO"
        subtitle="Validação técnica do atendimento"
      />
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
          }}
        >
          ✓ Contra-Prova validada pelo cliente · {counterproof.code} ·{" "}
          {fmtDateTime(counterproof.validated_at)}
        </div>
      ) : null}

      <Panel>
        <PanelTitle icon="🛠">Perguntas do técnico</PanelTitle>
        <QuestionRows items={questions} />
      </Panel>

      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <PanelTitle icon="⚡">Teste de velocidade</PanelTitle>
          <b style={{ color: C.cyan, fontSize: 11 }}>📶 Teste realizado via Wi-Fi</b>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <SpeedCard icon="↓" label="DOWNLOAD" value={data.velocidade?.download} unit="Mbps" />
          <SpeedCard icon="↑" label="UPLOAD" value={data.velocidade?.upload} unit="Mbps" />
          <SpeedCard icon="◉" label="PING" value={data.velocidade?.ping_ms} unit="ms" />
        </div>
      </Panel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginTop: 10,
        }}
      >
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 13,
            minHeight: 125,
            background: "#06152d",
          }}
        >
          <div style={{ color: C.text, fontSize: 13, fontWeight: 800 }}>
            📝 Observações adicionais
          </div>
          <div
            style={{
              marginTop: 10,
              color: data.observacoes ? C.text : C.muted,
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {data.observacoes || "Nenhuma observação adicional registrada."}
          </div>
        </div>
        <SignatureCard
          title="Assinatura do técnico"
          name={payload.tecnico.full_name || "—"}
          image={payload.tecnico.assinatura}
        />
      </div>

      <div
        data-validation-qr={qr ? "ready" : publicUrl ? "loading" : "unavailable"}
        style={{
          marginTop: 10,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#06152d",
        }}
      >
        {qr ? (
          <img
            src={qr}
            alt="QR de validação"
            data-validation-qr-image="ready"
            style={{ width: 76, height: 76, borderRadius: 8 }}
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
        </div>
      </div>
      <Footer code={payload.checklist_code || payload.numero_publico || "—"} />
    </Frame>
  );
}

export function CustomerDocument({
  payload,
  counterproof,
  separated,
}: {
  payload: SnapshotPayload;
  counterproof: CounterproofDocumentInfo;
  separated?: boolean;
}) {
  const items = counterproof.client_checklist?.items ?? [];
  const confirmed = items.filter((item) => item.answer === "sim").length;
  const divergences = items.filter((item) => item.answer === "nao").length;
  const validation = counterproof.validated_at ? new Date(counterproof.validated_at) : null;

  return (
    <Frame separated={separated}>
      <Header
        accent="CLIENTE"
        subtitle="Contra-prova digital do atendimento"
      />
      <InfoGrid
        items={[
          { label: "Cliente", value: counterproof.client_name || payload.header.cliente, wide: true },
          { label: "OS", value: counterproof.service_order || payload.header.os },
          { label: "Contra-Prova", value: counterproof.code },
          { label: "Checklist", value: counterproof.checklist_code, wide: true },
          { label: "Código", value: payload.codigo_validacao, wide: true },
          { label: "Cidade", value: payload.header.cidade },
          { label: "Data", value: validation ? validation.toLocaleDateString("pt-BR") : "—" },
          {
            label: "Hora",
            value: validation
              ? validation.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : "—",
          },
          { label: "Status", value: "VALIDADO PELO CLIENTE", status: true, wide: true },
        ]}
      />

      <Panel>
        <PanelTitle icon="💬">Perguntas do cliente</PanelTitle>
        {items.length ? (
          <QuestionRows
            items={items.map((item) => ({
              id: item.id,
              question: item.question,
              answer: item.answer,
            }))}
          />
        ) : (
          <div style={{ color: C.muted, fontSize: 11, padding: 10 }}>
            Respostas não registradas nesta versão histórica da Contra-Prova.
          </div>
        )}
      </Panel>

      <Panel>
        <PanelTitle icon="🔒">Identificação e assinatura</PanelTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 16,
              background: "#06152d",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 35 }}>🔒</span>
            <div>
              <div style={{ color: C.cyan, fontWeight: 800, fontSize: 11 }}>
                Evidência de identificação registrada
              </div>
              <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.45, marginTop: 5 }}>
                A foto com RG/CNH é privada e pode ser consultada somente pela administração
                autorizada.
              </div>
            </div>
          </div>
          <SignatureCard
            title="Assinatura digital do cliente"
            name={counterproof.client_name || payload.header.cliente?.toString() || "—"}
            image={counterproof.signature_data_url}
            date={counterproof.validated_at}
          />
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon="🛡">Validação final</PanelTitle>
        {divergences > 0 ? (
          <div
            style={{
              color: C.amber,
              background: "rgba(255,176,32,.09)",
              border: "1px solid rgba(255,176,32,.45)",
              padding: "8px 12px",
              borderRadius: 12,
              marginBottom: 10,
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            ⚠ DIVERGÊNCIA IDENTIFICADA
          </div>
        ) : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "CLIENTE", value: `${confirmed}/${items.length || 10}`, detail: "Itens confirmados" },
            { label: "DIVERGÊNCIAS", value: String(divergences), detail: "Respostas negativas" },
            { label: "STATUS FINAL", value: "✓ VALIDADO", detail: "Pelo cliente", green: true },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: 14,
                background: "#06152d",
              }}
            >
              <div style={{ color: C.muted, fontSize: 9 }}>{card.label}</div>
              <div
                style={{
                  color: card.green ? C.green : C.text,
                  fontWeight: 900,
                  fontSize: 22,
                  marginTop: 2,
                }}
              >
                {card.value}
              </div>
              <div style={{ color: C.cyan, fontSize: 9 }}>{card.detail}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Footer code={`Contra-Prova ${counterproof.code}`} />
    </Frame>
  );
}

export const InstallationDarkDocument = forwardRef<HTMLDivElement, Props>(
  function InstallationDarkDocument(
    {
      payload,
      publicUrl,
      shortHash,
      fixedWidth,
      counterproof,
      documentPart = "combined",
    },
    ref,
  ) {
    const qr = useQrDataUrl(publicUrl);
    const showTechnician = documentPart !== "customer";
    const showCustomer =
      documentPart !== "technician" && counterproof?.status === "validated";

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
        {showTechnician ? (
          <TechnicianDocument
            payload={payload}
            qr={qr}
            publicUrl={publicUrl}
            shortHash={shortHash}
            counterproof={counterproof}
          />
        ) : null}
        {showCustomer && counterproof ? (
          <CustomerDocument
            payload={payload}
            counterproof={counterproof}
            separated={showTechnician}
          />
        ) : null}
      </div>
    );
  },
);
