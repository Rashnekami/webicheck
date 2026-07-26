import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Eye, ExternalLink, Loader2, MessageCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCustomerCounterproof,
  confirmCounterproofEvidenceReview,
  getChecklistCounterproof,
  getCounterproofEvidenceUrl,
  registerCounterproofPhone,
  type CounterproofSummary,
} from "@/lib/customer-counterproof.functions";

function isCounterproofSummary(value: unknown): value is CounterproofSummary {
  return !!value && typeof value === "object" && !("unavailable" in value);
}

function makeWhatsAppUrl(phone: string, link: string, code?: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") || !/^\d{10,11}$/.test(digits) || Number(digits.slice(0, 2)) < 11 || !link || !code) return null;
  const message = `Olá! Para confirmar as orientações do atendimento técnico, acesse:\n${link}\nCódigo: ${code}`;
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

export function CustomerCounterproofCard({
  checklistId,
  isAdmin,
}: {
  checklistId: string;
  isAdmin: boolean;
}) {
  const qc = useQueryClient(); const [phone, setPhone] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const q = useQuery({
    queryKey: ["customer-counterproof", checklistId],
    queryFn: () => getChecklistCounterproof({ data: { checklistId } }),
    // A consulta depende da tabela adicionada pela migration. Nunca execute no
    // render do servidor, para um ambiente de homologação sem migration não
    // impedir a abertura de nenhum checklist existente.
    enabled: typeof window !== "undefined",
    refetchInterval: (query) => query.state.data && "status" in query.state.data && ["pending", "opened"].includes(query.state.data.status) ? 10000 : false,
  });
  const create = useMutation({ mutationFn: () => createCustomerCounterproof({ data: { checklistId } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-counterproof", checklistId] }); toast.success("Contra-Prova gerada."); }, onError: (e: Error) => toast.error(e.message) });
  const cp = q.data;
  const isUnavailable = !!cp && "unavailable" in cp;
  const counterproof = isCounterproofSummary(cp) ? cp : null;
  const link = useMemo(() => counterproof?.public_token && typeof window !== "undefined" ? `${window.location.origin}/contra-prova/${counterproof.public_token}` : "", [counterproof?.public_token]);
  const whatsappUrl = useMemo(() => makeWhatsAppUrl(phone, link, counterproof?.code), [phone, link, counterproof?.code]);
  const savePhone = useMutation({ mutationFn: async () => { if (!counterproof) throw new Error("Gere a Contra-Prova primeiro."); return registerCounterproofPhone({ data: { counterproofId: counterproof.id, phone, whatsappOpened: true } }); }, onError: (e: Error) => toast.error(e.message) });
  const evidence = useMutation({
    mutationFn: async () => {
      if (!counterproof) throw new Error("Contra-Prova não encontrada.");
      return getCounterproofEvidenceUrl({ data: { counterproofId: counterproof.id } });
    },
    onSuccess: () => setEvidenceOpen(true),
    onError: (e: Error) => toast.error(e.message),
  });
  const reviewEvidence = useMutation({
    mutationFn: async () => {
      if (!counterproof) throw new Error("Contra-Prova não encontrada.");
      return confirmCounterproofEvidenceReview({ data: { counterproofId: counterproof.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-counterproof", checklistId] });
      setEvidenceOpen(false);
      toast.success("Conferência da evidência registrada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isUnavailable) {
    return <Card className="border-amber-300 bg-amber-50/40"><CardContent className="space-y-1 p-4"><h3 className="text-base font-semibold">Contra-Prova do Cliente</h3><p className="text-sm text-amber-800">Em preparação no ambiente de teste.</p><p className="text-xs text-muted-foreground">A migration da Contra-Prova ainda não foi aplicada. O checklist continua normal e nenhuma informação será criada até a homologação do banco.</p></CardContent></Card>;
  }
  async function copy() { try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar o link."); } }
  return <><Card className={cp?.status === "validated" ? "border-emerald-300 bg-emerald-50/40" : ""}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Contra-Prova do Cliente</h3><p className="text-xs text-muted-foreground">Confirmação digital vinculada definitivamente ao checklist.</p></div>{cp?.status === "validated" ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Validada</span> : cp?.status === "annulled" ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700"><ShieldAlert className="h-4 w-4" /> Anulada</span> : null}</div>
    {!cp || cp.status === "annulled" ? <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Gerar Contra-Prova</Button> : <><div className="rounded-md bg-muted/50 p-3 text-sm"><p><b>Código:</b> {cp.code}</p><p><b>Checklist:</b> {cp.checklist_code}</p>{cp.status === "validated" ? <><p className="mt-1 font-medium text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" />Contra-Prova validada pelo cliente<br /><span className="font-normal">{cp.validated_at && new Date(cp.validated_at).toLocaleString("pt-BR")}</span></p>{cp.admin_identity_reviewed_at ? <p className="mt-1 text-xs font-medium text-blue-700"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Evidência conferida pelo administrador em {new Date(cp.admin_identity_reviewed_at).toLocaleString("pt-BR")}</p> : null}</> : <p className="mt-1 text-amber-700">Aguardando validação do cliente.</p>}</div>
      {cp.status !== "validated" && <div className="space-y-2 border-t pt-3"><Label htmlFor="customer-phone">Telefone do cliente — DDD + número</Label><Input id="customer-phone" inputMode="numeric" placeholder="42999999999" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9()\-\s]/g, ""))} /><p className="text-xs text-muted-foreground">Informe sem 55. O sistema adiciona automaticamente.</p><div className="flex flex-wrap gap-2"><Button asChild size="sm"><a href={whatsappUrl || undefined} target="_blank" rel="noopener noreferrer" onClick={(event) => { if (!whatsappUrl) { event.preventDefault(); toast.error("Informe um telefone válido com DDD + número, sem 55."); return; } savePhone.mutate(); }}><MessageCircle className="mr-1.5 h-4 w-4" />Enviar pelo WhatsApp</a></Button><Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1.5 h-4 w-4" />Copiar link</Button><Button size="sm" variant="ghost" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-1.5 h-4 w-4" />Abrir</Button></div></div>}
      {isAdmin && cp.status === "validated" && cp.identity_registered && <div className="border-t pt-3"><Button size="sm" variant="outline" onClick={() => evidence.mutate()} disabled={evidence.isPending}>{evidence.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}Visualizar evidência de identificação</Button><p className="mt-1 text-xs text-muted-foreground">Acesso restrito a administradores e registrado na rastreabilidade.</p></div>}</>}</CardContent></Card>
    <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Evidência privada de identificação</DialogTitle>
          <DialogDescription>Foto registrada pelo cliente segurando RG ou CNH. O acesso expira em 5 minutos.</DialogDescription>
        </DialogHeader>
        {evidence.data?.url ? <img src={evidence.data.url} alt="Evidência privada de identificação do cliente" className="max-h-[70vh] w-full rounded-lg border object-contain" /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEvidenceOpen(false)}>Fechar</Button>
          <Button onClick={() => reviewEvidence.mutate()} disabled={reviewEvidence.isPending || !!counterproof?.admin_identity_reviewed_at}>{reviewEvidence.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{counterproof?.admin_identity_reviewed_at ? "Conferência já registrada" : "Confirmar conferência"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
