import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomerCounterproof, getChecklistCounterproof, registerCounterproofPhone, type CounterproofSummary } from "@/lib/customer-counterproof.functions";

function isCounterproofSummary(value: unknown): value is CounterproofSummary {
  return !!value && typeof value === "object" && !("unavailable" in value);
}

export function CustomerCounterproofCard({ checklistId }: { checklistId: string }) {
  const qc = useQueryClient(); const [phone, setPhone] = useState("");
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
  function buildWhatsappPayload() {
    if (!counterproof) { toast.error("Gere a Contra-Prova primeiro."); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("55")) { toast.error("Informe somente DDD + número, sem 55."); return; }
    if (!/^\d{10,11}$/.test(digits) || Number(digits.slice(0, 2)) < 11) { toast.error("Informe um telefone válido com DDD + número."); return; }
    const message = `Olá! Para confirmar as orientações do atendimento técnico, acesse:\n${link}\nCódigo: ${counterproof.code}`;
    return { digits, message, waMeUrl: `https://wa.me/55${digits}?text=${encodeURIComponent(message)}` };
  }
  function openWhatsapp() {
    const payload = buildWhatsappPayload();
    if (!payload || !counterproof) return;
    const appUrl = `whatsapp://send?phone=55${payload.digits}&text=${encodeURIComponent(payload.message)}`;
    window.location.href = appUrl;
    registerCounterproofPhone({ data: { counterproofId: counterproof.id, phone: digits, whatsappOpened: true } })
      .then(() => qc.invalidateQueries({ queryKey: ["customer-counterproof", checklistId] }))
      .catch((e: Error) => toast.error(e.message));
    toast.success("Abrindo o app do WhatsApp.");
  }
  async function copyWhatsappLink() {
    const payload = buildWhatsappPayload();
    if (!payload) return;
    try { await navigator.clipboard.writeText(payload.waMeUrl); toast.success("Link wa.me copiado."); } catch { toast.error("Não foi possível copiar o link wa.me."); }
  }
  if (isUnavailable) {
    return <Card className="border-amber-300 bg-amber-50/40"><CardContent className="space-y-1 p-4"><h3 className="text-base font-semibold">Contra-Prova do Cliente</h3><p className="text-sm text-amber-800">Em preparação no ambiente de teste.</p><p className="text-xs text-muted-foreground">A migration da Contra-Prova ainda não foi aplicada. O checklist continua normal e nenhuma informação será criada até a homologação do banco.</p></CardContent></Card>;
  }
  async function copy() { try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar o link."); } }
  return <Card className={cp?.status === "validated" ? "border-emerald-300 bg-emerald-50/40" : ""}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Contra-Prova do Cliente</h3><p className="text-xs text-muted-foreground">Confirmação digital vinculada definitivamente ao checklist.</p></div>{cp?.status === "validated" ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Validada</span> : cp?.status === "annulled" ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700"><ShieldAlert className="h-4 w-4" /> Anulada</span> : null}</div>
    {!cp || cp.status === "annulled" ? <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Gerar Contra-Prova</Button> : <><div className="rounded-md bg-muted/50 p-3 text-sm"><p><b>Código:</b> {cp.code}</p><p><b>Checklist:</b> {cp.checklist_code}</p>{cp.status === "validated" ? <p className="mt-1 font-medium text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" />Contra-Prova validada pelo cliente<br /><span className="font-normal">{cp.validated_at && new Date(cp.validated_at).toLocaleString("pt-BR")}</span></p> : <p className="mt-1 text-amber-700">Aguardando validação do cliente.</p>}</div>
      {cp.status !== "validated" && <div className="space-y-2 border-t pt-3"><Label htmlFor="customer-phone">Telefone do cliente — DDD + número</Label><Input id="customer-phone" inputMode="numeric" placeholder="42999999999" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9()\-\s]/g, ""))} /><p className="text-xs text-muted-foreground">Informe sem 55. O sistema adiciona automaticamente.</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={openWhatsapp} disabled={!phone}><MessageCircle className="mr-1.5 h-4 w-4" />Enviar pelo WhatsApp</Button><Button size="sm" variant="outline" onClick={copyWhatsappLink} disabled={!phone}><Copy className="mr-1.5 h-4 w-4" />Copiar wa.me</Button><Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1.5 h-4 w-4" />Copiar link</Button><Button size="sm" variant="ghost" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-1.5 h-4 w-4" />Abrir</Button></div></div>}</>}</CardContent></Card>;
}
