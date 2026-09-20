import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iaschool-ui/components/ui/form";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { Textarea } from "@workspace/iaschool-ui/components/ui/textarea";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iaschool-ui/components/ui/select";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { MultiUpload } from "@/components/multi-upload";
import { useCreateStudent, useUpdateStudent } from "@/hooks/use-students";
import { useClasses } from "@/hooks/use-classes";
import { GRADE_LABEL } from "@/lib/data";
import type { Student, StoredImage, StudentInput } from "@/lib/data";
import { BUCKETS } from "@/lib/constants";
import { ageBracket, AGE_BRACKET_LABEL, requiresGuardianConsent } from "@/lib/eca";
import {
  brDateToIso,
  isoToBrDate,
  isValidWhatsapp,
  maskDate,
  maskWhatsapp,
  storedToMasked,
  whatsappToStored,
} from "@/lib/format";

/** Radix Select não aceita valor vazio; "sem turma" precisa de um sentinela. */
const NO_CLASS = "__none__";

/**
 * A data de nascimento passa a ser obrigatória: é ela que define qual proteção
 * etária o produto aplica (Lei nº 15.211/2025, art. 10). Para alunos menores
 * de 18 anos, o responsável legal e a autorização de uso de imagem também são
 * obrigatórios (art. 7º, § 2º; LGPD, art. 14, § 1º).
 */
const schema = z
  .object({
    name: z.string().min(2, "Informe o nome do aluno"),
    whatsapp: z.string().refine(isValidWhatsapp, "WhatsApp inválido — use (11) 99999-9999"),
    birthDate: z
      .string()
      .refine(
        (v) => ageBracket(brDateToIso(v)) !== null,
        "Informe uma data de nascimento válida (dd/mm/aaaa)",
      ),
    notes: z.string().optional(),
    enrollmentNumber: z.string().optional(),
    classId: z.string().optional(),
    guardianName: z.string().optional(),
    guardianWhatsapp: z.string().optional(),
    guardianEmail: z.string().optional(),
    guardianRelationship: z.string().optional(),
    guardianConsent: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!requiresGuardianConsent(brDateToIso(v.birthDate))) return;
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
    if (!v.guardianConsent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianConsent"],
        message: "Registre a autorização do responsável",
      });
    }
  });
type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  whatsapp: "",
  birthDate: "",
  notes: "",
  enrollmentNumber: "",
  classId: NO_CLASS,
  guardianName: "",
  guardianWhatsapp: "",
  guardianEmail: "",
  guardianRelationship: "",
  guardianConsent: false,
};

/**
 * Monta o responsável a partir do formulário.
 * `consentAt` e `whatsappVerifiedAt` são carimbos de tempo: uma vez gravados,
 * só mudam por ação explícita. Desmarcar a autorização revoga o consentimento
 * (LGPD, art. 8º, § 5º) e, com ele, a verificação do canal — o envio volta a
 * ficar bloqueado.
 */
function buildGuardian(
  values: FormValues,
  student: Student | null,
): Student["guardian"] {
  if (!requiresGuardianConsent(brDateToIso(values.birthDate))) return undefined;
  const previous = student?.guardian;
  const whatsapp = whatsappToStored(values.guardianWhatsapp!);
  // Trocar o número invalida a verificação anterior.
  const sameNumber = previous?.whatsapp === whatsapp;
  const consent = Boolean(values.guardianConsent);
  return {
    name: values.guardianName!.trim(),
    whatsapp,
    email: values.guardianEmail?.trim() || undefined,
    relationship: values.guardianRelationship?.trim() || undefined,
    consentAt: consent
      ? (previous?.consentAt ?? new Date().toISOString())
      : undefined,
    consentRegisteredBy: consent ? previous?.consentRegisteredBy : undefined,
    whatsappVerifiedAt:
      consent && sameNumber ? previous?.whatsappVerifiedAt : undefined,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student | null;
}

export function StudentFormDialog({ open, onOpenChange, student }: Props) {
  const create = useCreateStudent();
  const update = useUpdateStudent();
  // Ao editar, as turmas são as da escola do aluno (pode não ser a ativa).
  const classes = useClasses(student?.schoolId);
  const [photos, setPhotos] = useState<StoredImage[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (student) {
      form.reset({
        name: student.name,
        whatsapp: storedToMasked(student.whatsapp),
        birthDate: isoToBrDate(student.birthDate),
        notes: student.notes ?? "",
        enrollmentNumber: student.enrollmentNumber ?? "",
        classId: student.classId ?? NO_CLASS,
        guardianName: student.guardian?.name ?? "",
        guardianWhatsapp: student.guardian?.whatsapp
          ? storedToMasked(student.guardian.whatsapp)
          : "",
        guardianEmail: student.guardian?.email ?? "",
        guardianRelationship: student.guardian?.relationship ?? "",
        guardianConsent: Boolean(student.guardian?.consentAt),
      });
      setPhotos(student.photos ?? []);
    } else {
      form.reset(EMPTY_VALUES);
      setPhotos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const saving = create.isPending || update.isPending;

  // A data digitada decide, em tempo real, se o bloco do responsável aparece.
  const birthIso = brDateToIso(form.watch("birthDate") ?? "");
  const bracket = ageBracket(birthIso);
  const needsGuardian = requiresGuardianConsent(birthIso);

  async function onSubmit(values: FormValues) {
    const payload: StudentInput = {
      name: values.name.trim(),
      whatsapp: whatsappToStored(values.whatsapp),
      birthDate: brDateToIso(values.birthDate) || undefined,
      notes: values.notes?.trim() || undefined,
      enrollmentNumber: values.enrollmentNumber?.trim() || undefined,
      classId: values.classId && values.classId !== NO_CLASS ? values.classId : undefined,
      guardian: buildGuardian(values, student),
      photos,
    };
    try {
      if (student) {
        await update.mutateAsync({ id: student.id, patch: payload });
        toast({ title: "Aluno atualizado", description: values.name });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Aluno cadastrado", description: values.name });
      }
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student ? "Editar aluno" : "Novo aluno"}</DialogTitle>
          <DialogDescription>
            Nome, WhatsApp e data de nascimento são obrigatórios. Alunos
            menores de 18 anos exigem responsável legal e autorização.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" data-testid="input-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp *</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="(11) 99999-9999"
                        data-testid="input-whatsapp"
                        value={field.value}
                        onChange={(e) => field.onChange(maskWhatsapp(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="enrollmentNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Opcional — número na escola"
                        data-testid="input-enrollment-number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de nascimento *</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="dd/mm/aaaa"
                        data-testid="input-birthdate"
                        value={field.value}
                        onChange={(e) => field.onChange(maskDate(e.target.value))}
                      />
                    </FormControl>
                    {bracket && (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid="text-age-bracket"
                      >
                        {AGE_BRACKET_LABEL[bracket]}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="classId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Turma</FormLabel>
                  <Select
                    value={field.value || NO_CLASS}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-student-class">
                        <SelectValue placeholder="Sem turma" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CLASS}>Sem turma</SelectItem>
                      {(classes.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {GRADE_LABEL[c.grade] ?? c.grade} · {c.name} ({c.schoolYear})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(classes.data?.length ?? 0) === 0 && !classes.isLoading && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma turma cadastrada ainda. Crie as turmas em
                      &ldquo;Turmas&rdquo; para poder vincular o aluno.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Turma, série, observações da coordenação..."
                      data-testid="input-notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsGuardian && (
              <div
                className="space-y-4 rounded-md border border-primary/40 bg-accent/30 p-4"
                data-testid="section-student-guardian"
              >
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Responsável legal</p>
                    <p className="text-xs text-muted-foreground">
                      Aluno menor de 18 anos. Sem responsável e autorização
                      registrados, a geração de imagens fica bloqueada
                      (Lei nº 15.211/2025, art. 7º, § 2º).
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="guardianName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do responsável *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nome completo"
                            data-testid="input-guardian-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardianWhatsapp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp do responsável *</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="numeric"
                            placeholder="(11) 99999-9999"
                            data-testid="input-guardian-whatsapp"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(maskWhatsapp(e.target.value))
                            }
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          É para este número — e só para ele — que a imagem
                          gerada pode ser enviada.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardianEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail do responsável</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="responsavel@exemplo.com.br"
                            data-testid="input-guardian-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardianRelationship"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vínculo</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ex.: mãe, pai, avó, tutor"
                            data-testid="input-guardian-relationship"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="guardianConsent"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(Boolean(v))}
                            data-testid="checkbox-guardian-consent"
                          />
                        </FormControl>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          O responsável autorizou o uso da foto e dos dados do
                          aluno para gerar imagens de desempenho e recebê-las
                          por WhatsApp. Desmarcar revoga a autorização e volta a
                          bloquear a geração.
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Fotos do aluno</Label>
              <p className="text-sm text-muted-foreground">
                Use fotos boas — elas aparecem nas imagens geradas.
              </p>
              <MultiUpload
                bucket={BUCKETS.students}
                value={photos}
                onChange={setPhotos}
                data-testid="upload-student-photos"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="button-save-student">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
