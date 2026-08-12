import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  Loader2,
  UserPlus,
  Clock,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iasport/components/ui/select";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { getDataLayer } from "@/lib/data";
import type { SchoolOption } from "@/lib/data";

const schoolSchema = z.object({
  schoolName: z.string().min(2, "Informe o nome da escola"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
});
type SchoolValues = z.infer<typeof schoolSchema>;

const studentSchema = z.object({
  name: z.string().min(2, "Informe seu nome completo"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
  schoolId: z.string().min(1, "Escolha sua escola"),
});
type StudentValues = z.infer<typeof studentSchema>;

type Kind = "school" | "student";

export function SignupCard({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [schools, setSchools] = useState<SchoolOption[] | null>(null);
  const [schoolsError, setSchoolsError] = useState(false);

  useEffect(() => {
    if (kind !== "student" || schools) return;
    let active = true;
    setSchoolsError(false);
    getDataLayer()
      .auth.listApprovedSchools()
      .then((s) => active && setSchools(s))
      .catch(() => active && setSchoolsError(true));
    return () => {
      active = false;
    };
  }, [kind, schools]);

  const schoolForm = useForm<SchoolValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: { schoolName: "", email: "", password: "" },
  });
  const studentForm = useForm<StudentValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: { name: "", email: "", password: "", schoolId: "" },
  });

  async function submit(input: Parameters<ReturnType<typeof getDataLayer>["auth"]["signUp"]>[0]) {
    setSubmitting(true);
    try {
      await getDataLayer().auth.signUp(input);
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
            da R9 vai liberar seu acesso — depois disso é só entrar com seu
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

  if (!kind) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>Como você quer usar o R9 Escolinhas?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            onClick={() => setKind("school")}
            className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-primary/60"
            data-testid="button-signup-school"
          >
            <Building2 className="size-6 shrink-0 text-primary" />
            <span>
              <span className="block font-medium">Sou escola</span>
              <span className="block text-sm text-muted-foreground">
                Gerencio alunos e gero posts da minha escolinha
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKind("student")}
            className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-primary/60"
            data-testid="button-signup-student"
          >
            <GraduationCap className="size-6 shrink-0 text-primary" />
            <span>
              <span className="block font-medium">Sou aluno</span>
              <span className="block text-sm text-muted-foreground">
                Quero ver meu perfil e os posts gerados sobre mim
              </span>
            </span>
          </button>
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
        </CardContent>
      </Card>
    );
  }

  if (kind === "school") {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Cadastro de escola</CardTitle>
          <CardDescription>
            O acesso é liberado após aprovação do administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...schoolForm}>
            <form
              onSubmit={schoolForm.handleSubmit((v) =>
                submit({ kind: "school", ...v }),
              )}
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
                        placeholder="Ex.: R9 Osasco"
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
                      <Input
                        type="password"
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
                onClick={() => setKind(null)}
                data-testid="button-signup-school-back"
              >
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Cadastro de aluno</CardTitle>
        <CardDescription>
          Escolha sua escola. O acesso é liberado após aprovação do
          administrador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...studentForm}>
          <form
            onSubmit={studentForm.handleSubmit((v) =>
              submit({ kind: "student", ...v }),
            )}
            className="space-y-4"
          >
            <FormField
              control={studentForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Como você está cadastrado na escola"
                      data-testid="input-signup-student-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={studentForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="voce@exemplo.com.br"
                      autoComplete="email"
                      data-testid="input-signup-student-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={studentForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••"
                      autoComplete="new-password"
                      data-testid="input-signup-student-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={studentForm.control}
              name="schoolId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Escola</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-signup-student-school">
                        <SelectValue
                          placeholder={
                            schoolsError
                              ? "Erro ao carregar escolas"
                              : schools
                                ? schools.length === 0
                                  ? "Nenhuma escola disponível ainda"
                                  : "Escolha sua escola"
                                : "Carregando escolas..."
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(schools ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {schoolsError && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => {
                        setSchools(null);
                        setSchoolsError(false);
                      }}
                    >
                      Tentar de novo
                    </button>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="button-signup-student-submit"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Criar conta de aluno
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setKind(null)}
              data-testid="button-signup-student-back"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
