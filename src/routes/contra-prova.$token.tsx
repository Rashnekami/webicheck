import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { getPublicCounterproof, completePublicCounterproof } from "@/lib/customer-counterproof.functions";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { WebifibraLogo } from "@/components/webifibra-logo";

export const Route = createFileRoute("/contra-prova/$token")({
  component: CounterproofPage,
  head: () => ({ meta: [{ title: "Contra-Prova do Cliente — Webifibra" }, { name: "robots", content: "noindex,nofollow" }] }),
});

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CounterproofPage() {
  const { token } = Route.useParams();
  const [confirmed, setConfirmed] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = useQuery({
    queryKey: ["public-counterproof", token],
    queryFn: () => getPublicCounterproof({ data: { token } }),
  });
  const finish = useMutation({
    mutationFn: () => completePublicCounterproof({ data: { token, confirmed, identityImage: identity || "", signature: signature || "" } }),
    onSuccess: () => query.refetch(),
  });

  if (query.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  const cp = query.data;
  if (!cp) return <div className="p-8 text-center">Link inválido ou indisponível.</div>;
  if (cp.status === "validated") {
    return <div className="flex min-h-screen items-center justify-center p-4"><div className="max-w-md rounded-xl border bg-white p-6 text-center shadow"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-3 text-xl font-bold">Contra-Prova validada</h1><p className="mt-2 text-sm text-muted-foreground">Código: <b>{cp.code}</b><br />Checklist: <b>{cp.checklist_code}</b><br />{cp.validated_at && new Date(cp.validated_at).toLocaleString("pt-BR")}</p></div></div>;
  }
  if (cp.status === "annulled") return <div className="p-8 text-center">Esta Contra-Prova foi anulada. Solicite um novo link à equipe.</div>;

  return <main className="min-h-screen bg-slate-50 pb-10">
    <header className="brand-gradient flex items-center gap-3 p-4 text-white"><WebifibraLogo size={40} /><div><p className="text-xs opacity-80">Confirmação do atendimento</p><h1 className="font-semibold">Contra-Prova do Cliente</h1></div></header>
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <section className="rounded-xl border bg-white p-4"><div className="flex gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div><p className="font-semibold">Atendimento técnico registrado</p><p className="text-sm text-muted-foreground">Cliente: {cp.client_name || "—"}<br />OS: {cp.service_order || "—"}<br />Checklist: {cp.checklist_code}<br />Código: {cp.code}</p></div></div></section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Orientações do atendimento</h2><p className="mt-1 text-sm text-muted-foreground">Leia o que foi explicado pelo técnico:</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm"><li>Diferenças entre Wi‑Fi 2.4 GHz e 5 GHz.</li><li>Limitações do celular, computador, TV ou outro equipamento utilizado.</li><li>Quando utilizar cabo de rede em TV, videogame ou computador.</li><li>Influência de distância, paredes e interferências no sinal Wi‑Fi.</li><li>Como esclarecer dúvidas e acompanhar instabilidades.</li></ul></section>
      <section className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex items-start gap-2"><Checkbox id="confirm" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="confirm" className="leading-5">Confirmo que recebi e compreendi as orientações acima e tive oportunidade de esclarecer minhas dúvidas.</Label></div>
        <div><Label>Foto segurando RG ou CNH</Label><input ref={input} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setIdentity(await fileDataUrl(file)); }} /><Button className="mt-2" variant="outline" onClick={() => input.current?.click()}>{identity ? "Foto registrada" : "Tirar foto"}</Button><p className="mt-1 text-xs text-muted-foreground">A foto é privada e usada somente como evidência do atendimento.</p></div>
        <div><Label>Assinatura</Label><SignaturePad value={signature} onChange={setSignature} height={150} /></div>
        <Button className="w-full" disabled={!confirmed || !identity || !signature || finish.isPending} onClick={() => finish.mutate()}>{finish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finalizar Contra-Prova</Button>
        {finish.error && <p className="text-sm text-destructive">{finish.error.message}</p>}
      </section>
    </div>
  </main>;
}
