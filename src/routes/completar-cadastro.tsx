import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_CITIES, isKnownProfileCity } from "@/lib/profile-cities";

export const Route = createFileRoute("/completar-cadastro")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Informe sua cidade — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [city, setCity] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("active, city")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile?.active) {
        await supabase.auth.signOut();
        toast.error("Seu acesso está inativo. Procure um administrador.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      if (profile.city?.trim()) {
        navigate({ to: "/painel", replace: true });
        return;
      }
      setChecking(false);
    });
  }, [navigate]);

  async function saveCity() {
    if (!isKnownProfileCity(city)) {
      toast.error("Selecione a cidade onde você atende.");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão não encontrada.");
      const { error } = await supabase
        .from("profiles")
        .update({ city } as never)
        .eq("id", auth.user.id);
      if (error) throw error;
      toast.success("Cidade registrada.");
      navigate({ to: "/painel", replace: true });
    } catch {
      toast.error("Não foi possível registrar sua cidade.");
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
            Antes de acessar os checklists, informe a cidade onde você atende. Isso mantém os
            indicadores e a gestão das equipes organizados por município.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
          <Button className="w-full" size="lg" onClick={saveCity} disabled={saving || !city}>
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
