import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iasport/components/ui/form";
import { PasswordInput } from "@workspace/iasport/components/ui/password-input";
import { Button } from "@workspace/iasport/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { BrandLogo } from "@/components/brand-logo";
import { iaschool } from "@/config/iaschool";
import { getDataLayer } from "@/lib/data";
import { clearRecoveryPending } from "@/lib/recovery";

const schema = z
  .object({
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem",
  });
type FormValues = z.infer<typeof schema>;

/**
 * Tela aberta pelo link de recuperação de senha do e-mail.
 * O usuário já chega com uma sessão de recuperação ativa; aqui ele define a
 * nova senha e segue para o app.
 */
export default function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      await getDataLayer().auth.updatePassword(values.password);
      clearRecoveryPending();
      toast({
        title: "Senha atualizada!",
        description: "Sua nova senha já está valendo.",
      });
      onDone();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível atualizar a senha",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo className="scale-125" />
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Definir nova senha
            </CardTitle>
            <CardDescription>
              Escolha uma nova senha para a sua conta {iaschool.brand.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nova senha</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder="••••••"
                          autoComplete="new-password"
                          data-testid="input-new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar nova senha</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder="••••••"
                          autoComplete="new-password"
                          data-testid="input-confirm-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                  data-testid="button-save-password"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  Salvar nova senha
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
