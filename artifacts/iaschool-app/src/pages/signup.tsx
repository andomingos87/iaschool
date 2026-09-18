import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  Loader2,
  ShieldCheck,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iaschool-ui/components/ui/select";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { getDataLayer } from "@/lib/data";
import type { SchoolOption } from "@/lib/data";
import {
  AGE_ACCOUNT_LINK,
  ageBracket,
  requiresGuardianAccount,
} from "@/lib/eca";
import {
  brDateToIso,
  isValidWhatsapp,
  maskDate,
  maskWhatsapp,
  whatsappToStored,
} from "@/lib/format";

const schoolSchema = z.object({
  schoolName: z.string().min(2, "Informe o nome da escola"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
});
type SchoolValues = z.infer<typeof schoolSchema>;

/**
 * Cadastro de aluno. A data de nascimento é obrigatória: sem ela o produto
 * não sabe qual proteção etária aplicar (Lei 15.211/2025, art. 10). Menores
 * de 16 anos só criam conta vinculada a um responsável legal, com autorização
 * registrada (art. 24) — a aprovação da escola não substitui essa autorização.
 */
const studentSchema = z
  .object({
    name: z.string().min(2, "Informe seu nome completo"),
    email: z.string().email("Informe um e-mail válido"),
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
    schoolId: z.string().min(1, "Escolha sua escola"),
    birthDate: z
      .string()
      .refine(
        (v) => ageBracket(brDateToIso(v)) !== null,
        "Informe uma data de nascimento válida (dd/mm/aaaa)",
      ),
    guardianName: z.string().optional(),
    guardianWhatsapp: z.string().optional(),
    guardianEmail: z.string().optional(),
    guardianRelationship: z.string().optional(),
    guardianConsent: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!requiresGuardianAccount(brDateToIso(v.birthDate))) return;
    if (!v.guardianName || v.guardianName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianName"],
        message: "Informe o nome do responsável legal",
      });
    }
    if (!v.guardianWhatsapp || !isValidWhatsapp(v.guardianWhatsapp)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianWhatsapp"],
        message: "WhatsApp do responsável inválido — use (11) 99999-9999",
      });
    }
    if (!v.guardianEmail || !z.string().email().safeParse(v.guardianEmail).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianEmail"],
        message: "Informe um e-mail válido do responsável",
      });
    }
    if (!v.guardianConsent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianConsent"],
        message: "A autorização do responsável é obrigatória",
      });
    }
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
    defaultValues: {
      name: "",
      email: "",
      password: "",
      schoolId: "",
      birthDate: "",
      guardianName: "",
      guardianWhatsapp: "",
      guardianEmail: "",
      guardianRelationship: "",
      guardianConsent: false,
    },
  });

  // A data digitada decide, em tempo real, se o bloco do responsável aparece.
  const birthDateTyped = studentForm.watch("birthDate");
  const needsGuardian = requiresGuardianAccount(brDateToIso(birthDateTyped ?? ""));

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

  if (!kind) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Escolha uma opção</CardTitle>
          <CardDescription>Como você quer usar a plataforma?</CardDescription>
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
                Gerencio alunos e crio artes da minha escola
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
              submit({
                kind: "student",
                name: v.name,
                email: v.email,
                password: v.password,
                schoolId: v.schoolId,
                birthDate: brDateToIso(v.birthDate),
                guardian: requiresGuardianAccount(brDateToIso(v.birthDate))
                  ? {
                      name: v.guardianName!.trim(),
                      whatsapp: whatsappToStored(v.guardianWhatsapp!),
                      email: v.guardianEmail!.trim(),
                      relationship: v.guardianRelationship?.trim() || undefined,
                      consent: Boolean(v.guardianConsent),
                    }
                  : undefined,
              }),
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
                    <PasswordInput
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
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de nascimento</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="dd/mm/aaaa"
                      autoComplete="bday"
                      data-testid="input-signup-student-birthdate"
                      {...field}
                      onChange={(e) => field.onChange(maskDate(e.target.value))}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Usada apenas para aplicar as proteções previstas no Estatuto
                    Digital da Criança e do Adolescente. Não aparece nas imagens
                    geradas.
                  </p>
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
            {needsGuardian && (
              <div
                className="space-y-4 rounded-md border border-primary/40 bg-accent/30 p-4"
                data-testid="section-signup-guardian"
              >
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Responsável legal</p>
                    <p className="text-xs text-muted-foreground">
                      Menores de {AGE_ACCOUNT_LINK} anos só podem ter conta
                      vinculada a um responsável legal (Lei nº 15.211/2025,
                      art. 24). A aprovação da escola não substitui esta
                      autorização.
                    </p>
                  </div>
                </div>
                <FormField
                  control={studentForm.control}
                  name="guardianName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do responsável</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nome completo"
                          data-testid="input-signup-guardian-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={studentForm.control}
                  name="guardianWhatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp do responsável</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          placeholder="(11) 99999-9999"
                          data-testid="input-signup-guardian-whatsapp"
                          {...field}
                          onChange={(e) =>
                            field.onChange(maskWhatsapp(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={studentForm.control}
                  name="guardianEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail do responsável</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="responsavel@exemplo.com.br"
                          data-testid="input-signup-guardian-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={studentForm.control}
                  name="guardianRelationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vínculo (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex.: mãe, pai, avó, tutor"
                          data-testid="input-signup-guardian-relationship"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={studentForm.control}
                  name="guardianConsent"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(Boolean(v))}
                            data-testid="checkbox-signup-guardian-consent"
                          />
                        </FormControl>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          Declaro ser o responsável legal e autorizo a escola a
                          usar a foto e os dados do aluno para gerar imagens de
                          desempenho no IAschool, e a enviá-las ao meu WhatsApp.
                          Posso revogar esta autorização a qualquer momento.
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
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
