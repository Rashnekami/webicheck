import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Check, Loader2, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  PROFILE_CITIES,
  expandCitiesToTerritories,
  territoryNames,
} from "@/lib/profile-cities";
import { cn } from "@/lib/utils";

type ProviderOption = { id: string; name: string; slug: string };

export const Route = createFileRoute("/completar-cadastro")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete seu cadastro — CheckTecnico" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [needsProvider, setNeedsProvider] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("active, city, provider_id, cities_configured_at")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile?.active) {
        await supabase.auth.signOut();
        toast.error("Seu acesso está inativo. Procure um administrador.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      const p = profile as {
        active: boolean;
        city: string | null;
        provider_id: string | null;
        cities_configured_at: string | null;
      };
      const missingProvider = !p.provider_id;
      if (p.cities_configured_at && !missingProvider) {
        navigate({ to: "/painel", replace: true });
        return;
      }
      setUserId(data.user.id);
      setNeedsProvider(missingProvider);
      if (missingProvider) {
        const { data: provs } = await supabase
          .from("providers")
          .select("id, name, slug")
          .eq("status", "active")
          .order("name", { ascending: true });
        setProviders((provs ?? []) as ProviderOption[]);
      }
      setChecking(false);
    })();
  }, [navigate]);

  function toggleCity(city: string) {
    setCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  }

  const groups = territoryNames(cities);
  const effectiveCities = expandCitiesToTerritories(cities);

  async function save() {
    if (cities.length === 0) {
      toast.error("Selecione ao menos uma cidade onde você atende.");
      return;
    }
    if (needsProvider && !providerId) {
      toast.error("Selecione seu provedor.");
      return;
    }
    if (!userId) return;
    setSaving(true);
    try {
      await supabase.from("user_cities").delete().eq("user_id", userId);
      const { error: cityError } = await supabase
        .from("user_cities")
        .insert(effectiveCities.map((city) => ({ user_id: userId, city })) as never);
      if (cityError) throw cityError;

      const patch: Record<string, unknown> = {
        city: cities[0],
        cities_configured_at: new Date().toISOString(),
      };
      if (needsProvider) patch.provider_id = providerId;
      const { error } = await supabase
        .from("profiles")
        .update(patch as never)
        .eq("id", userId);
      if (error) throw error;
      toast.success("Cidades de atuação registradas.");
      navigate({ to: "/painel", replace: true });
    } catch {
      toast.error("Não foi possível registrar seus dados.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (checking) {
    return (
      <div className="brand-gradient flex min-h-screen items-center justify-center">
        <WebifibraLogo size={72} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <WebifibraLogo size={64} className="mx-auto mb-2" />
          <CardTitle>Cidades de atuação</CardTitle>
          <CardDescription>
            Atualizamos as regras de território. Selecione {needsProvider ? "seu provedor e " : ""}
            todas as cidades em que você atua.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {needsProvider && (
            <div className="space-y-1.5">
              <Label htmlFor="profile-provider">Provedor</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <select
                  id="profile-provider"
                  className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  <option value="">Selecione o provedor</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> Selecione suas cidades
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {PROFILE_CITIES.map((option) => {
                const active = cities.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleCity(option)}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                      active
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-input hover:bg-muted",
                    )}
                  >
                    {option}
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          {groups.length > 0 && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{groups.join(" + ")}</p>
              <p>Você terá acesso a: {effectiveCities.join(", ")}.</p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={save}
            disabled={saving || cities.length === 0 || (needsProvider && !providerId)}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e acessar
          </Button>
          <Button className="w-full" variant="ghost" onClick={signOut} disabled={saving}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
