import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "tecnico" | "almoxarifado" | "supervisor" | "noc";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  matricula: string | null;
  city: string | null;
  active: boolean;
  assinatura: string | null;
  provider_id: string | null;
  supervisor_id: string | null;
  platform_admin: boolean;
  cities: string[];
  territories: string[];
  roles: AppRole[];
  isAdmin: boolean;
  isWarehouse: boolean;
  isSupervisor: boolean;
  isNoc: boolean;
  isPlatformAdmin: boolean;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const [{ data: profile }, { data: roles }, { data: cityRows }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
        supabase.from("user_cities").select("city").eq("user_id", auth.user.id),
      ]);
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
      return {
        id: auth.user.id,
        email: p?.email ?? auth.user.email ?? "",
        full_name: p?.full_name ?? "",
        phone: p?.phone ?? null,
        matricula: p?.matricula ?? null,
        city: p?.city ?? null,
        active: p?.active ?? true,
        assinatura: p?.assinatura ?? null,
        provider_id: p?.provider_id ?? null,
        supervisor_id: p?.supervisor_id ?? null,
        platform_admin: platformAdmin,
        roles: roleList,
        isAdmin: roleList.includes("admin"),
        isWarehouse: roleList.includes("almoxarifado"),
        isSupervisor: roleList.includes("supervisor"),
        isNoc: roleList.includes("noc"),
        isPlatformAdmin: platformAdmin,
      };
    },
    staleTime: 60_000,
  });
}

export async function updateAssinatura(userId: string, dataUrl: string | null) {
  const { error } = await supabase
    .from("profiles")
    .update({ assinatura: dataUrl } as never)
    .eq("id", userId);
  if (error) throw error;
}
