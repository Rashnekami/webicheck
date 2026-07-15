import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "tecnico";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  matricula: string | null;
  city: string | null;
  active: boolean;
  roles: AppRole[];
  isAdmin: boolean;
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
      return {
        id: auth.user.id,
        email: profile?.email ?? auth.user.email ?? "",
        full_name: profile?.full_name ?? "",
        phone: profile?.phone ?? null,
        matricula: profile?.matricula ?? null,
        city: profile?.city ?? null,
        active: profile?.active ?? true,
        roles: roleList,
        isAdmin: roleList.includes("admin"),
      };
    },
    staleTime: 60_000,
  });
}
