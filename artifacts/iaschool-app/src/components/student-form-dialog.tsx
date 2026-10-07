import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Combobox } from "@workspace/iaschool-ui/components/ui/combobox";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { MultiUpload } from "@/components/multi-upload";
import { useCreateStudent, useUpdateStudent } from "@/hooks/use-students";
import { useClasses } from "@/hooks/use-classes";
import { GRADE_LABEL } from "@/lib/data";
import type { Student, StoredImage } from "@/lib/data";
import { BUCKETS } from "@/lib/constants";
import { ageBracket, AGE_BRACKET_LABEL, requiresGuardianConsent } from "@/lib/eca";
import { enqueueProfileReference } from "@/lib/enqueue-profile-reference";
import {
  brDateToIso,
  isoToBrDate,
  maskDate,
  maskWhatsapp,
  storedToMasked,
} from "@/lib/format";
import {
  buildStudentInput,
  EMPTY_STUDENT_FORM,
  NO_CLASS,
  studentFormSchema,
  type StudentFormValues,
} from "@/lib/student-form";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student | null;
}

export function StudentFormDialog({ open, onOpenChange, student }: Props) {
  const create = useCreateStudent();
  const update = useUpdateStudent();
  const queryClient = useQueryClient();
  // Ao editar, as turmas são as da escola do aluno (pode não ser a ativa).
  const classes = useClasses(student?.schoolId);
  const [photos, setPhotos] = useState<StoredImage[]>([]);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: EMPTY_STUDENT_FORM,
  });

  useEffect(() => {
    if (!open) return;
    if (student) {
      form.reset({
        name: student.name,
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
      });
      setPhotos(student.photos ?? []);
    } else {
      form.reset(EMPTY_STUDENT_FORM);
      setPhotos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const saving = create.isPending || update.isPending;

  // A data digitada decide, em tempo real, se o bloco do responsável aparece.
  const birthIso = brDateToIso(form.watch("birthDate") ?? "");
  const bracket = ageBracket(birthIso);
  const needsGuardian = requiresGuardianConsent(birthIso);

  async function onSubmit(values: StudentFormValues) {
    const payload = buildStudentInput(values, student, photos);
    try {
      const saved = student
        ? await update.mutateAsync({ id: student.id, patch: payload })
        : await create.mutateAsync(payload);
      toast({
        title: student ? "Aluno atualizado" : "Aluno cadastrado",
        description: values.name,
      });
      if (saved.photos[0]) {
        try {
          const decision = await enqueueProfileReference(saved);
          if (decision === "enqueue") {
            void queryClient.invalidateQueries({ queryKey: ["reference-faces"] });
            toast({
              title: "Foto de perfil na fila",
              description: "Ela entrou como rosto de referência e aguarda o processamento.",
            });
          }
        } catch (err) {
          toast({
            variant: "destructive",
            title: "Aluno salvo, referência não entrou na fila",
            description:
              err instanceof Error ? err.message : "Tente de novo na aba Rosto de referência.",
          });
        }
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
            Nome e data de nascimento são obrigatórios. Aluno menor de 18
            anos precisa do responsável, com nome e WhatsApp.
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
                  <FormControl>
                    <Combobox
                      value={field.value || NO_CLASS}
                      onValueChange={field.onChange}
                      placeholder="Sem turma"
                      data-testid="select-student-class"
                      options={[
                        { value: NO_CLASS, label: "Sem turma", pinned: true },
                        ...(classes.data ?? []).map((c) => ({
                          value: c.id,
                          label: `${GRADE_LABEL[c.grade] ?? c.grade} · ${c.name} (${c.schoolYear})`,
                        })),
                      ]}
                    />
                  </FormControl>
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
                      Aluno menor de 18 anos. O WhatsApp do responsável é o
                      canal de contato. Reconhecimento e envio ficam na ficha,
                      cada um com o seu aceite (Lei nº 15.211/2025, art. 24).
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
