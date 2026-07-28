import { useEffect, useRef } from "react";

type Header = {
  data_atendimento?: string | null;
  hora_atendimento?: string | null;
  endereco?: string | null;
};

/**
 * Auto-preenche, apenas uma vez por checklist e somente quando o campo estiver
 * vazio: data (hoje), hora (agora) e endereço (coordenadas via geolocation).
 * Nunca sobrescreve valores já digitados pelo técnico.
 */
export function useChecklistAutoFill(opts: {
  header: Header;
  readOnly?: boolean;
  onHeaderChange: (patch: Partial<Header>) => void;
}) {
  const { header, readOnly, onHeaderChange } = opts;
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || readOnly) return;
    ran.current = true;

    const patch: Partial<Header> = {};
    const now = new Date();

    if (!header.data_atendimento) {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      patch.data_atendimento = `${y}-${m}-${d}`;
    }
    if (!header.hora_atendimento) {
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      patch.hora_atendimento = `${hh}:${mm}`;
    }
    if (Object.keys(patch).length) onHeaderChange(patch);

    // Geolocation — opcional, sem bloquear se o usuário negar.
    if (
      typeof navigator !== "undefined" &&
      navigator.geolocation &&
      (!header.endereco || header.endereco.trim() === "")
    ) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          const acc = Math.round(pos.coords.accuracy ?? 0);
          const line = `Localização: ${lat}, ${lng} (±${acc}m) — https://maps.google.com/?q=${lat},${lng}`;
          onHeaderChange({ endereco: line });
        },
        () => {
          /* usuário negou ou indisponível — ignorar silenciosamente */
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
