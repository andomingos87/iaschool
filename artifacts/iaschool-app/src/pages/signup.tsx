import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, UserPlus, Clock } from "lucide-react";
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
import { getDataLayer } from "@/lib/data";

/**
 * Cadastro público. Desde o M1 só existe cadastro de ESCOLA: menor de 16 não
 * tem conta própria (Lei nº 15.211/2025, art. 24) e o aluno é apenas um
 * registro feito pela escola. A conta nasce pendente; ao aprovar, o
 * administrador cria a escola e o vínculo de administrador.
 */
const schoolSchema = z.object({
  schoolName: z.string().min(2, "Informe o nome da escola"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
});
type SchoolValues = z.infer<typeof schoolSchema>;

export function SignupCard({ onBack }: { onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const schoolForm = useForm<SchoolValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: { schoolName: "", email: "", password: "" },
  });

  async function submit(values: SchoolValues) {
    setSubmitting(true);
    try {
      await getDataLayer().auth.signUp({ kind: "school", ...values });
      setDone(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível criar a conta",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Cadastro enviado
          </CardTitle>
          <CardDescription>
            Sua conta foi criada e está aguardando aprovação. O administrador
            da IAschool vai liberar seu acesso — depois disso é só entrar com seu
            e-mail e senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={onBack}
            data-testid="button-signup-back-to-login"
          >
            <ArrowLeft className="size-4" />
            Voltar ao login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Cadastro de escola</CardTitle>
        <CardDescription>
          O acesso é liberado após aprovação do administrador. Alunos não
          criam conta: são cadastrados pela escola.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...schoolForm}>
          <form
            onSubmit={schoolForm.handleSubmit(submit)}
            className="space-y-4"
          >
            <FormField
              control={schoolForm.control}
              name="schoolName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da escola</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Escola Horizonte"
                      data-testid="input-signup-school-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={schoolForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="escola@exemplo.com.br"
                      autoComplete="email"
                      data-testid="input-signup-school-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={schoolForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="••••••"
                      autoComplete="new-password"
                      data-testid="input-signup-school-password"
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
              data-testid="button-signup-school-submit"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Criar conta de escola
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onBack}
              data-testid="button-signup-cancel"
            >
              <ArrowLeft className="size-4" />
              Voltar ao login
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
