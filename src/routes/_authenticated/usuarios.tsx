import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Search, ShieldCheck, UserCog, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  type AdminUserRecord,
  type ManagedUserRole,
  listAdminUsers,
  updateAdminUser,
} from "@/lib/admin-users.functions";
import { PROFILE_CITIES, isKnownProfileCity } from "@/lib/profile-cities";

const ROLE_LABEL: Record<ManagedUserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  visualizador: "Visualizador / NOC",
  tecnico: "Técnico",
};

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [{ title: "Usuários — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

type UserDraft = {
  email: string;
  fullName: string;
  phone: string;
  matricula: string;
  city: string;
  active: boolean;
  role: ManagedUserRole;
};

function toDraft(user: AdminUserRecord): UserDraft {
  return {
    email: user.email,
    fullName: user.full_name,
    phone: user.phone ?? "",
    matricula: user.matricula ?? "",
    city: user.city ?? "",
    active: user.active,
    role: user.role,
  };
}

function UsersPage() {
  const { data: currentUser, isLoading: loadingCurrentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listAdminUsers(),
    enabled: currentUser?.isAdmin === true,
  });

  const updateUser = useMutation({
    mutationFn: async ({ user, values }: { user: AdminUserRecord; values: UserDraft }) =>
      updateAdminUser({
        data: {
          userId: user.id,
          email: values.email,
          fullName: values.fullName,
          phone: values.phone,
          matricula: values.matricula,
          city: values.city,
          active: values.active,
          role: values.role,
        },
      }),
    onSuccess: async () => {
      toast.success("Usuário atualizado.");
      setEditing(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return usersQuery.data ?? [];
    return (usersQuery.data ?? []).filter((user) =>
      [user.full_name, user.email, user.matricula ?? "", user.city ?? ""].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(term),
      ),
    );
  }, [search, usersQuery.data]);

  function openEditor(user: AdminUserRecord) {
    setEditing(user);
    setDraft(toDraft(user));
  }

  function save() {
    if (!editing || !draft) return;
    const deactivating = editing.active && !draft.active;
    if (
      deactivating &&
      !window.confirm(
        `Inativar o acesso de ${editing.full_name}? Os tokens do Webi Diagnostic também serão revogados.`,
      )
    ) {
      return;
    }
    updateUser.mutate({ user: editing, values: draft });
  }

  if (loadingCurrentUser) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser?.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <UserX className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground">
              Somente administradores podem gerenciar usuários.
            </p>
            <Button asChild>
              <Link to="/painel">Voltar ao painel</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = usersQuery.data?.filter((user) => user.active).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/painel">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <UserCog className="h-6 w-6 text-primary" />
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Consulte, edite, ative ou inative os acessos cadastrados.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="secondary">{usersQuery.data?.length ?? 0} cadastrados</Badge>
          <Badge className="bg-emerald-500/15 text-emerald-700">{activeCount} ativos</Badge>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, e-mail, matrícula ou cidade"
        />
      </div>

      {usersQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando usuários…
        </div>
      )}

      {usersQuery.isError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar os usuários: {(usersQuery.error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filteredUsers.map((user) => (
          <Card key={user.id} className={!user.active ? "opacity-70" : ""}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{user.full_name}</p>
                    {user.role === "admin" && (
                      <Badge className="bg-primary/10 text-primary">
                        <ShieldCheck className="mr-1 h-3 w-3" /> Admin
                      </Badge>
                    )}
                    {user.role !== "admin" && (
                      <Badge variant="outline">{ROLE_LABEL[user.role]}</Badge>
                    )}
                    <Badge
                      variant={user.active ? "default" : "secondary"}
                      className={user.active ? "bg-emerald-500/15 text-emerald-700" : undefined}
                    >
                      {user.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {user.matricula && <p>Matrícula: {user.matricula}</p>}
                  {user.city && <p>Cidade: {user.city}</p>}
                  {user.phone && <p>Telefone: {user.phone}</p>}
                  <p>Cadastro: {new Date(user.created_at).toLocaleDateString("pt-BR")}</p>
                  {!user.has_profile && (
                    <p className="font-medium text-amber-700">
                      Perfil incompleto — revise antes de ativar.
                    </p>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => openEditor(user)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Editar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!usersQuery.isLoading && filteredUsers.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      )}

      <Dialog
        open={Boolean(editing && draft)}
        onOpenChange={(open) => {
          if (!open && !updateUser.isPending) {
            setEditing(null);
            setDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Alterações de acesso passam a valer imediatamente.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-name">Nome completo</Label>
                <Input
                  id="user-name"
                  value={draft.fullName}
                  onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-email">E-mail</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-phone">Telefone</Label>
                <Input
                  id="user-phone"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-registration">Matrícula</Label>
                <Input
                  id="user-registration"
                  value={draft.matricula}
                  onChange={(event) => setDraft({ ...draft, matricula: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-city">Cidade</Label>
                <select
                  id="user-city"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft.city}
                  onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                >
                  <option value="">Selecione a cidade</option>
                  {draft.city && !isKnownProfileCity(draft.city) && (
                    <option value={draft.city}>{draft.city} (cadastro antigo)</option>
                  )}
                  {PROFILE_CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Perfil</Label>
                <select
                  id="user-role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft.role}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      role: event.target.value as ManagedUserRole,
                    })
                  }
                >
                  <option value="tecnico">Técnico</option>
                  <option value="visualizador">Visualizador / NOC — somente leitura</option>
                  <option value="supervisor">Supervisor — fiscalização</option>
                  <option value="admin">Administrador</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Visualizadores e supervisores acessam dashboard, equipamentos e checklists sem
                  alterar os registros.
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-active">Situação do acesso</Label>
                <select
                  id="user-active"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft.active ? "active" : "inactive"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      active: event.target.value === "active",
                    })
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
                {!draft.active && (
                  <p className="text-xs text-amber-700">
                    O login será bloqueado e as chaves de integração ativas serão revogadas.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
              disabled={updateUser.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={updateUser.isPending || !draft?.email.trim() || !draft?.fullName.trim()}
            >
              {updateUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
