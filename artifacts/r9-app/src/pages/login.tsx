import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iasport/components/ui/form";
import { Input } from "@workspace/iasport/components/ui/input";
import { Button } from "@workspace/iasport/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { R9Logo } from "@/components/r9-logo";
import { DemoIndicator } from "@/components/demo-indicator";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer } from "@/lib/data";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(4, "A senha deve ter ao menos 4 caracteres"),
});
type FormValues = z.infer<typeof schema>;

const DEMO_USERS = [
  { email: "admin@r9.com.br", role: "Administrador R9" },
  { email: "escola@r9.com.br", role: "Escolinha R9 Osasco" },
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const isMock = getDataLayer().isMock;
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      await signIn(values.email, values.password);
      toast({ title: "Bem-vindo de volta!", description: "Login efetuado com sucesso." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível entrar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(email: string) {
    form.setValue("email", email);
    form.setValue("password", "demo1234");
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute right-4 top-4">
        <DemoIndicator />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <R9Logo className="scale-125" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Ferramenta de bastidor
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre alunos, gerencie clubes e gere posts com métricas em segundos.
            </p>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Acesse com sua conta R9.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="voce@r9.com.br"
                          autoComplete="email"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••"
                          autoComplete="current-password"
                          data-testid="input-password"
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
                  data-testid="button-login"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LogIn className="size-4" />
                  )}
                  Entrar
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {isMock && (
        <Card className="border-dashed border-border bg-muted/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-primary" />
              Credenciais de demonstração
            </CardTitle>
            <CardDescription>
              Qualquer senha com 4+ caracteres. Toque para preencher.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => fillDemo(u.email)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/60"
                data-testid={`button-demo-${u.email}`}
              >
                <span className="font-medium">{u.email}</span>
                <span className="text-xs text-muted-foreground">{u.role}</span>
              </button>
            ))}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
