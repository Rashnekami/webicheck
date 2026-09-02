import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PostitItemRow, PostitStatus } from "@/lib/postit.functions";

export const POSTIT_STATUS: Record<
  PostitStatus,
  { label: string; className: string; dot: string }
> = {
  pending_acceptance: {
    label: "Aguardando aceite",
    className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
    dot: "bg-cyan-400",
  },
  open: {
    label: "Aberto",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    dot: "bg-sky-400",
  },
  in_progress: {
    label: "Em andamento",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    dot: "bg-amber-400",
  },
  overdue: {
    label: "Fora do prazo",
    className: "border-orange-400/30 bg-orange-400/10 text-orange-200",
    dot: "bg-orange-400",
  },
  awaiting_validation: {
    label: "Aguardando validação",
    className: "border-violet-400/30 bg-violet-400/10 text-violet-200",
    dot: "bg-violet-400",
  },
  completed: {
    label: "Concluído",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  escalated: {
    label: "Escalado à gestão",
    className: "border-rose-400/40 bg-rose-400/10 text-rose-200",
    dot: "bg-rose-400",
  },
  cancelled: {
    label: "Cancelado",
    className: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    dot: "bg-slate-400",
  },
  rejected: {
    label: "Recusado",
    className: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-500",
  },
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
};

function dueLabel(date: string | null, status: PostitStatus) {
  if (!date) return status === "rejected" ? "Sem prazo — recusado" : "Aguardando o responsável";
  if (["completed", "cancelled"].includes(status)) return format(parseISO(date), "dd/MM/yyyy");
  const today = new Date();
  const due = parseISO(date);
  const days = differenceInCalendarDays(due, today);
  if (days < 0) return `${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"} em atraso`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return format(due, "dd 'de' MMM", { locale: ptBR });
}

export function PostitCard({
  item,
  departmentName,
  departmentColor,
  responsibleName,
  onClick,
}: {
  item: PostitItemRow;
  departmentName: string;
  departmentColor: string;
  responsibleName: string;
  onClick: () => void;
}) {
  const status = POSTIT_STATUS[item.status as PostitStatus] ?? POSTIT_STATUS.open;
  const urgent = ["overdue", "escalated"].includes(item.status);
  const paperBackground = `linear-gradient(145deg, color-mix(in srgb, ${departmentColor} 34%, #fffbe6) 0%, color-mix(in srgb, ${departmentColor} 58%, #fff3a6) 58%, color-mix(in srgb, ${departmentColor} 72%, #f8d45c) 100%)`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
    >
      <Card
        className={
          "group relative h-full min-h-72 overflow-hidden rounded-[1.4rem] border-white/60 text-slate-800 shadow-[0_18px_42px_rgba(15,23,42,.28)] transition-all duration-300 hover:-translate-y-1.5 hover:rotate-[.35deg] hover:shadow-[0_26px_54px_rgba(15,23,42,.38)] " +
          (urgent ? "ring-2 ring-rose-500/50" : "")
        }
        style={{ background: paperBackground }}
      >
        <span className="absolute right-0 bottom-0 h-20 w-20 rounded-tl-[3rem] border-l border-t border-white/60 bg-gradient-to-br from-white/70 via-white/20 to-black/15 shadow-[-10px_-10px_25px_rgba(255,255,255,.25)]" />
        <CardContent className="relative z-10 flex h-full min-h-72 flex-col p-5 pb-6 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[.18em] text-slate-700/55">
                {departmentName} · {item.code}
              </p>
              <h3 className="mt-3 line-clamp-3 text-2xl font-black italic leading-[1.08] tracking-tight text-slate-800">
                {item.title}
              </h3>
              <span
                className="mt-2 block h-1 w-24 rounded-full opacity-70"
                style={{ backgroundColor: departmentColor }}
              />
            </div>
            {urgent ? (
              <span className="rounded-full bg-white/60 p-2 shadow-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              </span>
            ) : item.status === "completed" ? (
              <span className="rounded-full bg-white/60 p-2 shadow-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              </span>
            ) : (
              <span className="rounded-full bg-white/60 p-2 shadow-sm">
                <Clock3 className="h-5 w-5 shrink-0 text-slate-700" />
              </span>
            )}
          </div>

          <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-700/75">
            {item.description}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-white/60 bg-white/45 font-semibold text-slate-700 shadow-sm"
            >
              <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/60 bg-white/45 font-semibold text-slate-700 shadow-sm"
            >
              Prioridade {PRIORITY_LABELS[item.priority]}
            </Badge>
          </div>

          <div className="mt-auto grid gap-2 border-t border-slate-700/10 pt-4 text-xs text-slate-700/75">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/60 shadow-sm">
                <UserRound className="h-3.5 w-3.5 text-slate-700" />
              </span>
              <span className="truncate font-semibold">{responsibleName}</span>
            </span>
            <span
              className={"flex items-center gap-2 font-medium " + (urgent ? "text-rose-700" : "")}
            >
              <CalendarDays className="ml-1.5 h-3.5 w-3.5" />
              {dueLabel(item.current_due_date, item.status)}
              {item.extension_count > 0 ? (
                <span className="mr-12 ml-auto text-[10px] text-slate-700/60">
                  prazo {Number(item.extension_count) + 1}/3
                </span>
              ) : null}
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
