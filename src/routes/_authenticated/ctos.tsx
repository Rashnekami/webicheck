import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPinned, Loader2, Upload, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks/use-current-user";
import { parseCtoWorkbook, exportCtoReportXlsx, type CtoExportRow } from "@/lib/cto-import";
import { matchCtoRemapStatus } from "@/lib/cto-remap.functions";

export const Route = createFileRoute("/_authenticated/ctos")({
  head: () => ({
    meta: [{ title: "CTOs por cidade — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: CtosPage,
});

function CtosPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canView = user?.isAdmin || user?.isPlatformAdmin || user?.isSupervisor;

  const [rows, setRows] = useState<CtoExportRow[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);

  const processMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const parsed = (
        await Promise.all(
          files.map((f) => parseCtoWorkbook(f, f.name.replace(/\.xlsx?$/i, ""))),
        )
      ).flat();
      if (parsed.length === 0) throw new Error("Nenhuma CTO encontrada nas planilhas.");

      const nomes = parsed.map((r) => r.nome);
      const statusMap = await matchCtoRemapStatus({ data: { nomes } });

      const result: CtoExportRow[] = parsed.map((r) => {
        const s = statusMap[r.nome];
        return {
          ...r,
          remapeado: s?.remapeado ?? false,
          checklistCode: s?.checklistCode ?? null,
          finalizadoEm: s?.finalizadoEm ?? null,
          novaLat: s?.novaLat ?? null,
          novaLng: s?.novaLng ?? null,
        };
      });
      return result;
    },
    onSuccess: (data) => setRows(data),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao processar planilhas."),
  });

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setFileNames(files.map((f) => f.name));
    processMutation.mutate(files);
  }

  if (userLoading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!canView) return <div className="p-8 text-center text-sm">Acesso restrito.</div>;

  const byCidade = new Map<string, { total: number; remapeadas: number }>();
  for (const r of rows) {
    const c = byCidade.get(r.cidade) ?? { total: 0, remapeadas: 0 };
    c.total += 1;
    if (r.remapeado) c.remapeadas += 1;
    byCidade.set(r.cidade, c);
  }
  const chartData = Array.from(byCidade.entries()).map(([cidade, v]) => ({
    cidade,
    total: v.total,
    remapeadas: v.remapeadas,
    pendentes: v.total - v.remapeadas,
  }));

  const totalGeral = rows.length;
  const totalRemapeadas = rows.filter((r) => r.remapeado).length;

  return (
    <div className="webi-page mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header p-5 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <span className="webi-icon h-11 w-11">
            <MapPinned className="h-5 w-5" />
          </span>
          CTOs por cidade
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Importe as planilhas de CTOs exportadas do projeto de rede e cruze com o que já foi
          remapeado no sistema.
        </p>
      </div>

      <Card className="webi-nav-card">
        <CardContent className="space-y-3 p-4">
          <Label htmlFor="cto-files">Planilhas de CTOs (.xlsx, uma ou mais)</Label>
          <Input
            id="cto-files"
            type="file"
            accept=".xlsx"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={processMutation.isPending}
          />
          {fileNames.length > 0 && (
            <p className="text-xs text-slate-400">Arquivos: {fileNames.join(", ")}</p>
          )}
          {processMutation.isPending && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cruzando com os checklists finalizados…
            </p>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total de CTOs" value={totalGeral} />
            <StatCard label="Já remapeadas" value={totalRemapeadas} />
            <StatCard
              label="Pendentes"
              value={totalGeral - totalRemapeadas}
            />
          </section>

          <section className="webi-nav-card space-y-2 p-4">
            <h2 className="text-lg font-semibold">CTOs por cidade — remapeadas x pendentes</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="cidade" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend />
                  <Bar dataKey="remapeadas" name="Remapeadas" stackId="a" fill="#22c55e" />
                  <Bar dataKey="pendentes" name="Pendentes" stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="flex justify-end">
            <Button
              onClick={() =>
                exportCtoReportXlsx(rows, `ctos-remapeamento-${new Date().toISOString().slice(0, 10)}.xlsx`)
              }
            >
              <Download className="mr-1.5 h-4 w-4" /> Exportar planilha (verde/vermelho)
            </Button>
          </div>

          <section className="webi-nav-card overflow-x-auto rounded-lg">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="p-2">Cidade</th>
                  <th className="p-2">CTO</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Checklist</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.nome}-${i}`} className="border-t border-white/5">
                    <td className="p-2">{r.cidade}</td>
                    <td className="p-2">{r.nome}</td>
                    <td className="p-2">
                      {r.remapeado ? (
                        <span className="text-emerald-400">Remapeada</span>
                      ) : (
                        <span className="text-rose-400">Pendente</span>
                      )}
                    </td>
                    <td className="p-2">{r.checklistCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="webi-nav-card">
      <CardContent className="p-4">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
