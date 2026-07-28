import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Loader2, Pencil, Search, ShieldCheck, UserCog, UserX } from "lucide-react";

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
import {
  createTechnicianCredential,
  listProviderLoginAccounts,
  resetTechnicianPassword,
} from "@/lib/technician-credentials.functions";
import { PROFILE_CITIES, isKnownProfileCity } from "@/lib/profile-cities";
import { listProviderSupervisors } from "@/lib/supervisor.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [{ title: "Usuários — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

const ROLE_LABEL: Record<ManagedUserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  noc: "NOC",
  almoxarifado: "Almoxarifado",
  tecnico: "Técnico",
};

type UserDraft = {
  email: string;
  fullName: string;
  phone: string;
  matricula: string;
  city: string;
  active: boolean;
  role: ManagedUserRole;
  supervisorId: string | null;
  supervisorCities: string[];
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
    supervisorId: user.supervisor_id,
    supervisorCities: user.supervisor_cities ?? [],
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

  const accountsQuery = useQuery({
    queryKey: ["provider-login-accounts"],
    queryFn: () => listProviderLoginAccounts(),
    enabled: currentUser?.isAdmin === true,
  });
  const accountByUserId = useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.user_id, a])),
    [accountsQuery.data],
  );

  const [credTarget, setCredTarget] = useState<AdminUserRecord | null>(null);

  const supervisorsQuery = useQuery({
    queryKey: ["provider-supervisors"],
    queryFn: () => listProviderSupervisors(),
    enabled: currentUser?.isAdmin === true,
  });
  const supervisorById = useMemo(
    () => new Map((supervisorsQuery.data ?? []).map((s) => [s.id, s])),
    [supervisorsQuery.data],
  );

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
          supervisorId: values.role === "tecnico" ? values.supervisorId : null,
          supervisorCities: values.role === "supervisor" ? values.supervisorCities : [],
        },
      }),
    onSuccess: async () => {
      toast.success("Usuário atualizado.");
      setEditing(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["provider-supervisors"] });
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
    <div className="webi-page mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/painel">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <span className="webi-icon h-11 w-11">
              <UserCog className="h-5 w-5" />
            </span>
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Consulte, edite, ative ou inative os acessos cadastrados.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="secondary">{usersQuery.data?.length ?? 0} cadastrados</Badge>
          <Badge className="border-emerald-400/30 bg-emerald-500/15 text-emerald-400">
            {activeCount} ativos
          </Badge>
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

      {currentUser && (
        <CityExceptionManager
          providerId={currentUser.provider_id}
          currentUserId={currentUser.id}
          technicians={(usersQuery.data ?? []).map((u) => ({
            id: u.id,
            full_name: u.full_name,
          }))}
        />
      )}

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
          <Card key={user.id} className={`webi-nav-card ${!user.active ? "opacity-65" : ""}`}>
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
                    {user.role === "supervisor" && (
                      <Badge className="border-blue-400/30 bg-blue-500/15 text-blue-300">
                        Supervisor
                      </Badge>
                    )}
                    {user.role === "noc" && (
                      <Badge className="border-purple-400/30 bg-purple-500/15 text-purple-300">
                        NOC
                      </Badge>
                    )}
                    {user.role === "almoxarifado" && (
                      <Badge variant="secondary">Almoxarifado</Badge>
                    )}
                    <Badge
                      variant={user.active ? "default" : "secondary"}
                      className={
                        user.active
                          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-400"
                          : undefined
                      }
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
                  {user.supervisor_id && (
                    <p>Supervisor: {supervisorById.get(user.supervisor_id)?.full_name ?? "—"}</p>
                  )}
                  {user.role === "supervisor" && user.supervisor_cities.length > 0 && (
                    <p>Cidades cobertas: {user.supervisor_cities.join(", ")}</p>
                  )}
                  {accountByUserId.get(user.id) && (
                    <p className="font-mono text-cyan-400">
                      Login: {accountByUserId.get(user.id)!.login}
                    </p>
                  )}
                  {!user.has_profile && (
                    <p className="font-medium text-amber-400">
                      Perfil incompleto — revise antes de ativar.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button size="sm" variant="outline" onClick={() => openEditor(user)}>
                  <Pencil className="mr-1.5 h-4 w-4" /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCredTarget(user)}>
                  <KeyRound className="mr-1.5 h-4 w-4" />
                  {accountByUserId.get(user.id) ? "Redefinir" : "Login/Senha"}
                </Button>
              </div>
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
                  className="flex h-11 w-full rounded-xl border border-blue-400/20 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
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
                  className="flex h-11 w-full rounded-xl border border-blue-400/20 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
                  value={draft.role}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      role: event.target.value as ManagedUserRole,
                    })
                  }
                >
                  <option value="tecnico">Técnico</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="noc">NOC (leitura)</option>
                  <option value="almoxarifado">Almoxarifado (somente trocas)</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {draft.role === "tecnico" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="user-supervisor">Supervisor responsável</Label>
                  <select
                    id="user-supervisor"
                    className="flex h-11 w-full rounded-xl border border-blue-400/20 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
                    value={draft.supervisorId ?? ""}
                    onChange={(e) => setDraft({ ...draft, supervisorId: e.target.value || null })}
                  >
                    <option value="">Sem supervisor</option>
                    {(supervisorsQuery.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                        {s.cities.length ? ` — ${s.cities.join(", ")}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.role === "supervisor" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Cidades cobertas</Label>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-blue-400/20 bg-slate-950/45 p-3">
                    {PROFILE_CITIES.map((city) => {
                      const checked = draft.supervisorCities.includes(city);
                      return (
                        <label
                          key={city}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${
                            checked
                              ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                              : "border-blue-400/20 text-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(draft.supervisorCities);
                              if (e.target.checked) next.add(city);
                              else next.delete(city);
                              setDraft({ ...draft, supervisorCities: Array.from(next) });
                            }}
                          />
                          {city}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O supervisor verá e revisará checklists dos técnicos atribuídos e das cidades marcadas.
                  </p>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-active">Situação do acesso</Label>
                <select
                  id="user-active"
                  className="flex h-11 w-full rounded-xl border border-blue-400/20 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
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
                  <p className="text-xs text-amber-400">
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

      <CredentialDialog
        user={credTarget}
        existingLogin={credTarget ? accountByUserId.get(credTarget.id)?.login ?? null : null}
        onClose={() => setCredTarget(null)}
        onSaved={() => {
          setCredTarget(null);
          queryClient.invalidateQueries({ queryKey: ["provider-login-accounts"] });
        }}
      />
    </div>
  );
}

function CredentialDialog({
  user,
  existingLogin,
  onClose,
  onSaved,
}: {
  user: AdminUserRecord | null;
  existingLogin: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const isReset = Boolean(existingLogin);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário inválido.");
      if (isReset) {
        const accounts = await listProviderLoginAccounts();
        const acc = accounts.find((a) => a.user_id === user.id);
        if (!acc) throw new Error("Credencial não encontrada.");
        return resetTechnicianPassword({ data: { accountId: acc.id, newPassword: password } });
      }
      return createTechnicianCredential({
        data: {
          login,
          password,
          fullName: user.full_name || user.email,
          matricula: user.matricula,
          phone: user.phone,
          city: user.city,
          role: user.role,
          linkToUserId: user.id,
        },
      });
    },
    onSuccess: () => {
      toast.success(isReset ? "Senha redefinida." : "Login criado.");
      setLogin("");
      setPassword("");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          setLogin("");
          setPassword("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReset ? "Redefinir senha" : "Criar login e senha"}</DialogTitle>
          <DialogDescription>
            {isReset
              ? `Nova senha para o login ${existingLogin}.`
              : `Criando credencial interna para ${user?.full_name ?? ""}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!isReset && (
            <div className="space-y-1.5">
              <Label>Login</Label>
              <Input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="ex.: t0112"
                autoComplete="off"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Senha (mín. 8 caracteres)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              password.length < 8 ||
              (!isReset && !/^[a-z0-9._-]{3,40}$/.test(login.trim().toLowerCase()))
            }
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isReset ? "Redefinir" : "Salvar credencial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

