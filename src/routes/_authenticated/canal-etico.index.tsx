import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WB_CATEGORIES,
  WB_PRIORITY,
  WB_PRIORITY_LABEL,
  WB_STATUS,
  WB_STATUS_LABEL,
  formatWbDate,
  type WbPriority,
  type WbStatus,
} from "@/lib/whistleblower";
import {
  getWhistleblowerAccess,
  listWhistleblowerMembers,
  listWhistleblowerReports,
  setWhistleblowerMember,
} from "@/lib/whistleblower-admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/canal-etico/")({
  head: () => ({
    meta: [
      { title: "Canal Ético — Painel do RH | CheckTécnico" },
      { name: "description", content: "Gestão confidencial das denúncias recebidas pelo Canal Ético." },
      { property: "og:title", content: "Canal Ético — Painel do RH" },
      { property: "og:description", content: "Gestão confidencial das denúncias recebidas pelo Canal Ético." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CanalEticoIndex,
});

const ALL = "__all__";

function CanalEticoIndex() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const access = useQuery({ queryKey: ["wb-access"], queryFn: () => getWhistleblowerAccess() });
  const reports = useQuery({
    queryKey: ["wb-reports", filters],
    queryFn: () => listWhistleblowerReports({ data: filters }),
    enabled: access.data?.hasAccess === true,
  });

  const stats = useMemo(() => {
    const list = reports.data ?? [];
    const open = list.filter((r: any) => !["CONCLUIDA", "ARQUIVADA"].includes(r.status)).length;
    const critical = list.filter((r: any) => r.priority === "CRITICA").length;
    const times = list
      .filter((r: any) => r.first_analysis_at)
      .map((r: any): number => new Date(r.first_analysis_at).getTime() - new Date(r.created_at).getTime());
    const avgH = times.length ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length / 3_600_000) : null;
    return { total: list.length, open, critical, avgH };
  }, [reports.data]);

  if (access.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!access.data?.hasAccess) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Acesso restrito
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Este módulo é confidencial e liberado apenas para responsáveis autorizados pelo Canal Ético.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Canal Ético</h1>
            <p className="text-xs text-muted-foreground">Módulo confidencial — todos os acessos são registrados.</p>
          </div>
        </div>
        {access.data.canManage && <MembersDialog />}
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Denúncias" value={String(stats.total)} />
        <Stat label="Em aberto" value={String(stats.open)} />
        <Stat label="Críticas" value={String(stats.critical)} />
        <Stat label="1ª análise (média)" value={stats.avgH === null ? "—" : `${stats.avgH}h`} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={WB_STATUS.map((s) => ({ value: s, label: WB_STATUS_LABEL[s] }))}
          />
          <FilterSelect
            label="Categoria"
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
            options={WB_CATEGORIES.map((c) => ({ value: c.slug, label: c.label }))}
          />
          <FilterSelect
            label="Prioridade"
            value={filters.priority}
            onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
            options={WB_PRIORITY.map((p) => ({ value: p, label: WB_PRIORITY_LABEL[p] }))}
          />
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input value={filters.city ?? ""} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>De</Label>
            <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Até</Label>
            <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        {reports.isLoading && <p className="text-sm text-muted-foreground">Carregando denúncias…</p>}
        {reports.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma denúncia encontrada.</p>}
        {(reports.data ?? []).map((r: any) => (
          <Link
            key={r.id}
            to="/canal-etico/$id"
            params={{ id: r.id }}
            className="block rounded-xl border border-border/60 bg-card/60 p-4 transition hover:border-primary/50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">{r.protocol}</span>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{r.report_type === "ANONYMOUS" ? "Anônima" : "Identificada"}</Badge>
                {r.priority && <Badge variant="secondary">{WB_PRIORITY_LABEL[r.priority as WbPriority]}</Badge>}
                <Badge>{WB_STATUS_LABEL[r.status as WbStatus]}</Badge>
              </div>
            </div>
            <p className="mt-2 font-medium">{r.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.category_label} • {[r.city, r.unit].filter(Boolean).join(" • ") || "Sem localidade"} •{" "}
              {formatWbDate(r.created_at)}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MembersDialog() {
  const [open, setOpen] = useState(false);
  const members = useQuery({
    queryKey: ["wb-members"],
    queryFn: () => listWhistleblowerMembers(),
    enabled: open,
  });

  async function toggle(userId: string, grant: boolean) {
    try {
      await setWhistleblowerMember({ data: { userId, grant } });
      toast.success(grant ? "Acesso concedido." : "Acesso removido.");
      await members.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const granted = new Set((members.data?.members ?? []).map((m: any) => m.user_id));

  return (
    <div className="w-full sm:w-auto">
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        <Users className="mr-2 h-4 w-4" /> Responsáveis do canal
      </Button>
      {open && (
        <Card className="mt-3 w-full sm:w-96">
          <CardContent className="max-h-80 space-y-2 overflow-y-auto p-4">
            {(members.data?.users ?? []).map((u: any) => (
              <div key={u.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{u.full_name || u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Button size="sm" variant={granted.has(u.id) ? "secondary" : "outline"} onClick={() => toggle(u.id, !granted.has(u.id))}>
                  {granted.has(u.id) ? "Remover" : "Liberar"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
