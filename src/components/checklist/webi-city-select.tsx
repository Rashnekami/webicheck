import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const WEBI_CHECKLIST_CITIES = [
  "Telêmaco Borba",
  "Tibagi",
  "Imbaú",
  "Ponta Grossa",
  "Castro",
  "Carambeí",
] as const;

type Props = {
  value?: string | null;
  disabled?: boolean;
  onChange: (city: string) => void;
  dark?: boolean;
};

export function WebiCitySelect({ value, disabled, onChange, dark }: Props) {
  const current = value?.trim() || "";
  const isLegacy =
    current.length > 0 &&
    !WEBI_CHECKLIST_CITIES.includes(current as (typeof WEBI_CHECKLIST_CITIES)[number]);

  return (
    <Select value={current || undefined} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          dark &&
            "border-cyan-500/40 bg-[#06152d] text-slate-100 shadow-[0_0_18px_rgba(0,153,255,0.08)] focus:ring-cyan-400",
        )}
      >
        <SelectValue placeholder="Selecione a cidade" />
      </SelectTrigger>
      <SelectContent>
        {isLegacy ? (
          <SelectItem value={current}>
            {current} (registro legado)
          </SelectItem>
        ) : null}
        {WEBI_CHECKLIST_CITIES.map((city) => (
          <SelectItem key={city} value={city}>
            {city}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
