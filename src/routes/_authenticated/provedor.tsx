import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Laptop, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  getProviderAdmin,
  updateDeviceStatus,
  updateProviderStatus,
} from "@/lib/provider-admin.functions";

export const Route = createFileRoute("/_authenticated/provedor")({ component: ProviderPage });

function ProviderPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["provider-admin"],
    queryFn: () => getProviderAdmin(),
    enabled: user?.isAdmin === true,
  });
  const providerStatus = useMutation({
    mutationFn: (status: "active" | "suspended" | "cancelled") =>
      updateProviderStatus({ data: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["provider-admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deviceStatus = useMutation({
    mutationFn: (data: { deviceId: string; status: "active" | "suspended" | "revoked" }) =>
      updateDeviceStatus({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["provider-admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  if (!user?.isAdmin) return <div className="p-8 text-center">Acesso restrito.</div>;
  if (query.isLoading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  const provider = query.data?.provider;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Building2 className="h-6 w-6 text-primary" /> Provedor e dispositivos
        </h1>
      </div>
      {provider && (
        <Card>
          <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">{provider.name}</h2>
              <p className="text-sm text-muted-foreground">Identificador: {provider.slug}</p>
              <Badge
                className="mt-2"
                variant={provider.status === "active" ? "default" : "destructive"}
              >
                {provider.status === "active"
                  ? "Ativo"
                  : provider.status === "suspended"
                    ? "Suspenso"
                    : "Cancelado"}
              </Badge>
            </div>
            {query.data?.canManageCommercial ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => providerStatus.mutate("active")}>
                  Ativar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => providerStatus.mutate("suspended")}
                >
                  Suspender
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Situação comercial gerenciada pela plataforma.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Laptop className="h-5 w-5" /> Dispositivos autorizados
        </h2>
        {query.data?.devices.map((device) => (
          <Card key={device.id}>
            <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">{device.name}</p>
                <p className="text-xs text-muted-foreground">
                  {device.platform || "Plataforma não informada"} · Agent{" "}
                  {device.agent_version || "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Último acesso:{" "}
                  {device.last_seen_at
                    ? new Date(device.last_seen_at).toLocaleString("pt-BR")
                    : "ainda não utilizado"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={device.status === "active" ? "default" : "secondary"}>
                  {device.status}
                </Badge>
                {device.status === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      deviceStatus.mutate({ deviceId: device.id, status: "suspended" })
                    }
                  >
                    Suspender
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deviceStatus.mutate({ deviceId: device.id, status: "active" })}
                  >
                    Ativar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deviceStatus.mutate({ deviceId: device.id, status: "revoked" })}
                >
                  Revogar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
