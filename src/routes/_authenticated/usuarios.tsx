import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, KeyRound, UserPlus } from "lucide-react";

import {
  adminListUsers,
  adminCreateUser,
  adminIssueCredentialsForExistingUser,
} from "@/lib/user-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  ssr: false,
  component: UsuariosPage,
});

type IssuedCredentials = {
  user_id: string;
  login: string;
  temp_password: string;
  auth_email: string;
};

function UsuariosPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminListUsers(),
  });
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"tecnico" | "supervisor" | "admin">("tecnico");

  const createMutation = useMutation({
    mutationFn: () =>
      adminCreateUser({ data: { full_name: fullName, provider_id: null, role } }),
    onSuccess: (result) => {
      setIssued(result);
      setCreateOpen(false);
      setFullName("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Não foi possível criar o usuário."),
  });

  const issueMutation = useMutation({
    mutationFn: (userId: string) =>
      adminIssueCredentialsForExistingUser({ data: { user_id: userId } }),
    onSuccess: (result) => {
      setIssued(result);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Não foi possível gerar credenciais para este usuário."),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Criação de login/senha é exclusiva de admin/supervisor. Novas
            contas nunca são criadas pelo usuário — nem pela tela de login,
            nem pelo Google.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-user-name">Nome completo</Label>
                <Input
                  id="new-user-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                O login (TEC01, TEC02...) e uma senha temporária são gerados
                automaticamente. O usuário será obrigado a trocar a senha no
                primeiro acesso.
              </p>
              <Button
                className="w-full"
                disabled={!fullName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Criar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {issued && (
        <Card className="border-amber-400 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">Credenciais geradas</CardTitle>
            <CardDescription>
              Anote e entregue agora — a senha temporária não é mostrada de
              novo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <strong>Login:</strong> {issued.login}
            </p>
            <p>
              <strong>Senha temporária:</strong>{" "}
              <code className="rounded bg-white px-1.5 py-0.5">
                {issued.temp_password}
              </code>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setIssued(null)}
            >
              Ok, entendi
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todos os usuários</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQuery.data ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.full_name || u.email}</TableCell>
                    <TableCell>{u.login ?? "—"}</TableCell>
                    <TableCell>
                      {!u.login ? (
                        <Badge variant="secondary">Só Google</Badge>
                      ) : u.must_change_password ? (
                        <Badge variant="outline">Senha temporária pendente</Badge>
                      ) : (
                        <Badge>Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!u.login && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={issueMutation.isPending}
                          onClick={() => issueMutation.mutate(u.id)}
                        >
                          <KeyRound className="mr-2 h-3.5 w-3.5" />
                          Gerar login/senha
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
