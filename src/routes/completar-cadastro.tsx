import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Check, Loader2, LogOut, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { setMyContactEmail } from "@/lib/self-service-auth.functions";
import {
  PROFILE_CITIES,
  expandCitiesToTerritories,
  territoryNames,
} from "@/lib/profile-cities";
import { cn } from "@/lib/utils";

type ProviderOption = { id: string; name: string; slug: string };

const FIELD_ROLES = ["tecnico", "supervisor", "noc", "almoxarifado"];

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
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [needsProvider, setNeedsProvider] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [needsCities, setNeedsCities] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
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
        .select("active, city, provider_id, cities_configured_at, contact_email")
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
        contact_email: string | null;
      };
      const missingProvider = !p.provider_id;
      const missingEmail = !p.contact_email;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const isFieldUser = (roles ?? []).some((r) =>
        FIELD_ROLES.includes((r as { role: string }).role),
      );
      const missingCities = isFieldUser && !p.cities_configured_at;

      if (!missingProvider && !missingEmail && !missingCities) {
        navigate({ to: "/painel", replace: true });
        return;
      }
      setUserId(data.user.id);
      setNeedsProvider(missingProvider);
      setNeedsEmail(missingEmail);
      setNeedsCities(missingCities);
      setEmail(p.contact_email ?? "");
      setGoogleLinked(
        (data.user.identities ?? []).some((identity) => identity.provider === "google"),
      );
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
  const emailValid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());
  const canSave =
    !saving && (!needsEmail || emailValid) && (!needsCities || cities.length > 0) &&
    (!needsProvider || !!providerId);

  async function linkGoogle() {
    setLinkingGoogle(true);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/completar-cadastro` },
      });
      if (error) throw error;
    } catch {
      toast.error("Não foi possível vincular a conta Google agora.");
      setLinkingGoogle(false);
    }
  }

  async function save() {
    if (needsEmail && !emailValid) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (needsCities && cities.length === 0) {
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
      // Cidade/provedor PRIMEIRO: o middleware das server functions exige
      // profiles.city preenchido, então salvar o e-mail antes disso falha
      // com "Unauthorized: Profile city required".
      const patch: Record<string, unknown> = {};
      if (needsCities) {
        await supabase.from("user_cities").delete().eq("user_id", userId);
        const { error: cityError } = await supabase
          .from("user_cities")
          .insert(effectiveCities.map((city) => ({ user_id: userId, city })) as never);
        if (cityError) throw cityError;
        patch.city = cities[0];
        patch.cities_configured_at = new Date().toISOString();
      }
      if (needsProvider) patch.provider_id = providerId;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("profiles")
          .update(patch as never)
          .eq("id", userId);
        if (error) throw error;
      }

      if (needsEmail) {
        await setMyContactEmail({ data: { email: email.trim().toLowerCase() } });
      }

      toast.success("Cadastro concluído.");
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar seus dados.");
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
            Confirme seus dados para liberar o acesso. O e-mail é obrigatório; vincular o Google é
            opcional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {needsEmail && (
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">E-mail pessoal ou corporativo</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  className="pl-9"
                  placeholder="voce@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Usaremos este e-mail para notificações e recuperação de acesso.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Conta Google (opcional)</Label>
            {googleLinked ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-emerald-500" /> Conta Google já vinculada.
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={linkGoogle}
                disabled={linkingGoogle || saving}
              >
                {linkingGoogle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Vincular conta Google
              </Button>
            )}
          </div>

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

          {needsCities && (
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
          )}

          {needsCities && groups.length > 0 && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{groups.join(" + ")}</p>
              <p>Você terá acesso a: {effectiveCities.join(", ")}.</p>
            </div>
          )}

          <Button className="w-full" size="lg" onClick={save} disabled={!canSave}>
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
