import { useMemo, useState } from "react";
import { Copy, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import {
  GOOGLE_REVIEW_TARGETS,
  googleReviewWhatsAppUrl,
  type GoogleReviewTarget,
} from "@/lib/google-reviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Versão interna do bloco de avaliação Google: permite ao técnico/enviar
 * o link de avaliação diretamente pelo WhatsApp do cliente, no mesmo
 * padrão usado na Contra-Prova.
 */
export function GoogleReviewLinksInternal({ className }: { className?: string }) {
  const [phone, setPhone] = useState("");

  async function copyLink(target: GoogleReviewTarget) {
    try {
      await navigator.clipboard.writeText(target.url);
      toast.success("Link de avaliação copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <Star className="h-4 w-4 fill-amber-300 text-amber-300" /> Avalie a Webifibra no Google
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Envie o link da unidade que atendeu o cliente pelo WhatsApp.
      </p>

      <div className="mt-3 space-y-2">
        <Label htmlFor="review-phone-panel">Telefone do cliente — DDD + número</Label>
        <Input
          id="review-phone-panel"
          inputMode="numeric"
          placeholder="42999999999"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^0-9()\-\s]/g, ""))}
        />
        <p className="text-xs text-slate-500">Informe sem 55. O sistema adiciona automaticamente.</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {GOOGLE_REVIEW_TARGETS.map((target) => (
          <ReviewCityCard
            key={target.city}
            target={target}
            phone={phone}
            onCopy={() => copyLink(target)}
          />
        ))}
      </div>
    </section>
  );
}

function ReviewCityCard({
  target,
  phone,
  onCopy,
}: {
  target: GoogleReviewTarget;
  phone: string;
  onCopy: () => void;
}) {
  const whatsappUrl = useMemo(
    () => googleReviewWhatsAppUrl(target, phone),
    [target, phone],
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3">
      <a
        href={target.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm font-semibold text-amber-100 transition hover:text-amber-50"
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-amber-300/15">
          <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
        </span>
        <span className="truncate">{target.city}</span>
      </a>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="bg-amber-400 text-slate-900 hover:bg-amber-300">
          <a
            href={whatsappUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (!whatsappUrl) {
                event.preventDefault();
                toast.error("Informe um telefone válido com DDD + número, sem 55.");
              }
            }}
          >
            <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy className="mr-1.5 h-4 w-4" /> Link
        </Button>
      </div>
    </div>
  );
}
