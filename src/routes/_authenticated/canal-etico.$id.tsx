import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Lock, Paperclip, Save, Send, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  WB_PRIORITY,
  WB_PRIORITY_LABEL,
  WB_STATUS,
  WB_STATUS_LABEL,
  formatWbDate,
  type WbPriority,
  type WbStatus,
} from "@/lib/whistleblower";
import {
  addWhistleblowerInternalNote,
  getWhistleblowerAttachmentUrl,
  getWhistleblowerReport,
  logWhistleblowerExport,
  postWhistleblowerRhMessage,
  updateWhistleblowerReport,
} from "@/lib/whistleblower-admin.functions";
import { downloadDenunciaInternaPdf } from "@/components/denuncia/denuncia-interno-pdf";
import { analyzeWhistleblowerReport } from "@/lib/whistleblower-ai.functions";

export const Route = createFileRoute("/_authenticated/canal-etico/$id")({
  head: () => ({
    meta: [
      { title: "Denúncia — Canal Ético | CheckTécnico" },
      { name: "description", content: "Tratamento confidencial de uma denúncia recebida pelo Canal Ético." },
      { property: "og:title", content: "Denúncia — Canal Ético" },
      { property: "og:description", content: "Tratamento confidencial de uma denúncia recebida pelo Canal Ético." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CanalEticoDetalhe,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

function CanalEticoDetalhe() {
  const { id } = Route.useParams();
  const query = useQuery({ queryKey: ["wb-report", id], queryFn: () => getWhistleblowerReport({ data: { id } }) });
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [publicNote, setPublicNote] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const data = query.data as any;

  useEffect(() => {
    if (!data?.report) return;
    setStatus(data.report.status);
    setPriority(data.report.priority ?? "MEDIA");
    setConclusion(data.report.conclusion ?? "");
  }, [data?.report?.id, data?.report?.status, data?.report?.priority, data?.report?.conclusion]);

  if (query.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (query.isError || !data) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card className="border-destructive/40">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Não foi possível abrir esta denúncia.
          </CardContent>
        </Card>
      </main>
    );
  }

  const r = data.report;

  async function save() {
    setSaving(true);
    try {
      await updateWhistleblowerReport({
        data: { id, status, priority, conclusion, publicNote: publicNote.trim() || undefined },
      });
      setPublicNote("");
      toast.success("Denúncia atualizada.");
      await query.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function sendNote() {
    if (note.trim().length < 3) return toast.error("Escreva a nota interna.");
    try {
      await addWhistleblowerInternalNote({ data: { id, note: note.trim() } });
      setNote("");
      await query.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function sendMessage() {
    if (message.trim().length < 3) return toast.error("Escreva a mensagem ao denunciante.");
    try {
      await postWhistleblowerRhMessage({ data: { id, message: message.trim() } });
      setMessage("");
      toast.success("Mensagem enviada ao denunciante.");
      await query.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function openAttachment(attachmentId: string) {
    try {
      const { url } = await getWhistleblowerAttachmentUrl({ data: { attachmentId } });
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir a evidência.");
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      let ai: any = null;
      try {
        ai = await analyzeWhistleblowerReport({ data: { id } });
      } catch {
        toast.message("Relatório gerado sem a triagem de IA (serviço indisponível).");
      }
      await downloadDenunciaInternaPdf({ ...data, ai });
      await logWhistleblowerExport({ data: { id, kind: "pdf_interno" } });
    } catch {
      toast.error("Não foi possível gerar o relatório.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link to="/canal-etico">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Button variant="outline" onClick={exportPdf} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Relatório confidencial
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{r.protocol}</p>
            <CardTitle className="mt-1 text-lg">{r.title}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{r.report_type === "ANONYMOUS" ? "Anônima" : "Identificada"}</Badge>
            <Badge>{WB_STATUS_LABEL[r.status as WbStatus]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap">{r.description}</p>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="Categoria" value={r.category_label} />
            <Info label="Recebida em" value={formatWbDate(r.created_at)} />
            <Info label="Cidade / unidade" value={[r.city, r.unit].filter(Boolean).join(" • ")} />
            <Info label="Setor" value={r.department} />
            <Info label="Local" value={r.location_description} />
            <Info label="Data / horário" value={[r.incident_date, r.incident_time].filter(Boolean).join(" • ")} />
            <Info label="Envolvidos" value={r.people_involved} />
            <Info label="Testemunhas" value={r.witnesses} />
            <Info label="Frequência" value={r.frequency} />
          </div>
          {r.report_type === "IDENTIFIED" && (
            <>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-3">
                <Info label="Nome" value={r.identified_name} />
                <Info label="E-mail" value={r.identified_email} />
                <Info label="Telefone" value={r.identified_phone} />
              </div>
            </>
          )}
          {r.report_type === "ANONYMOUS" && (
            <p className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Lock className="h-4 w-4" /> Denúncia anônima: nenhum dado de identificação foi armazenado.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tratamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WB_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {WB_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WB_PRIORITY.map((p) => (
                    <SelectItem key={p} value={p}>
                      {WB_PRIORITY_LABEL[p as WbPriority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Atualização visível ao denunciante (opcional)</Label>
            <Textarea rows={3} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Conclusão interna</Label>
            <Textarea rows={4} value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar tratamento
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidências</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.attachments.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma evidência anexada.</p>}
          {data.attachments.map((a: any) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openAttachment(a.id)}
              className="flex w-full items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:border-primary/50"
            >
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate">{a.display_name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{formatWbDate(a.created_at)}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversa com o denunciante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.messages.length === 0 && <p className="text-sm text-muted-foreground">Sem mensagens.</p>}
            {data.messages.map((m: any) => (
              <div
                key={m.id}
                className={`rounded-lg border p-3 text-sm ${
                  m.sender_type === "RH" ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background/40"
                }`}
              >
                <p className="mb-1 text-xs text-muted-foreground">
                  {m.sender_type === "RH" ? data.names[m.sender_user_id] ?? "RH" : "Denunciante"} •{" "}
                  {formatWbDate(m.created_at)}
                </p>
                <p className="whitespace-pre-wrap">{m.message}</p>
              </div>
            ))}
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Responder ao denunciante…" />
            <Button onClick={sendMessage}>
              <Send className="mr-2 h-4 w-4" /> Enviar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas internas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.notes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma nota interna.</p>}
            {data.notes.map((n: any) => (
              <div key={n.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <p className="mb-1 text-xs text-muted-foreground">
                  {data.names[n.author_user_id] ?? "RH"} • {formatWbDate(n.created_at)}
                </p>
                <p className="whitespace-pre-wrap">{n.note}</p>
              </div>
            ))}
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Registrar nota interna…" />
            <Button variant="outline" onClick={sendNote}>
              <StickyNote className="mr-2 h-4 w-4" /> Adicionar nota
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico e auditoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.history.map((h: any) => (
            <p key={h.id}>
              <span className="text-xs text-muted-foreground">{formatWbDate(h.created_at)}</span> —{" "}
              {h.public_note ?? h.internal_note ?? h.event_type}
              {h.to_status ? ` (${WB_STATUS_LABEL[h.to_status as WbStatus]})` : ""}
            </p>
          ))}
          <Separator className="my-2" />
          {data.logs.map((l: any) => (
            <p key={l.id} className="text-xs text-muted-foreground">
              {formatWbDate(l.created_at)} — {data.names[l.user_id] ?? "Usuário"} — {l.action}
            </p>
          ))}
        </CardContent>
      </Card>
    </main>
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
