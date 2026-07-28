import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { changeOwnPassword, getMyAuthStatus } from "@/lib/self-service-auth.functions";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/trocar-senha")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Trocar senha — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: TrocarSenhaPage,
});

const schema = z
  .object({
    newPassword: z.string().min(8, "A senha deve ter pelo menos 8 caracteres").max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

function TrocarSenhaPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      setChecking(false);
    });
  }, [navigate]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    try {
      await changeOwnPassword({ data: { newPassword: values.newPassword } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
      return;
    }
    toast.success("Senha alterada com sucesso.");
    const status = await getMyAuthStatus();
    if (status.must_change_password) {
      toast.error("A troca não foi confirmada pelo servidor. Tente novamente.");
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  if (checking) {
    return (
      <div className="brand-gradient flex min-h-screen items-center justify-center">
        <WebifibraLogo size={72} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center text-white">
          <WebifibraLogo size={72} />
          <h1 className="text-2xl font-bold tracking-tight">Troque sua senha</h1>
        </div>
        <Card className="shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle>Primeiro acesso</CardTitle>
            <CardDescription>
              Sua senha temporária precisa ser trocada antes de continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("newPassword")}
                />
                {form.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("confirmPassword")}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar e continuar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
