import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Plus,
  ShieldCheck,
  Trash2,
  Wifi,
  Wrench,
  BarChart3,
} from "lucide-react";

import { useCurrentUser } from "@/hooks/use-current-user";
import {
  createDraft,
  deleteChecklist,
  listChecklists,
} from "@/lib/checklists";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TIPO_LABEL, type TipoChecklist } from "@/lib/checklist-schema";

export const Route = createFileRoute("/_authenticated/checklists/")({
  head: () => ({
    meta: [{ title: "Checklists — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: ChecklistsList,
});

function ChecklistsList() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"todos" | "rascunho" | "finalizado">("todos");
  const [pickerOpen, setPickerOpen] = useState(false);

  const scope = user?.isAdmin ? "all" : "mine";

  const query = useQuery({
    queryKey: ["checklists", scope, user?.id],
    queryFn: () => listChecklists({ scope, userId: user!.id }),
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: (tipo: TipoChecklist) => createDraft(user!.id, tipo),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      setPickerOpen(false);
      navigate({ to: "/checklists/$id", params: { id } });
    },
    onError: () => toast.error("Não foi possível criar o checklist."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteChecklist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      toast.success("Rascunho removido.");
    },
    onError: () => toast.error("Não foi possível remover."),
  });

  const items = (query.data ?? []).filter((c) => {
    if (tab !== "todos" && c.status !== tab) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return [c.os, c.cliente, c.cidade, c.serial, c.codigo_validacao, c.numero_publico]
      .filter(Boolean)
      .some((v) => (v as string).toLowerCase().includes(needle));
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/painel"
              className="rounded-full bg-white/15 p-2 hover:bg-white/25"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <WebifibraLogo size={40} className="rounded-xl" />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">
                Webifibra
              </p>
              <h1 className="text-lg font-semibold">
                {user?.isAdmin ? "Todos os checklists" : "Meus checklists"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.isAdmin && (
              <>
                <Link to="/dashboard">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/15 text-white hover:bg-white/25"
                  >
                    <BarChart3 className="mr-1 h-3.5 w-3.5" /> Dashboard
                  </Button>
                </Link>
                <Badge className="bg-white/20 text-white hover:bg-white/25">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin
                </Badge>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Buscar por OS, cliente, cidade, serial, código..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button
            size="lg"
            onClick={() => setPickerOpen(true)}
            className="whitespace-nowrap"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Novo checklist
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="rascunho">Rascunhos</TabsTrigger>
            <TabsTrigger value="finalizado">Finalizados</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="pt-3">
            {query.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Carregando...
              </p>
            ) : items.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum checklist por aqui ainda.
                  </p>
                  <Button onClick={() => setPickerOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Criar o primeiro
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.id}>
                    <Card className="transition hover:border-primary/40">
                      <CardContent className="flex items-start justify-between gap-3 p-4">
                        <Link
                          to="/checklists/$id"
                          params={{ id: c.id }}
                          className="flex-1"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {c.cliente || "Sem cliente"}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                c.tipo === "instalacao"
                                  ? "border-sky-500/40 text-sky-700 dark:text-sky-400"
                                  : "border-primary/40 text-primary"
                              }
                            >
                              {c.tipo === "instalacao" ? (
                                <Wrench className="mr-1 h-3 w-3" />
                              ) : (
                                <Wifi className="mr-1 h-3 w-3" />
                              )}
                              {TIPO_LABEL[c.tipo]}
                            </Badge>
                            {c.status === "finalizado" ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15">
                                Finalizado
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Rascunho</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.os ? `OS ${c.os} · ` : ""}
                            {c.cidade || "cidade não informada"}
                            {c.serial ? ` · Serial ${c.serial}` : ""}
                          </p>
                          <p className="mt-1 text-xs font-medium text-primary">
                            {c.status === "finalizado"
                              ? c.numero_publico || c.codigo_validacao || ""
                              : `Atualizado em ${new Date(
                                  c.updated_at,
                                ).toLocaleString("pt-BR")}`}
                          </p>
                        </Link>
                        <div className="flex flex-col items-end gap-1.5">
                          {(c.status === "rascunho" && c.tecnico_id === user?.id) ||
                          user?.isAdmin ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const msg =
                                  c.status === "finalizado"
                                    ? `Apagar checklist finalizado ${c.numero_publico || c.codigo_validacao || ""}? Esta ação é permanente.`
                                    : "Remover este rascunho?";
                                if (confirm(msg)) remove.mutate(c.id);
                              }}
                              title={
                                user?.isAdmin && c.status === "finalizado"
                                  ? "Apagar (admin)"
                                  : "Remover rascunho"
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qual checklist você quer preencher?</DialogTitle>
            <DialogDescription>
              Escolha o tipo de atendimento. Cada modelo tem seus próprios
              campos e gera um PDF específico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate("validacao_ont")}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-primary/5"
            >
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Wifi className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Validação de ONT</h3>
              <p className="text-xs text-muted-foreground">
                Justificar troca de equipamento com evidências, testes e
                autorização do NOC.
              </p>
            </button>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate("instalacao")}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-primary/5"
            >
              <div className="rounded-full bg-sky-500/10 p-2 text-sky-600">
                <Wrench className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Instalação</h3>
              <p className="text-xs text-muted-foreground">
                Validação técnica e orientação ao cliente ao fim da instalação,
                com assinatura do cliente.
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
