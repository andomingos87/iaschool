import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/iasport/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iasport/components/ui/form";
import { Input } from "@workspace/iasport/components/ui/input";
import { Textarea } from "@workspace/iasport/components/ui/textarea";
import { Button } from "@workspace/iasport/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iasport/components/ui/select";
import { Label } from "@workspace/iasport/components/ui/label";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { MultiUpload } from "@/components/multi-upload";
import { useCreateStudent, useUpdateStudent } from "@/hooks/use-students";
import type { Club, Student, StoredImage } from "@/lib/data";
import { POSITIONS, BUCKETS } from "@/lib/constants";
import {
  brDateToIso,
  isoToBrDate,
  isValidWhatsapp,
  maskDate,
  maskWhatsapp,
  storedToMasked,
  whatsappToStored,
} from "@/lib/format";

const NO_CLUB = "__none__";
const NO_POSITION = "__none__";

const schema = z.object({
  name: z.string().min(2, "Informe o nome do aluno"),
  whatsapp: z.string().refine(isValidWhatsapp, "WhatsApp inválido — use (11) 99999-9999"),
  position: z.string().optional(),
  heightCm: z.string().optional(),
  weightKg: z.string().optional(),
  birthDate: z.string().optional(),
  notes: z.string().optional(),
  clubId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student | null;
  clubs: Club[];
}

export function StudentFormDialog({ open, onOpenChange, student, clubs }: Props) {
  const create = useCreateStudent();
  const update = useUpdateStudent();
  const [photos, setPhotos] = useState<StoredImage[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      whatsapp: "",
      position: NO_POSITION,
      heightCm: "",
      weightKg: "",
      birthDate: "",
      notes: "",
      clubId: NO_CLUB,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (student) {
      form.reset({
        name: student.name,
        whatsapp: storedToMasked(student.whatsapp),
        position: student.position || NO_POSITION,
        heightCm: student.heightCm ? String(student.heightCm) : "",
        weightKg: student.weightKg ? String(student.weightKg) : "",
        birthDate: isoToBrDate(student.birthDate),
        notes: student.notes ?? "",
        clubId: student.clubId || NO_CLUB,
      });
      setPhotos(student.photos ?? []);
    } else {
      form.reset({
        name: "",
        whatsapp: "",
        position: NO_POSITION,
        heightCm: "",
        weightKg: "",
        birthDate: "",
        notes: "",
        clubId: NO_CLUB,
      });
      setPhotos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const saving = create.isPending || update.isPending;

  async function onSubmit(values: FormValues) {
    const payload: Omit<Student, "id" | "createdAt" | "updatedAt"> = {
      name: values.name.trim(),
      whatsapp: whatsappToStored(values.whatsapp),
      position: values.position === NO_POSITION ? undefined : values.position,
      heightCm: values.heightCm ? Number(values.heightCm) : undefined,
      weightKg: values.weightKg ? Number(values.weightKg) : undefined,
      birthDate: values.birthDate ? brDateToIso(values.birthDate) || undefined : undefined,
      notes: values.notes?.trim() || undefined,
      clubId: values.clubId === NO_CLUB ? undefined : values.clubId,
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
            Preencha os dados do aluno. Apenas nome e WhatsApp são obrigatórios.
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
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posição</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-position">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_POSITION}>Sem posição</SelectItem>
                        {POSITIONS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clubId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clube</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-club">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_CLUB}>Sem clube</SelectItem>
                        {clubs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="heightCm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Altura (cm)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="175"
                        data-testid="input-height"
                        value={field.value}
                        onChange={(e) =>
                          field.onChange(e.target.value.replace(/\D/g, "").slice(0, 3))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weightKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peso (kg)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="68"
                        data-testid="input-weight"
                        value={field.value}
                        onChange={(e) =>
                          field.onChange(e.target.value.replace(/\D/g, "").slice(0, 3))
                        }
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
                    <FormLabel>Data de nascimento</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="dd/mm/aaaa"
                        data-testid="input-birthdate"
                        value={field.value}
                        onChange={(e) => field.onChange(maskDate(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Pé dominante, características, evolução..."
                      data-testid="input-notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Fotos do aluno</Label>
              <FormDescription>
                Use fotos boas — elas aparecem nas imagens geradas.
              </FormDescription>
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
