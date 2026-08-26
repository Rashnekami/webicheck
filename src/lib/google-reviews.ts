import { normalizeCity } from "@/lib/profile-cities";

export type GoogleReviewTarget = {
  city: string;
  /** Link direto para escrever a avaliação da unidade no Google. */
  url: string;
};

/** Unidades da Webifibra com avaliação pública no Google. */
export const GOOGLE_REVIEW_TARGETS: GoogleReviewTarget[] = [
  {
    city: "Telêmaco Borba",
    url: "https://search.google.com/local/writereview?placeid=ChIJT53YyC2D6ZQRJQP4gupFNnk",
  },
  {
    city: "Imbaú",
    url: "https://search.google.com/local/writereview?placeid=ChIJP9Tm4rV26ZQRSaXRihQFuss",
  },
  {
    city: "Tibagi",
    url: "https://search.google.com/local/writereview?placeid=ChIJDVA1nj-_6ZQR8AH7jx-jZpk",
  },
];

/** Encontra a unidade correspondente à cidade do atendimento (sem acento/caixa). */
export function googleReviewTargetForCity(
  city: string | null | undefined,
): GoogleReviewTarget | null {
  const key = normalizeCity(city ?? "");
  if (!key) return null;
  return GOOGLE_REVIEW_TARGETS.find((t) => normalizeCity(t.city) === key) ?? null;
}

/** Mensagem padrão enviada ao cliente junto com o link de avaliação. */
export function googleReviewMessage(target: GoogleReviewTarget, clientName?: string | null) {
  const hello = clientName?.trim() ? `Olá, ${clientName.trim()}!` : "Olá!";
  return `${hello} Obrigado por escolher a Webifibra ${target.city}.\nSe o atendimento foi bom, avalie nosso serviço no Google (leva menos de 1 minuto):\n${target.url}`;
}

/** Monta o link wa.me com a mensagem de avaliação já preenchida. */
export function googleReviewWhatsAppUrl(
  target: GoogleReviewTarget,
  phone: string,
  clientName?: string | null,
) {
  const digits = phone.replace(/\D/g, "");
  if (!/^\d{10,11}$/.test(digits) || Number(digits.slice(0, 2)) < 11) return null;
  return `https://wa.me/55${digits}?text=${encodeURIComponent(googleReviewMessage(target, clientName))}`;
}
