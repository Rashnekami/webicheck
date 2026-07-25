import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/abrir-whatsapp")({ component: AbrirWhatsAppPage });

function AbrirWhatsAppPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const target = params.get("target") || "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <MessageCircle className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="text-xl font-semibold">Abrir conversa no WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Clique abaixo para abrir a conversa com a mensagem da Contra-Prova já preenchida.</p>
        {target ? <Button asChild className="bg-emerald-600 hover:bg-emerald-700"><a href={target}>Abrir WhatsApp</a></Button> : <p className="text-sm text-destructive">Link do WhatsApp inválido.</p>}
        <p><Link to="/" className="text-xs text-muted-foreground underline">Voltar ao WebiCheck</Link></p>
      </div>
    </main>
  );
}
