import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileArchive, Loader2, PackageSearch, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getCaseDossieBundle } from "@/lib/warehouse-dossie.functions";
import { downloadCaseDossieFromBundle } from "@/components/checklist/dossie-pdf";

export const Route = createFileRoute("/_authenticated/trocas-ont")({
  head: () => ({
    meta: [{ title: "Trocas de ONT — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: OntExchangesPage,
});

type OntExchangeTicket = {
  id: string;
  ticket_code: string;
  checklist_id: string | null;
  revision_number: number;
  service_order: string | null;
  client_name: string | null;
  city: string | null;
  technician_name: string | null;
  removed_model: string | null;
  removed_serial: string | null;
  installed_model: string | null;
  installed_serial: string | null;
  reason: string;
  exchanged_at: string;
};

async function listOntExchanges(): Promise<OntExchangeTicket[]> {
  const { data, error } = await supabase
    .from("ont_exchange_tickets")
    .select("*")
    .order("exchanged_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as OntExchangeTicket[];
}

function OntExchangesPage() {
  const { data: user, isLoading: loadingUser } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["ont-exchange-tickets"],
    queryFn: listOntExchanges,
    enabled: user?.isAdmin === true || user?.isWarehouse === true,
  });

  async function handleDossie(ticketId: string) {
    try {
      setDownloadingId(ticketId);
      const bundle = await getCaseDossieBundle({ data: { ticketId } });
      await downloadCaseDossieFromBundle(bundle);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("different_provider") || msg.includes("missing_role"))
        toast.error("Sem permissão para baixar este dossiê.");
      else if (msg.includes("user_inactive")) toast.error("Sua conta está inativa.");
      else if (msg.includes("provider_suspended")) toast.error("Provedor suspenso.");
      else if (msg.includes("not_found")) toast.error("Atendimento ou ticket não encontrado.");
      else toast.error("Não foi possível gerar o dossiê.");
      console.error(e);
    } finally {
      setDownloadingId(null);
    }
  }

  const items = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return query.data ?? [];
    return (query.data ?? []).filter((item) =>
      [
        item.ticket_code,
        item.service_order,
        item.client_name,
        item.city,
        item.technician_name,
        item.removed_serial,
        item.installed_serial,
        item.reason,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle)),
    );
  }, [query.data, search]);

  if (loadingUser) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user?.isAdmin && !user?.isWarehouse) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta consulta é destinada ao administrador e ao almoxarifado.
        </p>
        <Button asChild className="mt-4">
          <Link to="/painel">Voltar</Link>
        </Button>
      </div>
    );
  }

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
            <PackageSearch className="h-5 w-5" />
          </span>
          Trocas de ONT
        </h1>
        <p className="text-sm text-muted-foreground">
          Pesquise pelo código do adesivo, serial, OS, cliente ou motivo.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ex.: T202601, serial antigo, OS ou cliente"
        />
      </div>

      {query.isLoading && (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando trocas…</p>
      )}
      {query.isError && (
        <p className="py-10 text-center text-sm text-destructive">
          Não foi possível consultar as trocas.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item.id} className="webi-nav-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-cyan-400">{item.ticket_code}</p>
                  <p className="text-sm font-medium">
                    {item.client_name || "Cliente não informado"}
                  </p>
                </div>
                <Badge variant="secondary">R{item.revision_number}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">OS</dt>
                  <dd>{item.service_order || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cidade</dt>
                  <dd>{item.city || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Serial retirado</dt>
                  <dd className="break-all font-medium">{item.removed_serial || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Serial instalado</dt>
                  <dd className="break-all">{item.installed_serial || "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Técnico</dt>
                  <dd>{item.technician_name || "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd className="whitespace-pre-wrap">{item.reason}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Troca registrada em {new Date(item.exchanged_at).toLocaleString("pt-BR")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDossie(item.id)}
                  disabled={downloadingId === item.id}
                >
                  {downloadingId === item.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileArchive className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Baixar dossiê completo
                </Button>
                {user.isAdmin && item.checklist_id && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/checklists/$id" params={{ id: item.checklist_id }}>
                      Abrir checklist
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!query.isLoading && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma troca encontrada.</p>
      )}
    </div>
  );
}
