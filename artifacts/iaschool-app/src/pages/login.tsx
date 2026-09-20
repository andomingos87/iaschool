import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, LogIn, MailCheck, ShieldCheck } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iaschool-ui/components/ui/form";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { PasswordInput } from "@workspace/iaschool-ui/components/ui/password-input";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { BrandLogo } from "@/components/brand-logo";
import { iaschool } from "@/config/iaschool";
import { DemoIndicator } from "@/components/demo-indicator";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer } from "@/lib/data";
import { SignupCard } from "@/pages/signup";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(4, "A senha deve ter ao menos 4 caracteres"),
});
type FormValues = z.infer<typeof schema>;

const forgotSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});
type ForgotValues = z.infer<typeof forgotSchema>;

const DEMO_USERS = [
  { email: "admin@iaschool.demo", role: "Administrador IAschool" },
  { email: "professor@iaschool.demo", role: "Professor da Escola Horizonte" },
  { email: "aluno@iaschool.demo", role: "Aluno Demo" },
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const isMock = getDataLayer().isMock;
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "sent" | "signup">(
    "login",
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const forgotForm = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onForgotSubmit(values: ForgotValues) {
    setSubmitting(true);
    try {
      await getDataLayer().auth.resetPassword(values.email);
      setMode("sent");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível enviar o e-mail",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

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
          <BrandLogo className="scale-125" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === "signup" ? "Criar conta" : "Faça seu login"}
            </h1>
          </div>
        </div>

        {mode === "signup" ? (
          <SignupCard onBack={() => setMode("login")} />
        ) : mode === "sent" ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailCheck className="size-5 text-primary" />
                E-mail enviado
              </CardTitle>
              <CardDescription>
                Se o e-mail estiver cadastrado, você receberá um link para
                definir uma nova senha. Confira também a caixa de spam.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setMode("login")}
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="size-4" />
                Voltar ao login
              </Button>
            </CardContent>
          </Card>
        ) : mode === "forgot" ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Recuperar senha</CardTitle>
              <CardDescription>
                Informe seu e-mail e enviaremos um link para você definir uma
                nova senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...forgotForm}>
                <form
                  onSubmit={forgotForm.handleSubmit(onForgotSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={forgotForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="voce@iaschool.com.br"
                            autoComplete="email"
                            data-testid="input-forgot-email"
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
                    data-testid="button-send-recovery"
                  >
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MailCheck className="size-4" />
                    )}
                    Enviar link de recuperação
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setMode("login")}
                    data-testid="button-cancel-forgot"
                  >
                    <ArrowLeft className="size-4" />
                    Voltar ao login
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : (
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Acesse com sua conta {iaschool.brand.name}.</CardDescription>
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
                          placeholder="voce@iaschool.com.br"
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
                        <PasswordInput
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
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="block w-full text-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                  data-testid="button-forgot-password"
                >
                  Esqueci minha senha
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    data-testid="button-create-account"
                  >
                    Criar conta
                  </button>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
        )}

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
