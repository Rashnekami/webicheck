import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  resolveCurrentProvider,
  isAllowedForProvider,
  type ProviderResolution,
  type ResolvedProvider,
} from "@/lib/provider-resolution.functions";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldAlert } from "lucide-react";
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

const passwordSchema = z
  .string()
  .min(1, { message: "Informe a senha" })
  .max(72);

const loginSchema = z.object({
  provedor: z
    .string()
    .trim()
    .min(1, { message: "Informe o provedor" })
    .max(63),
  login: z
    .string()
    .trim()
    .min(1, { message: "Informe o login" })
    .max(32),
  password: passwordSchema,
});

function AuthPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"login" | "forgot">("login");

  const providerQuery = useQuery({
    queryKey: ["host-provider-context"],
    queryFn: () => resolveCurrentProvider(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    // O retorno do OAuth do Google traz o erro do trigger de bloqueio
    // (fase 2 da migration) como query/hash param, não como exceção JS.
    const params = new URLSearchParams(
      window.location.search || window.location.hash.replace(/^#/, "?"),
    );
    const errorDescription = params.get("error_description");
    if (errorDescription?.includes("google_signup_blocked")) {
      toast.error(
        "Este e-mail do Google ainda não está vinculado a nenhuma conta. Peça a um administrador/supervisor para vincular seu acesso.",
      );
      window.history.replaceState(null, "", window.location.pathname);
    } else if (params.get("error")) {
      toast.error("Não foi possível entrar com Google.");
      window.history.replaceState(null, "", window.location.pathname);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  if (checking || providerQuery.isLoading) {
    return (
      <div className="brand-gradient flex min-h-screen items-center justify-center">
        <WebifibraLogo size={72} className="animate-pulse" />
      </div>
    );
  }

  // Falha ao resolver o provider (erro de rede/servidor): nunca cai em modo
  // "root" por omissão — trata como bloqueio até conseguir verificar de novo.
  if (providerQuery.isError) {
    return (
      <BlockedScreen
        title="Não foi possível verificar o provedor"
        message="Tente novamente em instantes. Se o problema persistir, contate o suporte."
      />
    );
  }

  const context: ProviderResolution = providerQuery.data ?? { mode: "root" };

  if (context.mode === "invalid") {
    return (
      <BlockedScreen
        title="Subdomínio inválido"
        message="Este endereço não corresponde a nenhum provedor cadastrado. Verifique o link ou contate quem forneceu o acesso."
      />
    );
  }

  if (context.mode === "provider" && !context.provider.active) {
    return (
      <BlockedScreen
        title="Provedor desativado"
        message={`O acesso de ${context.provider.name} está desativado no momento. Contate o administrador.`}
      />
    );
  }

  const provider = context.mode === "provider" ? context.provider : null;

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center text-white">
          <WebifibraLogo size={72} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Webifibra</h1>
            <p className="text-sm opacity-90">Checklist Técnico de Campo</p>
            {provider && (
              <p className="mt-1 text-xs font-medium uppercase tracking-wider opacity-80">
                {provider.name}
              </p>
            )}
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle>Acessar plataforma</CardTitle>
            <CardDescription>
              Use seu provedor, login e senha, ou entre com Google se sua
              conta já estiver vinculada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as typeof tab)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="forgot">Recuperar acesso</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="pt-4">
                <LoginForm provider={provider} />
                <GoogleButton className="mt-4" provider={provider} />
              </TabsContent>

              <TabsContent value="forgot" className="pt-4">
                <ForgotForm />
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

function BlockedScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <ShieldAlert className="h-8 w-8 text-amber-500" />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function LoginForm({ provider }: { provider: ResolvedProvider | null }) {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { provedor: provider?.slug ?? "", login: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    // A tela web sempre passa pela mesma Auth API central que o Webi
    // Diagnostic usa (POST /api/auth/login) — um único caminho de
    // verificação de senha, nunca duas implementações divergentes.
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: values.provedor,
          login: values.login,
          senha: values.password,
        }),
      });
    } catch {
      toast.error("Não foi possível conectar. Tente novamente.");
      return;
    }
    if (!res.ok) {
      toast.error("Provedor, login ou senha inválidos.");
      return;
    }
    const result = (await res.json()) as {
      token: string;
      refresh_token: string;
    };

    const { error } = await supabase.auth.setSession({
      access_token: result.token,
      refresh_token: result.refresh_token,
    });
    if (error) {
      toast.error("Não foi possível iniciar a sessão. Tente novamente.");
      return;
    }

    // Login NUNCA grava provider_id — só valida. Uma conta já vinculada a
    // outro provider jamais é "migrada" por entrar em outro subdomínio.
    if (provider) {
      const allowed = await isAllowedForProvider({
        data: { providerId: provider.id },
      });
      if (!allowed) {
        await supabase.auth.signOut();
        toast.error("Esta conta não pertence a este provedor.");
        return;
      }
    }

    navigate({ to: "/painel", replace: true });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="login-provedor">Provedor</Label>
        <Input
          id="login-provedor"
          autoComplete="organization"
          readOnly={!!provider}
          className={provider ? "bg-muted" : undefined}
          {...form.register("provedor")}
        />
        {form.formState.errors.provedor && (
          <p className="text-xs text-destructive">
            {form.formState.errors.provedor.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-login">Login</Label>
        <Input
          id="login-login"
          autoComplete="username"
          placeholder="Ex.: TEC01"
          {...form.register("login")}
        />
        {form.formState.errors.login && (
          <p className="text-xs text-destructive">
            {form.formState.errors.login.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Senha</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p className="text-xs text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Entrar
      </Button>
    </form>
  );
}

// Não há autoatendimento de recuperação: o login usa um e-mail sintético
// (login@provedor.internal) sem caixa de entrada real, então
// resetPasswordForEmail do Supabase não se aplica aqui. Recuperação é
// sempre mediada por um admin/supervisor, que gera uma nova senha
// temporária pela tela de administração de usuários.
function ForgotForm() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Não é possível recuperar o acesso sozinho. Fale com um
        administrador ou supervisor: ele pode gerar uma nova senha
        temporária para o seu login.
      </p>
      <p>
        Se você entra normalmente com o Google, use o botão{" "}
        <strong>Continuar com Google</strong> na aba Login.
      </p>
    </div>
  );
}

function GoogleButton({
  className,
  provider,
}: {
  className?: string;
  provider: ResolvedProvider | null;
}) {
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
      if (provider) {
        const allowed = await isAllowedForProvider({
          data: { providerId: provider.id },
        });
        if (!allowed) {
          setLoading(false);
          await supabase.auth.signOut();
          toast.error("Esta conta não pertence a este provedor.");
          return;
        }
      }
      window.location.href = "/painel";
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
        <svg
          className="mr-2 h-4 w-4"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
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
