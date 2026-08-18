import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Loader2, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { WB_STATUS_LABEL, formatProtocolInput, formatWbDate, type PublicReportView } from "@/lib/whistleblower";
import { prepareFiles, type PreparedFile } from "@/lib/whistleblower-files";
import {
  getReporterAttachmentUrl,
  postReporterMessage,
  trackWhistleblowerReport,
} from "@/lib/whistleblower-public.functions";
import { downloadDenunciaPdf } from "@/components/denuncia/denuncia-pdf";
import { Shell } from "@/routes/denuncia.index";

export const Route = createFileRoute("/denuncia/acompanhar")({
  head: () => ({
    meta: [
      { title: "Acompanhar denúncia — Canal Ético CheckTécnico" },
      {
        name: "description",
        content: "Consulte o andamento da sua denúncia com o protocolo e a chave de acesso, e converse com o RH.",
      },
      { property: "og:title", content: "Acompanhar denúncia — Canal Ético" },
      { property: "og:description", content: "Consulte o andamento da sua denúncia de forma anônima e segura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcompanharDenuncia,
});

function AcompanharDenuncia() {
  const [protocol, setProtocol] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<PublicReportView | null>(null);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [sending, setSending] = useState(false);

  async function load(silent = false) {
    if (!protocol.trim() || !accessKey.trim()) return toast.error("Informe o protocolo e a chave de acesso.");
    if (!silent) setLoading(true);
    try {
      const data = await trackWhistleblowerReport({
        data: { protocol: formatProtocolInput(protocol), accessKey: accessKey.trim() },
      });
      setView(data);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível consultar a denúncia.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!message.trim() && files.length === 0) return toast.error("Escreva uma mensagem ou anexe um arquivo.");
    setSending(true);
    try {
      await postReporterMessage({
        data: {
          protocol: formatProtocolInput(protocol),
          accessKey: accessKey.trim(),
          message: message.trim(),
          files,
        },
      });
      setMessage("");
      setFiles([]);
      toast.success("Mensagem enviada ao RH.");
      await load(true);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar sua mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function openAttachment(id: string) {
    try {
      const { url } = await getReporterAttachmentUrl({
        data: { protocol: formatProtocolInput(protocol), accessKey: accessKey.trim(), attachmentId: id },
      });
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir a evidência.");
    }
  }

  return (
    <Shell>
      <Card className="mb-6 bg-card/70">
        <CardHeader>
          <CardTitle>Acompanhar denúncia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Protocolo</Label>
              <Input value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="DEN-2026-XXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>Chave de acesso</Label>
              <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <Button size="lg" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Consultar
          </Button>
        </CardContent>
      </Card>

      {view && (
        <div className="space-y-6">
          <Card className="bg-card/70">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{view.title}</CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{view.protocol}</p>
              </div>
              <Badge>{WB_STATUS_LABEL[view.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <Info label="Categoria" value={view.categoryLabel} />
                <Info label="Registrada em" value={formatWbDate(view.createdAt)} />
                <Info label="Última atualização" value={formatWbDate(view.updatedAt)} />
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Andamento</p>
                <div className="space-y-2">
                  {view.timeline.map((t, i) => (
                    <div key={`${t.at}-${i}`} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p>{t.label}</p>
                        <p className="text-xs text-muted-foreground">{formatWbDate(t.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Button variant="outline" onClick={() => downloadDenunciaPdf(view)}>
                <Download className="mr-2 h-4 w-4" /> Baixar comprovante
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Mensagens com o RH</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {view.messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                )}
                {view.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 text-sm ${
                      m.sender === "RH" ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background/40"
                    }`}
                  >
                    <p className="mb-1 text-xs text-muted-foreground">
                      {m.sender === "RH" ? "RH" : "Você"} • {formatWbDate(m.at)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))}
              </div>

              {view.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidências</p>
                  {view.attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => openAttachment(a.id)}
                      className="block w-full truncate rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:border-primary/50"
                    >
                      {a.name} <span className="text-xs text-muted-foreground">• {formatWbDate(a.at)}</span>
                    </button>
                  ))}
                </div>
              )}

              <Separator />
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva uma resposta ou envie informações complementares..."
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <FileUp className="h-4 w-4" /> Anexar evidência
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const list = e.target.files;
                    e.currentTarget.value = "";
                    if (!list?.length) return;
                    try {
                      const prepared = await prepareFiles(list);
                      setFiles((p) => [...p, ...prepared]);
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                />
              </label>
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span className="truncate">{f.name}</span>
                  <Button variant="ghost" size="icon" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button onClick={send} disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar ao RH
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </Shell>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p>{value || "—"}</p>
    </div>
  );
}
