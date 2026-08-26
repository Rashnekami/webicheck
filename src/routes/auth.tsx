import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { CheckTecnicoLogo, CheckTecnicoMark } from "@/components/checktecnico-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MapPin,
  QrCode,
  Radio,
  ShieldCheck,
  UserRound,
  Wifi,
} from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — CheckTecnico" },
      {
        name: "description",
        content: "Acesse a plataforma de checklist técnico CheckTecnico.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email({ message: "Informe um e-mail válido" }).max(255);
const forgotSchema = z.object({ email: emailSchema });

/** Coluna de marketing do desktop — some por completo no celular. */
const RECURSOS = [
  { icon: ClipboardCheck, label: "Checklists\nInteligentes" },
  { icon: MapPin, label: "Geolocalização\nem Tempo Real" },
  { icon: Wifi, label: "Diagnósticos\nAvançados" },
  { icon: QrCode, label: "Evidências\ncom QR Code" },
  { icon: BarChart3, label: "Relatórios\ne Análises" },
];

/** Rodapé do celular: 3 selos curtos, no lugar dos 5 recursos do desktop
 *  (tela pequena não comporta a coluna de marketing sem empurrar o
 *  formulário pra fora da primeira dobra). */
const SELOS = [
  { icon: ShieldCheck, label: "100%\nConectada" },
  { icon: Radio, label: "Operação\nem Tempo Real" },
  { icon: Lock, label: "Dados\nProtegidos" },
];

// Navegação client-side depois do login. Um window.location.assign() aqui
// recarregava a página inteira logo após setSession(); no preview (e em
// qualquer contexto onde a sessão ainda não terminou de ser persistida) o
// reload acontecia antes da gravação, o app subia sem sessão e voltava
// pra /auth — parecia "não loga com Google". Confirmamos a sessão antes
// de sair da tela e trocamos de rota sem reload.
async function finishLogin(navigate?: (opts: { to: string; replace?: boolean }) => void) {
  const returnTo = sessionStorage.getItem("webicheck.return_to");
  sessionStorage.removeItem("webicheck.return_to");
  const to = returnTo?.startsWith("/") ? returnTo : "/painel";

  // Espera a sessão ficar disponível (setSession é assíncrono no storage).
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  if (navigate) navigate({ to, replace: true });
  else window.location.assign(to);
}


function AuthPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<"login" | "forgot">("login");

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
      await finishLogin(navigate);
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="auth-stage flex min-h-dvh items-center justify-center">
        <CheckTecnicoMark size={72} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="auth-stage min-h-dvh">
      {/* Duas colunas só a partir de lg. No celular a coluna de marketing
          some inteira e sobra o card + 3 selos no rodapé: o técnico em
          campo precisa do login à mão, não de texto de venda ocupando a
          primeira dobra. */}
      <div className="mx-auto grid min-h-dvh w-full max-w-7xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-14 lg:py-12">
        {/* Coluna de marketing: exclusiva do desktop. Sem repetir a marca
            aqui — o emblema já fica acima do card, à direita. */}
        <section className="hidden lg:block">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-slate-300">
            Sua operação. 100% <span className="text-sky-400">conectada</span>. 100% sob controle.
          </p>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-400">
            A plataforma completa para provedores e equipes de campo executarem, analisarem e
            comprovarem cada atendimento com{" "}
            <span className="text-emerald-400">eficiência e inteligência</span>.
          </p>

          <ul className="mt-9 grid grid-cols-5 gap-4">
            {RECURSOS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-start gap-2">
                <span className="webi-icon h-11 w-11 rounded-xl">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="whitespace-pre-line text-xs leading-tight text-slate-400">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="w-full">
          {/* Emblema acima do login nas duas versões. O brasão tem o nome
              escrito dentro da arte, então altura pequena deixava tudo
              ilegível — daqui pra baixo o texto do logo some. A fonte
              tem 512px de altura, então até 256px continua com folga de
              2x para telas retina. */}
          <CheckTecnicoLogo className="mx-auto mb-5 h-52 drop-shadow-[0_10px_34px_rgba(12,120,220,0.4)] sm:h-60 lg:mb-6 lg:h-64" />

          <div className="auth-card p-6 sm:p-7">
            <p className="text-center text-sm text-slate-400">
              {view === "login"
                ? "Acesse sua conta para continuar"
                : "Recupere o acesso pelo seu e-mail"}
            </p>

            <div className="mt-5">
              {view === "login" ? (
                <>
                  <InternalLoginForm onForgot={() => setView("forgot")} />
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-xs text-slate-500">ou</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                  <GoogleButton />
                </>
              ) : (
                <ForgotForm onDone={() => setView("login")} />
              )}
            </div>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Ambiente seguro e criptografado
            </p>
          </div>

          <GoogleReviewLinks className="mt-5" />

          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-300">
              <ShieldCheck className="h-4 w-4" /> Canal de Denúncias
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Espaço seguro e confidencial para relatar condutas inadequadas. Você pode registrar sua denúncia de
              forma totalmente anônima, sem precisar entrar na plataforma.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                onClick={() => navigate({ to: "/denuncia" })}
              >
                Fazer denúncia
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-slate-300 hover:text-amber-200"
                onClick={() => navigate({ to: "/denuncia/acompanhar" })}
              >
                Acompanhar denúncia
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <InstallButton
              variant="secondary"
              size="lg"
              fullWidth
              label="Instalar aplicativo"
              className="border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            />
          </div>

          {/* Selos do celular — no desktop quem cumpre esse papel é a
              coluna de marketing à esquerda. */}
          <ul className="mt-7 grid grid-cols-3 gap-2 lg:hidden">
            {SELOS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center gap-2 text-center">
                <Icon className="h-6 w-6 text-sky-400" />
                <span className="whitespace-pre-line text-[11px] leading-tight text-slate-400">
                  {label}
                </span>
              </li>
            ))}
          </ul>


          <p className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} CheckTecnico — uso interno
          </p>

        </section>
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fg-email" className="auth-label">
          E-mail cadastrado
        </Label>
        <Input
          id="fg-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          className="auth-input"
          placeholder="voce@provedor.com.br"
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-rose-400">{form.formState.errors.email.message}</p>
        )}
      </div>
      <Button
        type="submit"
        size="lg"
        className="auth-submit w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enviar instruções
      </Button>
      <button
        type="button"
        onClick={onDone}
        className="w-full text-center text-xs text-slate-400 underline-offset-4 hover:text-sky-400 hover:underline"
      >
        Voltar para o login
      </button>
    </form>
  );
}

function GoogleButton() {
  const navigate = useNavigate();
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
      await finishLogin(navigate);
      setLoading(false);
    }
  }
  return (
    <Button
      type="button"
      size="lg"
      className="w-full bg-white text-slate-900 hover:bg-slate-100"
      onClick={onClick}
      disabled={loading}
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
      Entrar com Google
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

// UUID (36 caracteres, 5 grupos hex separados por hífen) passa sem problema
// no regex de slug (letras minúsculas/números/hífen, até 40 caracteres) —
// no domínio de preview da própria Lovable, o subdomínio é literalmente o
// id do projeto (ex.: c8f9924b-9de1-43c0-93ff-96920deea995.lovableproject
// .com), e sem essa checagem o campo "Provedor" aparecia pré-preenchido
// com esse UUID em vez de cair no padrão "webifibra". Não afeta o domínio
// real de produção (webifibra.checktecnico.life), só a prévia interna.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function detectProviderSlugFromHost(): string {
  if (typeof window === "undefined") return "webifibra";
  const host = window.location.hostname;
  const parts = host.split(".");
  // Ex.: webifibra.checktecnico.life -> ["webifibra","checktecnico","life"]
  if (parts.length >= 3) {
    const first = parts[0].toLowerCase();
    if (
      !RESERVED_SUBDOMAINS.has(first) &&
      !UUID_RE.test(first) &&
      /^[a-z0-9-]{2,40}$/.test(first)
    ) {
      return first;
    }
  }
  return "webifibra";
}

function InternalLoginForm({ onForgot }: { onForgot: () => void }) {
  const navigate = useNavigate();
  const [providerSlug, setProviderSlug] = useState(() => detectProviderSlugFromHost());
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      await finishLogin(navigate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="int-provider" className="auth-label">
          Provedor
        </Label>
        <div className="relative">
          <Building2 className="auth-field-icon" />
          <Input
            id="int-provider"
            value={providerSlug}
            onChange={(e) =>
              setProviderSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            placeholder="webifibra"
            className="auth-input pl-10"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="int-login" className="auth-label">
          Login
        </Label>
        <div className="relative">
          <UserRound className="auth-field-icon" />
          <Input
            id="int-login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Seu login"
            autoComplete="username"
            className="auth-input pl-10"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="int-password" className="auth-label">
          Senha
        </Label>
        <div className="relative">
          <Lock className="auth-field-icon" />
          <Input
            id="int-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha"
            autoComplete="current-password"
            className="auth-input px-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-sky-400"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="auth-submit w-full" disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Entrar
        {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>

      <button
        type="button"
        onClick={onForgot}
        className="w-full text-center text-xs text-slate-400 underline-offset-4 hover:text-sky-400 hover:underline"
      >
        Esqueceu a senha?
      </button>
    </form>
  );
}
