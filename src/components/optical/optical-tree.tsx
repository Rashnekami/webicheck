import { useState } from "react";
import { ChevronDown, ChevronRight, Cable, Split, Router } from "lucide-react";
import type { OpticalCeoFullData, OpticalSplitterFull, OpticalOutputFull } from "@/lib/optical-map-data";
import { OUTPUT_STATE_LABEL } from "@/lib/optical-map";

// Item 20: diagrama em árvore expansível — CEO -> splitter -> saídas -> CTO.
export function OpticalTree({ data }: { data: OpticalCeoFullData }) {
  return (
    <div className="space-y-1 rounded-lg border border-white/10 bg-slate-950/40 p-3 font-mono text-xs">
      <TreeRow icon={<Router className="h-3.5 w-3.5 text-cyan-400" />} label={data.ceo.codigo} bold depth={0} />
      {data.splitters.length === 0 && (
        <p className="pl-6 text-muted-foreground">Nenhum splitter cadastrado ainda.</p>
      )}
      {data.splitters.map((s) => (
        <SplitterNode key={s.id} splitter={s} cables={data.cables} />
      ))}
    </div>
  );
}

function TreeRow({
  icon,
  label,
  sub,
  bold,
  depth,
  collapsible,
  open,
  onToggle,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  bold?: boolean;
  depth: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={"flex items-center gap-1.5 py-0.5" + (collapsible ? " cursor-pointer" : "")}
      style={{ paddingLeft: depth * 16 }}
      onClick={onToggle}
    >
      {collapsible ? (
        open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
      ) : depth > 0 ? (
        <span className="w-3 text-muted-foreground">└</span>
      ) : null}
      {icon}
      <span className={bold ? "font-bold text-white" : "text-slate-200"}>{label}</span>
      {sub && <span className="text-muted-foreground">— {sub}</span>}
    </div>
  );
}

function SplitterNode({ splitter, cables }: { splitter: OpticalSplitterFull; cables: any[] }) {
  const [open, setOpen] = useState(true);
  const feedCable = cables.find((c) => c.id === splitter.fibra_alimentadora_id) ?? null;
  return (
    <div>
      <TreeRow
        icon={<Split className="h-3.5 w-3.5 text-cyan-400" />}
        label={`${splitter.codigo} — ${splitter.tipo}`}
        sub={splitter.fibra_alimentadora_id ? undefined : "sem fibra alimentadora ⚠"}
        depth={1}
        collapsible
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {open &&
        splitter.outputs.map((o) => <OutputNode key={o.id} output={o} />)}
    </div>
  );
}

function OutputNode({ output }: { output: OpticalOutputFull }) {
  const label = `Saída ${output.porta_numero} ${output.cor}`;
  const dest = output.optical_ctos?.codigo
    ? `CTO ${output.optical_ctos.codigo}`
    : OUTPUT_STATE_LABEL[output.estado] ?? output.estado;
  return (
    <TreeRow
      icon={<Cable className="h-3 w-3 text-muted-foreground" />}
      label={label}
      sub={dest}
      depth={2}
    />
  );
}
