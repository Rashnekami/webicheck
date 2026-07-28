import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Webifibra" },
      {
        name: "description",
        content: "Acesse a plataforma de checklist técnico da Webifibra.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email({ message: "Informe um e-mail válido" }).max(255);
const forgotSchema = z.object({ email: emailSchema });

function finishLogin() {
  const returnTo = sessionStorage.getItem("webicheck.return_to");
  sessionStorage.removeItem("webicheck.return_to");
  window.location.assign(returnTo?.startsWith("/") ? returnTo : "/painel");
}

function AuthPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"login" | "forgot">("login");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setChecking(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("active, city")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!profile?.active) {
        await supabase.auth.signOut();
        toast.error("Seu acesso está inativo. Procure um administrador.");
        setChecking(false);
        return;
      }
      if (!profile.city?.trim()) {
        navigate({ to: "/completar-cadastro", replace: true });
        return;
      }
      finishLogin();
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="brand-gradient flex min-h-screen items-center justify-center">
        <WebifibraLogo size={72} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center text-white">
          <WebifibraLogo size={72} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Webifibra</h1>
            <p className="text-sm opacity-90">Checklist Técnico de Campo</p>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle>Acessar plataforma</CardTitle>
            <CardDescription>Use o provedor, login e senha, ou entre com Google se sua conta já estiver vinculada.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="forgot">Recuperar acesso</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="pt-4">
                <InternalLoginForm />
                <GoogleButton className="mt-4" />
              </TabsContent>

              <TabsContent value="forgot" className="pt-4">
                <ForgotForm onDone={() => setTab("login")} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="mt-4">
          <InstallButton
            variant="secondary"
            size="lg"
            fullWidth
            label="Instalar aplicativo"
            className="bg-white/95 text-primary hover:bg-white"
          />
        </div>

        <p className="mt-6 text-center text-xs text-white/80">
          © {new Date().getFullYear()} Webifibra — uso interno
        </p>
      </div>
    </div>
  );
}

function ForgotForm({ onDone }: { onDone: () => void }) {
  const form = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof forgotSchema>) {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error("Não foi possível enviar o e-mail de recuperação.");
      return;
    }
    toast.success("Se o e-mail existir, você receberá as instruções.");
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="fg-email">E-mail cadastrado</Label>
        <Input
          id="fg-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enviar instruções
      </Button>
    </form>
  );
}

function GoogleButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  async function onClick() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Não foi possível entrar com Google.");
      return;
    }
    // Se result.redirected => o navegador vai redirecionar; se não, sessão já foi setada.
    if (!result.redirected) {
      finishLogin();
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={className}
      onClick={onClick}
      disabled={loading}
      style={{ width: "100%" }}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
          />
        </svg>
      )}
      Continuar com Google
    </Button>
  );
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "checktecnico",
  "webicheck",
  "app",
  "id-preview",
  "localhost",
  "preview",
]);

function detectProviderSlugFromHost(): string {
  if (typeof window === "undefined") return "webifibra";
  const host = window.location.hostname;
  const parts = host.split(".");
  // Ex.: webifibra.checktecnico.life -> ["webifibra","checktecnico","life"]
  if (parts.length >= 3) {
    const first = parts[0].toLowerCase();
    if (!RESERVED_SUBDOMAINS.has(first) && /^[a-z0-9-]{2,40}$/.test(first)) {
      return first;
    }
  }
  return "webifibra";
}

function InternalLoginForm() {
  const navigate = useNavigate();
  const [providerSlug, setProviderSlug] = useState(() => detectProviderSlugFromHost());
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!providerSlug || !login || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch("/api/public/auth/login-internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_slug: providerSlug, login, password }),
      });
      const body = (await resp.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
      };
      if (!resp.ok || !body.access_token || !body.refresh_token) {
        toast.error(body.error || "Login ou senha inválidos.");
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (error) {
        toast.error("Não foi possível iniciar a sessão.");
        return;
      }
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) {
        toast.error("Sessão inválida.");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("active, city")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!profile?.active) {
        await supabase.auth.signOut();
        toast.error("Seu acesso está inativo.");
        return;
      }
      if (!profile.city?.trim()) {
        navigate({ to: "/completar-cadastro", replace: true });
        return;
      }
      finishLogin();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="int-provider">Provedor</Label>
        <Input
          id="int-provider"
          value={providerSlug}
          onChange={(e) => setProviderSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="webifibra"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="int-login">Login</Label>
        <Input
          id="int-login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="T0112"
          autoComplete="username"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="int-password">Senha</Label>
        <Input
          id="int-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
