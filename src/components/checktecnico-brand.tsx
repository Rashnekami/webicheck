import { cn } from "@/lib/utils";

/**
 * Marca CheckTecnico em SVG inline (escudo + check + ondas de sinal).
 *
 * Vetor em vez de imagem: a tela de login é a primeira coisa que carrega,
 * muitas vezes em 4G ruim no campo — um SVG de ~1KB no bundle aparece
 * junto com a página, sem request extra e sem borrar em tela retina.
 */
export function CheckTecnicoMark({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ct-shield" x1="6" y1="4" x2="44" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f6bff" />
          <stop offset="0.55" stopColor="#12b6f3" />
          <stop offset="1" stopColor="#20e08a" />
        </linearGradient>
        <linearGradient id="ct-check" x1="15" y1="30" x2="37" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#19c9ff" />
          <stop offset="1" stopColor="#25e58e" />
        </linearGradient>
      </defs>
      <path
        d="M26 4.5 8.5 11.2v13.4c0 10.6 7.2 17.9 17.5 20.9 10.3-3 17.5-10.3 17.5-20.9V11.2L26 4.5Z"
        stroke="url(#ct-shield)"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path
        d="m17.5 25.8 6.4 6.4 12-13.2"
        stroke="url(#ct-check)"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M36.5 10.6a6.6 6.6 0 0 1 7.4-1.5"
        stroke="#25e58e"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M38.4 6.2a10.8 10.8 0 0 1 9.4-1.4"
        stroke="#19c9ff"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

/** Logotipo horizontal: "Check" claro + "Tecnico" verde, como na arte. */
export function CheckTecnicoWordmark({
  markSize = 44,
  className,
  textClassName,
}: {
  markSize?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <CheckTecnicoMark size={markSize} />
      <span className={cn("font-bold tracking-tight text-white", textClassName)}>
        Check<span className="text-emerald-400">Tecnico</span>
      </span>
    </div>
  );
}
