import { Star } from "lucide-react";
import { GOOGLE_REVIEW_TARGETS } from "@/lib/google-reviews";
import { cn } from "@/lib/utils";

/**
 * Atalhos públicos para a avaliação da Webifibra no Google, por unidade.
 * Ficam na tela de login e no painel para o cliente/técnico chegar em 1 toque.
 */
export function GoogleReviewLinks({ className }: { className?: string }) {
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
        Escolha a unidade que atendeu você e deixe sua avaliação.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {GOOGLE_REVIEW_TARGETS.map((target) => (
          <a
            key={target.city}
            href={target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-amber-300/15">
              <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
            </span>
            <span className="truncate">{target.city}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
