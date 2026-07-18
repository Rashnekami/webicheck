import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "supervisor" | "visualizador" | "tecnico";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  matricula: string | null;
  city: string | null;
  active: boolean;
  assinatura: string | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSupervisor: boolean;
  isViewer: boolean;
  canViewDashboard: boolean;
  canViewAllChecklists: boolean;
  canViewEquipment: boolean;
  canCreateChecklist: boolean;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const p = profile as (typeof profile & { assinatura?: string | null }) | null;
      const isAdmin = roleList.includes("admin");
      const isSupervisor = roleList.includes("supervisor");
      const isViewer = roleList.includes("visualizador");
      return {
        id: auth.user.id,
        email: p?.email ?? auth.user.email ?? "",
        full_name: p?.full_name ?? "",
        phone: p?.phone ?? null,
        matricula: p?.matricula ?? null,
        city: p?.city ?? null,
        active: p?.active ?? true,
        assinatura: p?.assinatura ?? null,
        roles: roleList,
        isAdmin,
        isSupervisor,
        isViewer,
        canViewDashboard: isAdmin || isSupervisor || isViewer,
        canViewAllChecklists: isAdmin || isSupervisor || isViewer,
        canViewEquipment: isAdmin || isSupervisor || isViewer,
        canCreateChecklist: isAdmin || roleList.includes("tecnico"),
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
