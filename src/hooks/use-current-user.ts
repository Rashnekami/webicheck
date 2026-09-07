import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { territoryNames } from "@/lib/profile-cities";

export type AppRole = "admin" | "tecnico" | "almoxarifado" | "supervisor" | "noc" | "rh";

export interface CurrentUser {
  authUser: User;
  contact_email: string | null;
  cities_configured_at: string | null;
  must_change_password: boolean;
  provider_status: string | null;
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  matricula: string | null;
  city: string | null;
  active: boolean;
  assinatura: string | null;
  provider_id: string | null;
  /** Nome comercial do provedor — exibido ao lado da marca CheckTecnico
   *  para o técnico saber de qual ISP é a operação em que está logado. */
  provider_name: string | null;
  supervisor_id: string | null;
  platform_admin: boolean;
  cities: string[];
  territories: string[];
  roles: AppRole[];
  isAdmin: boolean;
  isWarehouse: boolean;
  isSupervisor: boolean;
  isNoc: boolean;
  /** Setor de RH: só enxerga Canal Ético (denúncias) e Avaliações Técnicas. */
  isRh: boolean;
  isPlatformAdmin: boolean;
}

export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) {
        if (
          authError.name === "AuthSessionMissingError" ||
          authError.status === 401 ||
          authError.status === 403
        )
          return null;
        throw authError;
      }
      if (!auth.user) return null;
      const [profileResult, rolesResult, citiesResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
        supabase.from("user_cities").select("city").eq("user_id", auth.user.id),
      ]);
      for (const result of [profileResult, rolesResult, citiesResult]) {
        if (result.error) throw result.error;
      }
      const profile = profileResult.data;
      const roles = rolesResult.data;
      const cityRows = citiesResult.data;
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const cities = (cityRows ?? []).map((r) => r.city as string);
      const p = profile as
        | (typeof profile & {
            assinatura?: string | null;
            platform_admin?: boolean | null;
            provider_id?: string | null;
            supervisor_id?: string | null;
          })
        | null;
      const platformAdmin = Boolean(p?.platform_admin);

      let providerName: string | null = null;
      let providerStatus: string | null = null;
      if (p?.provider_id) {
        const { data: prov, error: providerError } = await supabase
          .from("providers")
          .select("name, status")
          .eq("id", p.provider_id)
          .maybeSingle();
        if (providerError) throw providerError;
        providerStatus = prov?.status ?? null;
        providerName = ((prov as { name?: string } | null)?.name ?? "").trim() || null;
      }

      return {
        authUser: auth.user,
        contact_email: profile?.contact_email ?? null,
        cities_configured_at: profile?.cities_configured_at ?? null,
        must_change_password: profile?.must_change_password ?? false,
        provider_status: providerStatus,
        id: auth.user.id,
        email: p?.email ?? auth.user.email ?? "",
        full_name: p?.full_name ?? "",
        phone: p?.phone ?? null,
        matricula: p?.matricula ?? null,
        city: p?.city ?? null,
        active: p?.active ?? false,
        assinatura: p?.assinatura ?? null,
        provider_id: p?.provider_id ?? null,
        provider_name: providerName,
        supervisor_id: p?.supervisor_id ?? null,
        platform_admin: platformAdmin,
        cities,
        territories: territoryNames(cities),
        roles: roleList,
        isAdmin: roleList.includes("admin"),
        isWarehouse: roleList.includes("almoxarifado"),
        isSupervisor: roleList.includes("supervisor"),
        isNoc: roleList.includes("noc"),
        isRh: roleList.includes("rh") && !roleList.includes("admin") && !platformAdmin,
        isPlatformAdmin: platformAdmin,
      };
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}

export async function updateAssinatura(userId: string, dataUrl: string | null) {
  const { error } = await supabase
    .from("profiles")
    .update({ assinatura: dataUrl } as never)
    .eq("id", userId);
  if (error) throw error;
}
