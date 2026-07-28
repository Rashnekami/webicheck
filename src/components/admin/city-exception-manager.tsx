import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_CITIES } from "@/lib/profile-cities";

type ExceptionRow = {
  id: string;
  technician_id: string;
  city: string;
  os: string;
  reason: string | null;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
};

type Props = {
  providerId: string | null;
  currentUserId: string;
  technicians: { id: string; full_name: string }[];
};

export function CityExceptionManager({ providerId, currentUserId, technicians }: Props) {
  const queryClient = useQueryClient();
  const [technicianId, setTechnicianId] = useState("");
  const [city, setCity] = useState("");
  const [os, setOs] = useState("");
  const [reason, setReason] = useState("");

  const nameById = useMemo(
    () => new Map(technicians.map((t) => [t.id, t.full_name])),
    [technicians],
  );

  const listQuery = useQuery({
    queryKey: ["city-access-exceptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("city_access_exceptions")
        .select("id, technician_id, city, os, reason, granted_by, created_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ExceptionRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error("Provedor não identificado.");
      if (!technicianId || !city || !os.trim()) throw new Error("Preencha técnico, cidade e OS.");
      const { error } = await supabase.from("city_access_exceptions").insert({
        provider_id: providerId,
        technician_id: technicianId,
        city,
        os: os.trim(),
        reason: reason.trim() || null,
        granted_by: currentUserId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Liberação registrada.");
      setOs("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["city-access-exceptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("city_access_exceptions")
        .update({ revoked_at: new Date().toISOString(), revoked_by: currentUserId } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Liberação revogada.");
      queryClient.invalidateQueries({ queryKey: ["city-access-exceptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-amber-400" /> Liberações excepcionais de cidade
        </CardTitle>
        <CardDescription>
          Autoriza um técnico a registrar e visualizar um atendimento específico (por OS) fora do
          seu território. Não muda o grupo do técnico nem libera os demais registros da cidade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="exc-tec">Técnico</Label>
            <select
              id="exc-tec"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
            >
              <option value="">Selecione</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exc-city">Cidade</Label>
            <select
              id="exc-city"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">Selecione</option>
              {PROFILE_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exc-os">OS / atendimento</Label>
            <Input id="exc-os" value={os} onChange={(e) => setOs(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exc-reason">Motivo</Label>
            <Input id="exc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !technicianId || !city || !os.trim()}
        >
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Liberar atendimento
        </Button>

        <div className="space-y-2">
          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando liberações…</p>
          )}
          {(listQuery.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {nameById.get(row.technician_id) ?? row.technician_id.slice(0, 8)} — {row.city} ·
                  OS {row.os}
                </p>
                <p className="text-xs text-muted-foreground">
                  Liberado por {nameById.get(row.granted_by) ?? "—"} em{" "}
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>
              {row.revoked_at ? (
                <Badge variant="secondary">Revogada</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revokeMutation.mutate(row.id)}
                  disabled={revokeMutation.isPending}
                >
                  Revogar
                </Button>
              )}
            </div>
          ))}
          {listQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma liberação registrada.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
