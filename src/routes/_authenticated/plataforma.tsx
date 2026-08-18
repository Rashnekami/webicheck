import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2, Plus, Palette, KeyRound, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import {
  createProvider,
  listAllProviders,
  updateProviderBranding,
} from "@/lib/platform-admin.functions";
import {
  createTechnicianCredential,
  deactivateTechnicianCredential,
  listProviderLoginAccounts,
  resetTechnicianPassword,
} from "@/lib/technician-credentials.functions";

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({
    meta: [{ title: "Plataforma — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const { data: user, isLoading } = useCurrentUser();
  const qc = useQueryClient();

  const providersQ = useQuery({
    queryKey: ["platform-providers"],
    queryFn: () => listAllProviders(),
    enabled: user?.isPlatformAdmin === true,
  });

  const accountsQ = useQuery({
    queryKey: ["platform-login-accounts"],
    queryFn: () => listProviderLoginAccounts(),
    enabled: user?.isPlatformAdmin === true || user?.isAdmin === true,
  });

  const [newProviderOpen, setNewProviderOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState<string | null>(null);
  const [credentialOpen, setCredentialOpen] = useState(false);

  if (isLoading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  if (!user?.isPlatformAdmin && !user?.isAdmin) {
    return <div className="p-8 text-center text-sm">Acesso restrito.</div>;
  }

  const providers = providersQ.data ?? [];
  const accounts = accountsQ.data ?? [];

  return (
    <div className="webi-page mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header p-5 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <span className="webi-icon h-11 w-11">
            <Building2 className="h-5 w-5" />
          </span>
          {user.isPlatformAdmin ? "Plataforma" : "Credenciais do provedor"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {user.isPlatformAdmin
            ? "Crie provedores, personalize logo/cores/template do PDF e gere credenciais internas."
            : "Crie logins e senhas para sua equipe."}
        </p>
      </div>

      {user.isPlatformAdmin && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Provedores</h2>
            <Button size="sm" onClick={() => setNewProviderOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo provedor
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {providers.map((p) => (
              <Card key={p.id} className="webi-nav-card">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {p.logo_url && (
                        <img src={p.logo_url} alt="" className="h-8 w-8 rounded object-contain" />
                      )}
                      <span className="font-semibold">{p.name}</span>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Slug: {p.slug} · Template PDF: {p.pdf_template}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      {p.primary_color && (
                        <span
                          className="h-4 w-4 rounded border"
                          style={{ background: p.primary_color }}
                          title={p.primary_color}
                        />
                      )}
                      {p.accent_color && (
                        <span
                          className="h-4 w-4 rounded border"
                          style={{ background: p.accent_color }}
                          title={p.accent_color}
                        />
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setBrandingOpen(p.id)}>
                    <Palette className="mr-1.5 h-4 w-4" /> Personalizar
                  </Button>
                </CardContent>
              </Card>
            ))}
            {providers.length === 0 && !providersQ.isLoading && (
              <p className="text-sm text-muted-foreground">Nenhum provedor cadastrado.</p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Credenciais internas (login/senha)</h2>
          <Button size="sm" onClick={() => setCredentialOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Novo login
          </Button>
        </div>
        <div className="grid gap-2">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} providers={providers} onChanged={() => qc.invalidateQueries({ queryKey: ["platform-login-accounts"] })} />
          ))}
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma credencial interna criada.</p>
          )}
        </div>
      </section>

      {user.isPlatformAdmin && (
        <NewProviderDialog
          open={newProviderOpen}
          onOpenChange={setNewProviderOpen}
          onCreated={() => qc.invalidateQueries({ queryKey: ["platform-providers"] })}
        />
      )}
      {brandingOpen && (
        <BrandingDialog
          providerId={brandingOpen}
          providers={providers}
          onClose={() => setBrandingOpen(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["platform-providers"] });
            setBrandingOpen(null);
          }}
        />
      )}
      <CredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        providers={user.isPlatformAdmin ? providers : []}
        forceProviderId={user.isPlatformAdmin ? null : user.provider_id}
        onCreated={() => qc.invalidateQueries({ queryKey: ["platform-login-accounts"] })}
      />
    </div>
  );
}

function AccountRow({
  account,
  providers,
  onChanged,
}: {
  account: {
    id: string;
    login: string;
    provider_id: string;
    active: boolean;
    supabase_email: string;
  };
  providers: Array<{ id: string; name: string; slug: string }>;
  onChanged: () => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const providerName = providers.find((p) => p.id === account.provider_id)?.name || account.provider_id.slice(0, 8);
  const toggle = useMutation({
    mutationFn: () =>
      deactivateTechnicianCredential({ data: { accountId: account.id, active: !account.active } }),
    onSuccess: () => {
      toast.success(account.active ? "Login desativado." : "Login ativado.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{account.login}</p>
          <p className="text-xs text-muted-foreground">
            {providerName} · {account.active ? "ativo" : "inativo"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
            <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Redefinir senha
          </Button>
          <Button
            size="sm"
            variant={account.active ? "destructive" : "default"}
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
          >
            {account.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </CardContent>
      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        accountId={account.id}
        onDone={onChanged}
      />
    </Card>
  );
}

function ResetPasswordDialog({
  open,
  onOpenChange,
  accountId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  onDone: () => void;
}) {
  const [pwd, setPwd] = useState("");
  const m = useMutation({
    mutationFn: () => resetTechnicianPassword({ data: { accountId, newPassword: pwd } }),
    onSuccess: () => {
      toast.success("Senha redefinida.");
      setPwd("");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>Mínimo de 8 caracteres.</DialogDescription>
        </DialogHeader>
        <Input
          type="text"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="Nova senha"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={pwd.length < 8 || m.isPending}>
            {m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewProviderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [primary, setPrimary] = useState("#00b4ff");
  const [accent, setAccent] = useState("#22d3ee");
  const [tpl, setTpl] = useState<"dark-neon" | "light-classic">("dark-neon");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [publicPrefix, setPublicPrefix] = useState("");
  const [validationPrefix, setValidationPrefix] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      let logoUrl: string | null = null;
      if (logoFile) {
        const path = `${slug || crypto.randomUUID()}/${Date.now()}-${logoFile.name}`;
        const { error } = await supabase.storage
          .from("provider-branding")
          .upload(path, logoFile, { upsert: false });
        if (error) throw error;
        const { data } = await supabase.storage.from("provider-branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        logoUrl = data?.signedUrl || null;
      }
      return createProvider({
        data: {
          name,
          slug,
          primary_color: primary,
          accent_color: accent,
          pdf_template: tpl,
          logo_url: logoUrl,
          public_code_prefix: publicPrefix.trim() || null,
          validation_code_prefix: validationPrefix.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Provedor criado.");
      setName("");
      setSlug("");
      setLogoFile(null);
      setPublicPrefix("");
      setValidationPrefix("");
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo provedor</DialogTitle>
          <DialogDescription>Personalize logo, cores e template do PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome do provedor</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Webifibra" />
          </div>
          <div>
            <Label>Slug (identificador)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="webifibra"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado nos logins internos: <code>login@{slug || "slug"}.checktecnico.local</code>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cor primária</Label>
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-full rounded border"
              />
            </div>
            <div>
              <Label>Cor de destaque</Label>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-full rounded border"
              />
            </div>
          </div>
          <div>
            <Label>Template do PDF</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTpl("dark-neon")}
                className={`rounded border p-3 text-left text-sm ${tpl === "dark-neon" ? "border-primary bg-primary/10" : ""}`}
              >
                <p className="font-semibold">Dark Neon</p>
                <p className="text-xs text-muted-foreground">Tema escuro atual (Webifibra)</p>
              </button>
              <button
                type="button"
                onClick={() => setTpl("light-classic")}
                className={`rounded border p-3 text-left text-sm ${tpl === "light-classic" ? "border-primary bg-primary/10" : ""}`}
              >
                <p className="font-semibold">Light Classic</p>
                <p className="text-xs text-muted-foreground">Tema claro com cabeçalho colorido</p>
              </button>
            </div>
          </div>
          <div>
            <Label>Logo (PNG/JPG, opcional)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prefixo do código público</Label>
              <Input
                value={publicPrefix}
                onChange={(e) =>
                  setPublicPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 15))
                }
                placeholder={slug ? slug.toUpperCase().replace(/[^A-Z]/g, "") : "ex.: FIBRASUL"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Só letras. Em branco, deriva do slug automaticamente. Ex.:{" "}
                <code>{(publicPrefix || slug.toUpperCase().replace(/[^A-Z]/g, "") || "PREFIXO") + "20260001"}</code>
              </p>
            </div>
            <div>
              <Label>Prefixo do código de validação</Label>
              <Input
                value={validationPrefix}
                onChange={(e) =>
                  setValidationPrefix(
                    e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 15),
                  )
                }
                placeholder={slug ? slug.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : "ex.: FSL"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Aparece no QR Code de validação pública, ex.:{" "}
                <code>
                  {(validationPrefix ||
                    slug.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) ||
                    "PRE") + "-20260101-A1B2C3D4"}
                </code>
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={!name || !slug || m.isPending}>
            {m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BrandingDialog({
  providerId,
  providers,
  onClose,
  onSaved,
}: {
  providerId: string;
  providers: Array<{
    id: string;
    name: string;
    primary_color?: string | null;
    accent_color?: string | null;
    pdf_template?: string | null;
    logo_url?: string | null;
    slug: string;
    public_code_prefix?: string | null;
    validation_code_prefix?: string | null;
  }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const provider = providers.find((p) => p.id === providerId);
  const [primary, setPrimary] = useState(provider?.primary_color || "#00b4ff");
  const [accent, setAccent] = useState(provider?.accent_color || "#22d3ee");
  const [tpl, setTpl] = useState<"dark-neon" | "light-classic">(
    (provider?.pdf_template as "dark-neon" | "light-classic") || "dark-neon",
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [publicPrefix, setPublicPrefix] = useState(provider?.public_code_prefix || "");
  const [validationPrefix, setValidationPrefix] = useState(
    provider?.validation_code_prefix || "",
  );

  const m = useMutation({
    mutationFn: async () => {
      let logoUrl: string | null | undefined;
      if (logoFile) {
        const path = `${provider?.slug || providerId}/${Date.now()}-${logoFile.name}`;
        const { error } = await supabase.storage
          .from("provider-branding")
          .upload(path, logoFile, { upsert: false });
        if (error) throw error;
        const { data } = await supabase.storage
          .from("provider-branding")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        logoUrl = data?.signedUrl || null;
      }
      return updateProviderBranding({
        data: {
          providerId,
          primary_color: primary,
          accent_color: accent,
          pdf_template: tpl,
          public_code_prefix: publicPrefix.trim() || null,
          validation_code_prefix: validationPrefix.trim() || null,
          ...(logoUrl !== undefined ? { logo_url: logoUrl } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Personalização salva. Vale só para checklists finalizados a partir de agora.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personalizar {provider?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cor primária</Label>
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-full rounded border"
              />
            </div>
            <div>
              <Label>Cor de destaque</Label>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-full rounded border"
              />
            </div>
          </div>
          <div>
            <Label>Template do PDF</Label>
            <select
              className="mt-1 h-10 w-full rounded border bg-background px-2 text-sm"
              value={tpl}
              onChange={(e) => setTpl(e.target.value as "dark-neon" | "light-classic")}
            >
              <option value="dark-neon">Dark Neon</option>
              <option value="light-classic">Light Classic</option>
            </select>
          </div>
          <div>
            <Label>Trocar logo</Label>
            <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            {provider?.logo_url && (
              <img src={provider.logo_url} alt="" className="mt-2 h-12 w-12 object-contain" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prefixo do código público</Label>
              <Input
                value={publicPrefix}
                onChange={(e) =>
                  setPublicPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 15))
                }
                placeholder={provider?.slug.toUpperCase().replace(/[^A-Z]/g, "")}
              />
            </div>
            <div>
              <Label>Prefixo do código de validação</Label>
              <Input
                value={validationPrefix}
                onChange={(e) =>
                  setValidationPrefix(
                    e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 15),
                  )
                }
                placeholder={provider?.slug.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Muda só os checklists finalizados a partir de agora — o código já emitido não muda
            (é registrado no momento da finalização, como uma nota fiscal).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialDialog({
  open,
  onOpenChange,
  providers,
  forceProviderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providers: Array<{ id: string; name: string }>;
  forceProviderId: string | null;
  onCreated: () => void;
}) {
  const [providerId, setProviderId] = useState(forceProviderId || "");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"tecnico" | "almoxarifado" | "admin" | "rh">("tecnico");
  const [matricula, setMatricula] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  const m = useMutation({
    mutationFn: () =>
      createTechnicianCredential({
        data: {
          providerId: providerId || undefined,
          login,
          password,
          fullName,
          role,
          matricula: matricula || null,
          phone: phone || null,
          city: city || null,
        },
      }),
    onSuccess: () => {
      toast.success(`Credencial ${login} criada.`);
      setLogin("");
      setPassword("");
      setFullName("");
      setMatricula("");
      setPhone("");
      setCity("");
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo login interno</DialogTitle>
          <DialogDescription>
            O técnico entrará no app usando este login e senha, sem precisar do Google.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!forceProviderId && (
            <div>
              <Label>Provedor</Label>
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2 text-sm"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Login (ex.: T0112)</Label>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} />
            </div>
            <div>
              <Label>Senha (mín. 8)</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Matrícula</Label>
              <Input value={matricula} onChange={(e) => setMatricula(e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cidade</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label>Perfil</Label>
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="tecnico">Técnico</option>
                <option value="almoxarifado">Almoxarifado</option>
                <option value="rh">RH</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={
              !login || password.length < 8 || !fullName || (!providerId && !forceProviderId) || m.isPending
            }
          >
            {m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Criar credencial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
