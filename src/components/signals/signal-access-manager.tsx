import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listSignalAccessCandidates,
  listSignalPanelAccess,
  setSignalPanelAccess,
} from "@/lib/signal-access.functions";

export function SignalAccessManager() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");

  const accessQuery = useQuery({
    queryKey: ["signal-panel-access-list"],
    queryFn: () => listSignalPanelAccess(),
  });
  const candidatesQuery = useQuery({
    queryKey: ["signal-access-candidates"],
    queryFn: () => listSignalAccessCandidates(),
  });

  const grantedIds = useMemo(
    () => new Set((accessQuery.data ?? []).map((row) => row.user_id)),
    [accessQuery.data],
  );

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (candidatesQuery.data ?? [])
      .filter((person) => !grantedIds.has(person.id))
      .filter(
        (person) =>
          !term ||
          person.full_name.toLowerCase().includes(term) ||
          person.email.toLowerCase().includes(term),
      );
  }, [candidatesQuery.data, grantedIds, search]);

  const mutation = useMutation({
    mutationFn: (input: { userId: string; allow: boolean }) => setSignalPanelAccess({ data: input }),
    onSuccess: (_result, input) => {
      toast.success(input.allow ? "Acesso liberado." : "Acesso removido.");
      setSelected("");
      void queryClient.invalidateQueries({ queryKey: ["signal-panel-access-list"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" /> Acesso ao painel de sinais e OS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Pessoas liberadas aqui passam a ver e trabalhar no painel de sinais e nas OS do seu
          provedor, mesmo sem serem administradoras.
        </p>

        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="signal-access-search">Buscar pessoa</Label>
            <Input
              id="signal-access-search"
              placeholder="Nome ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signal-access-person">Pessoa</Label>
            <select
              id="signal-access-person"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Selecione</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                  {person.email ? ` — ${person.email}` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            disabled={!selected || mutation.isPending}
            onClick={() => mutation.mutate({ userId: selected, allow: true })}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Liberar acesso
          </Button>
        </div>

        <div className="space-y-2">
          {accessQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando liberações…</p>
          )}
          {(accessQuery.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{row.full_name}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ userId: row.user_id, allow: false })}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remover
              </Button>
            </div>
          ))}
          {accessQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma pessoa liberada além das administradoras.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
