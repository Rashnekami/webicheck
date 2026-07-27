import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Resolve o provider a partir do Host/subdomínio da requisição.
// Nunca expõe SELECT anônimo em `providers`: a leitura pré-login usa
// sempre o client de service_role (importado dinamicamente dentro do
// handler, mesma convenção de client.server.ts), nunca o client anon.

export const ROOT_DOMAIN = "checktecnico.life";

export interface ResolvedProvider {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

// - "root": sem contexto de provider (domínio raiz, www, localhost,
//   previews etc.) — comportamento atual mantido.
// - "provider": subdomínio reconhecido e provider encontrado no banco
//   (inclusive quando active=false — a UI decide bloquear com base nisso).
// - "invalid": subdomínio está sob *.checktecnico.life mas o slug é
//   malformado OU não corresponde a nenhum provider — nunca deve cair
//   no login genérico.
export type ProviderResolution =
  | { mode: "root" }
  | { mode: "provider"; provider: ResolvedProvider }
  | { mode: "invalid"; slug: string };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 63; // limite de um rótulo DNS

function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

// Resolve o host efetivo da requisição. Atrás de proxy (Cloudflare/
// Lovable), o Host original do navegador chega em `x-forwarded-host`;
// `host` pode refletir o proxy interno. Usa x-forwarded-host primeiro
// (só o primeiro valor, se vier lista separada por vírgula), com
// fallback para host. Sempre remove porta e espaços.
function resolveEffectiveHost(): string | null {
  const xfh = getRequestHeader("x-forwarded-host");
  const raw = (xfh?.split(",")[0] ?? getRequestHeader("host")) || null;
  if (!raw) return null;
  const host = raw.split(":")[0].trim().toLowerCase();
  return host || null;
}

// Classifica o host em "root" (sem contexto), "slug candidato válido" ou
// "slug candidato inválido" — sem tocar o banco ainda.
function classifyHost(
  host: string | null,
):
  | { mode: "root" }
  | { mode: "candidate"; slug: string }
  | { mode: "invalid"; slug: string } {
  if (!host) return { mode: "root" };
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return { mode: "root" };

  const suffix = `.${ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return { mode: "root" }; // fora do nosso domínio (dev/preview/etc.)

  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || !isValidSlug(slug)) {
    return { mode: "invalid", slug };
  }
  return { mode: "candidate", slug };
}

// Server function pública (sem auth): a tela de login precisa saber o
// provider do subdomínio ANTES de qualquer sessão existir.
// NOTA: `providers` ainda não existe em src/integrations/supabase/types.ts
// (as migrations desta fase ainda não foram aplicadas em produção). O
// cast `as any` abaixo é temporário — remover quando os types forem
// regenerados após aplicar o schema.
export const resolveCurrentProvider = createServerFn({ method: "POST" }).handler(
  async (): Promise<ProviderResolution> => {
    const host = resolveEffectiveHost();
    const classified = classifyHost(host);

    if (classified.mode === "root") return { mode: "root" };
    if (classified.mode === "invalid") return { mode: "invalid", slug: classified.slug };

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await (supabaseAdmin as any)
      .from("providers")
      .select("id, slug, name, active")
      .eq("slug", classified.slug)
      .maybeSingle();

    if (error || !data) return { mode: "invalid", slug: classified.slug };
    return { mode: "provider", provider: data as ResolvedProvider };
  });

// Server function autenticada: decide se o usuário do token (nunca um userId
// vindo do cliente) pode operar no provider informado. Roda com
// supabaseAdmin (bypassa RLS) para não depender de nenhuma policy estar
// correta — é a própria fonte da verdade da regra de isolamento.
// Regra: profile.provider_id === providerId -> permitido.
//        profile.provider_id IS NULL E role='admin' -> permitido (admin global).
//        qualquer outro caso, ou qualquer erro -> negado (fail-closed).
export const isAllowedForProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { providerId: string }) => d)
  .handler(async ({ data, context }): Promise<boolean> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
        await Promise.all([
          (supabaseAdmin as any)
            .from("profiles")
            .select("provider_id")
            .eq("id", context.userId)
            .maybeSingle(),
          supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", context.userId),
        ]);

      if (profileError || rolesError) return false;

      const profileProviderId = (profile as any)?.provider_id ?? null;
      const isAdmin = (roles ?? []).some(
        (r: { role: string }) => r.role === "admin",
      );

      if (profileProviderId === data.providerId) return true;
      if (profileProviderId === null && isAdmin) return true;
      return false;
    } catch {
      return false;
    }
  });

// Server function autenticada: vincula um profile AINDA SEM provider ao
// provider do Host atual — usada para completar o cadastro de um novo
// usuário (sessão imediata ou retorno da confirmação por e-mail), sem
// nunca aceitar providerId do cliente e sem nunca sobrescrever um vínculo
// já existente.
//
// Segurança:
// - userId vem do token verificado (requireSupabaseAuth), nunca do cliente;
// - o Host é resolvido de novo aqui dentro — nenhum providerId é aceito
//   como input desta função;
// - exige mode="provider" e active=true;
// - nunca vincula quem já tem role='admin' (admin global fica sempre
//   provider_id IS NULL, por definição);
// - o UPDATE inclui `provider_id IS NULL` na própria condição — é a trava
//   atômica que impede duas requisições concorrentes de se sobreporem: a
//   segunda simplesmente não afeta nenhuma linha, pois quando ela chega o
//   valor já deixou de ser NULL;
// - depois do UPDATE, relê o profile e só retorna sucesso se o
//   provider_id salvo for exatamente igual ao provider resolvido agora —
//   nunca confia no resultado do UPDATE isoladamente;
// - qualquer erro ou inconsistência em qualquer etapa -> false.
export const ensureProviderBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    try {
      const host = resolveEffectiveHost();
      const classified = classifyHost(host);
      if (classified.mode !== "candidate") return false;

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const { data: providerRow, error: providerError } = await (
        supabaseAdmin as any
      )
        .from("providers")
        .select("id, active")
        .eq("slug", classified.slug)
        .maybeSingle();
      if (providerError || !providerRow || !providerRow.active) return false;

      const { data: roles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      if (rolesError) return false;

      const isAdmin = (roles ?? []).some(
        (r: { role: string }) => r.role === "admin",
      );
      if (isAdmin) return false; // admin global nunca é vinculado automaticamente

      // Trava atômica: só afeta a linha se provider_id ainda for NULL.
      // Concorrência é resolvida pelo próprio banco — não precisamos de
      // lock explícito porque o WHERE é reavaliado sob a linha bloqueada.
      const { error: updateError } = await (supabaseAdmin as any)
        .from("profiles")
        .update({ provider_id: providerRow.id })
        .eq("id", context.userId)
        .is("provider_id", null);
      if (updateError) return false;

      // Confirma o estado final lendo de novo — só sucesso se o valor
      // salvo for exatamente o provider resolvido agora.
      const { data: finalProfile, error: finalError } = await (
        supabaseAdmin as any
      )
        .from("profiles")
        .select("provider_id")
        .eq("id", context.userId)
        .maybeSingle();
      if (finalError || !finalProfile) return false;

      return finalProfile.provider_id === providerRow.id;
    } catch {
      return false;
    }
  });
