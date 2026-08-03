import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert, Loader2, LogIn, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { listAccessLogs, listLoginAttempts } from "@/lib/security-logs.functions";

export const Route = createFileRoute("/_authenticated/seguranca")({
  head: () => ({
    meta: [{ title: "Segurança — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: SecurityPage,
});

function geoLabel(row: { geo_city?: string | null; geo_region?: string | null; geo_country?: string | null }) {
  const parts = [row.geo_city, row.geo_region, row.geo_country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Localização desconhecida";
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR");
}

function SecurityPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canView = user?.isPlatformAdmin || user?.isAdmin;

  const attemptsQ = useQuery({
    queryKey: ["security-login-attempts"],
    queryFn: () => listLoginAttempts(),
    enabled: !!canView,
    refetchInterval: 30_000,
  });

  const accessQ = useQuery({
    queryKey: ["security-access-logs"],
    queryFn: () => listAccessLogs(),
    enabled: !!canView,
    refetchInterval: 30_000,
  });

  if (userLoading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  if (!canView) return <div className="p-8 text-center text-sm">Acesso restrito.</div>;

  const attempts = attemptsQ.data ?? [];
  const accesses = accessQ.data ?? [];
  const failedRecent = attempts.filter((a) => !a.success).length;

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
            <ShieldAlert className="h-5 w-5" />
          </span>
          Segurança
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Tentativas de login e acessos recentes, com IP e localização aproximada.
          {user?.isPlatformAdmin ? " Visão de toda a plataforma." : " Visão do seu provedor."}
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <LogIn className="h-4 w-4 text-slate-400" />
          <h2 className="text-lg font-semibold">Tentativas de login (últimas 200)</h2>
          {failedRecent > 0 && (
            <Badge variant="destructive" className="ml-1">
              {failedRecent} falhas
            </Badge>
          )}
        </div>
        <div className="webi-nav-card overflow-x-auto rounded-lg">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="p-2">Quando</th>
                <th className="p-2">Login</th>
                <th className="p-2">Resultado</th>
                <th className="p-2">IP</th>
                <th className="p-2">Local</th>
              </tr>
            </thead>
            <tbody>
              {attemptsQ.isLoading && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400">
                    Carregando…
                  </td>
                </tr>
              )}
              {!attemptsQ.isLoading && attempts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400">
                    Nenhuma tentativa registrada.
                  </td>
                </tr>
              )}
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="p-2 tabular-nums">{fmt(a.created_at)}</td>
                  <td className="p-2">{a.login}</td>
                  <td className="p-2">
                    {a.success ? (
                      <Badge className="bg-emerald-600/80">sucesso</Badge>
                    ) : (
                      <Badge variant="destructive">{a.reason ?? "falha"}</Badge>
                    )}
                  </td>
                  <td className="p-2 tabular-nums">{a.ip ?? "—"}</td>
                  <td className="p-2">{geoLabel(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-400" />
          <h2 className="text-lg font-semibold">Acessos recentes (amostra)</h2>
        </div>
        <div className="webi-nav-card overflow-x-auto rounded-lg">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="p-2">Quando</th>
                <th className="p-2">Rota</th>
                <th className="p-2">IP</th>
                <th className="p-2">Local</th>
              </tr>
            </thead>
            <tbody>
              {accessQ.isLoading && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-400">
                    Carregando…
                  </td>
                </tr>
              )}
              {!accessQ.isLoading && accesses.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-400">
                    Nenhum acesso amostrado ainda.
                  </td>
                </tr>
              )}
              {accesses.map((a) => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="p-2 tabular-nums">{fmt(a.created_at)}</td>
                  <td className="max-w-[280px] truncate p-2" title={a.route}>
                    {a.route}
                  </td>
                  <td className="p-2 tabular-nums">{a.ip ?? "—"}</td>
                  <td className="p-2">{geoLabel(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
