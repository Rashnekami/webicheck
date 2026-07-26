import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_CITIES, isKnownProfileCity } from "@/lib/profile-cities";

type ProviderOption = { id: string; name: string; slug: string };

export const Route = createFileRoute("/completar-cadastro")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete seu cadastro — Webifibra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [city, setCity] = useState("");
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
        .select("active, city, provider_id")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile?.active) {
        await supabase.auth.signOut();
        toast.error("Seu acesso está inativo. Procure um administrador.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      const p = profile as { active: boolean; city: string | null; provider_id: string | null };
      const missingCity = !p.city?.trim();
      const missingProvider = !p.provider_id;
      if (!missingCity && !missingProvider) {
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

  async function save() {
    if (!isKnownProfileCity(city)) {
      toast.error("Selecione a cidade onde você atende.");
      return;
    }
    if (needsProvider && !providerId) {
      toast.error("Selecione seu provedor.");
      return;
    }
    if (!userId) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { city };
      if (needsProvider) patch.provider_id = providerId;
      const { error } = await supabase
        .from("profiles")
        .update(patch as never)
        .eq("id", userId);
      if (error) throw error;
      toast.success("Cadastro concluído.");
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
          <CardTitle>Complete seu cadastro</CardTitle>
          <CardDescription>
            Antes de acessar os checklists, informe {needsProvider ? "seu provedor e " : ""}a cidade
            onde você atende.
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
          <div className="space-y-1.5">
            <Label htmlFor="profile-city">Cidade de atuação</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <select
                id="profile-city"
                autoFocus
                className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              >
                <option value="">Selecione sua cidade</option>
                {PROFILE_CITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={save}
            disabled={saving || !city || (needsProvider && !providerId)}
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
