import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  PackageSearch,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatChecklistCode } from "@/lib/checklist-code";
import { type ChecklistListRow, listChecklists } from "@/lib/checklists";

export const Route = createFileRoute("/_authenticated/equipamentos")({
  head: () => ({
    meta: [{ title: "Trocas de equipamentos — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: EquipmentExchangesPage,
});

function printableChecklistCode(row: ChecklistListRow) {
  return (
    formatChecklistCode({
      numero_publico: row.numero_publico,
      codigo_validacao: row.codigo_validacao,
      revision_number: row.revision_number,
    }) || "—"
  );
}

function printEquipmentTag(row: ChecklistListRow) {
  const popup = window.open("", "_blank", "width=520,height=480");
  if (!popup) {
    toast.error("Permita pop-ups para imprimir a etiqueta.");
    return;
  }
  const doc = popup.document;
  doc.title = `Etiqueta ${row.equipment_tag_code ?? "ONT"}`;
  const style = doc.createElement("style");
  style.textContent = `
    @page { size: 80mm 45mm; margin: 3mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
    .tag { width: 74mm; min-height: 39mm; border: 1.5px solid #1a53ff;
      border-radius: 3mm; padding: 3mm; display: flex; flex-direction: column;
      justify-content: space-between; }
    .brand { color: #0f3fd4; font-size: 9pt; font-weight: 700; }
    .title { color: #475569; font-size: 7pt; text-transform: uppercase; }
    .code { color: #0f3fd4; font-size: 25pt; line-height: 1; font-weight: 800;
      letter-spacing: 1.5pt; text-align: center; margin: 2mm 0; }
    .meta { font-size: 7pt; line-height: 1.35; }
  `;
  doc.head.appendChild(style);
  const tag = doc.createElement("main");
  tag.className = "tag";
  const brand = doc.createElement("div");
  brand.className = "brand";
  brand.textContent = "WEBIFIBRA · CONTROLE DE EQUIPAMENTO";
  const title = doc.createElement("div");
  title.className = "title";
  title.textContent = "ONT/ONU retirada em atendimento";
  const code = doc.createElement("div");
  code.className = "code";
  code.textContent = row.equipment_tag_code ?? "SEM CÓDIGO";
  const meta = doc.createElement("div");
  meta.className = "meta";
  meta.textContent = `Serial: ${row.serial_ont_retirada || "—"} · Checklist: ${printableChecklistCode(row)}`;
  tag.append(brand, title, code, meta);
  doc.body.appendChild(tag);
  popup.focus();
  popup.setTimeout(() => popup.print(), 250);
}

function EquipmentExchangesPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!userLoading && user && !user.canViewEquipment) {
      navigate({ to: "/painel", replace: true });
    }
  }, [navigate, user, userLoading]);

  const query = useQuery({
    queryKey: ["equipment-exchanges", user?.id],
    queryFn: () => listChecklists({ scope: "all", userId: user!.id }),
    enabled: !!user?.canViewEquipment,
  });

  const exchanges = useMemo(
    () =>
      (query.data ?? [])
        .filter(
          (row) =>
            row.status === "finalizado" &&
            row.troca_realizada === true &&
            Boolean(row.equipment_tag_code),
        )
        .sort((a, b) =>
          (b.finalizado_em ?? b.created_at).localeCompare(a.finalizado_em ?? a.created_at),
        ),
    [query.data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return exchanges;
    return exchanges.filter((row) =>
      [
        row.equipment_tag_code,
        row.serial_ont_retirada,
        row.serial_ont_instalada,
        row.modelo_ont_retirada,
        row.modelo_ont_instalada,
        row.numero_publico,
        row.codigo_validacao,
        row.os,
        row.cliente,
        row.cidade,
        row.tecnico_nome,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [exchanges, search]);

  if (userLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user.canViewEquipment) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/painel">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar ao painel
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <PackageSearch className="h-6 w-6 text-primary" /> Trocas de equipamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Consulte a ONT retirada, a instalada e o atendimento usando o código da etiqueta.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" /> {exchanges.length} troca(s) rastreada(s)
        </Badge>
      </div>

      <div className="relative">
        <PackageSearch className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
          placeholder="Pesquisar TE000001, serial, checklist, OS, cliente, cidade ou técnico"
        />
      </div>

      {query.isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando trocas…
        </div>
      )}

      {query.isError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar as trocas: {(query.error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Etiqueta da ONT retirada
                  </p>
                  <p className="font-mono text-3xl font-black tracking-wider text-primary">
                    {row.equipment_tag_code}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(row.equipment_tag_code ?? "");
                        toast.success("Código copiado.");
                      } catch {
                        toast.error("Não foi possível copiar o código.");
                      }
                    }}
                  >
                    <ClipboardCopy className="mr-1.5 h-4 w-4" /> Copiar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => printEquipmentTag(row)}>
                    <Printer className="mr-1.5 h-4 w-4" /> Etiqueta
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Retirada</p>
                  <p className="font-semibold">
                    {row.modelo_ont_retirada || "Modelo não informado"}
                  </p>
                  <p className="font-mono text-sm">Serial {row.serial_ont_retirada || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Instalada</p>
                  <p className="font-semibold">
                    {row.modelo_ont_instalada || "Modelo não informado"}
                  </p>
                  <p className="font-mono text-sm">Serial {row.serial_ont_instalada || "—"}</p>
                </div>
              </div>

              <div className="grid gap-1 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Cliente:</span> {row.cliente || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">OS:</span> {row.os || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Cidade:</span> {row.cidade || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Técnico:</span> {row.tecnico_nome}
                </p>
                <p>
                  <span className="text-muted-foreground">Data:</span>{" "}
                  {row.finalizado_em ? new Date(row.finalizado_em).toLocaleString("pt-BR") : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Checklist:</span>{" "}
                  {printableChecklistCode(row)}
                </p>
              </div>

              <Button asChild variant="secondary" className="w-full">
                <Link to="/checklists/$id" params={{ id: row.id }}>
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir atendimento completo
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!query.isLoading && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma troca encontrada com essa pesquisa.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
