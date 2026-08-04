/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Cable, Loader2, Plus, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createOpticalCeo, listOpticalCeos } from "@/lib/optical-map.functions";

export const Route = createFileRoute("/_authenticated/mapa-optico/")({
  head: () => ({
    meta: [{ title: "Mapa Óptico Inteligente — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: MapaOpticoPage,
});

function MapaOpticoPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canWrite = !!(user?.isAdmin || user?.isSupervisor || user?.isPlatformAdmin);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: "", nome: "", cidade: "", bairro: "" });

  const ceosQ = useQuery({ queryKey: ["optical-ceos"], queryFn: () => listOpticalCeos() });

  const create = useMutation({
    mutationFn: () => createOpticalCeo({ data: form }),
    onSuccess: () => {
      toast.success("CEO criada.");
      setOpen(false);
      setForm({ codigo: "", nome: "", cidade: "", bairro: "" });
      qc.invalidateQueries({ queryKey: ["optical-ceos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (userLoading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const ceos = ceosQ.data ?? [];

  return (
    <div className="webi-page mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header p-5 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <span className="webi-icon h-11 w-11">
            <Cable className="h-5 w-5" />
          </span>
          Mapa Óptico Inteligente
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-300">
          <FlaskConical className="h-3.5 w-3.5" /> Módulo experimental — inventário de CEO,
          splitters, cabos e CTOs. Ainda não integrado aos checklists de campo.
        </p>
      </div>

      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova CEO
          </Button>
        </div>
      )}

      {ceosQ.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : ceos.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma CEO cadastrada ainda.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ceos.map((ceo: Record<string, any>) => (
            <Link key={ceo.id} to="/mapa-optico/$ceoId" params={{ ceoId: ceo.id }}>
              <Card className="webi-nav-card h-full">
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold text-cyan-400">{ceo.codigo}</p>
                    <Badge variant="outline">{ceo.estado ?? "ativa"}</Badge>
                  </div>
                  {ceo.nome && <p className="text-sm font-medium">{ceo.nome}</p>}
                  <p className="text-xs text-muted-foreground">
                    {[ceo.bairro, ceo.cidade].filter(Boolean).join(" · ") || "Localização não informada"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova CEO</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                placeholder="TB-CEO-004"
              />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={create.isPending || !form.codigo.trim()} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
