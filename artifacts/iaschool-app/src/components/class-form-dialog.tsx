import { useEffect } from "react";
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
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iaschool-ui/components/ui/select";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { useCreateClass, useUpdateClass } from "@/hooks/use-classes";
import { GRADES, GRADE_LABEL, isGrade } from "@/lib/data";
import type { SchoolClass } from "@/lib/data";

/** Ano letivo aceito: do ano passado até dois anos à frente (planejamento). */
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const schema = z.object({
  schoolYear: z
    .number()
    .int()
    .min(2000, "Ano letivo inválido")
    .max(2100, "Ano letivo inválido"),
  // `includes` em vez de `isGrade`: o TypeScript infere type predicate para a
  // arrow e estreitaria o campo para `Grade`, brigando com o valor inicial
  // vazio do formulário. A conversão para `Grade` acontece no submit.
  grade: z
    .string()
    .refine((v) => (GRADES as readonly string[]).includes(v), "Selecione a série"),
  name: z.string().min(1, "Informe o nome da sala (ex.: A, B, Manhã)"),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Sala a editar, ou null para criar. */
  schoolClass: SchoolClass | null;
}

export function ClassFormDialog({ open, onOpenChange, schoolClass }: Props) {
  const create = useCreateClass();
  const update = useUpdateClass();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { schoolYear: CURRENT_YEAR, grade: "", name: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      schoolClass
        ? {
            schoolYear: schoolClass.schoolYear,
            grade: schoolClass.grade,
            name: schoolClass.name,
          }
        : { schoolYear: CURRENT_YEAR, grade: "", name: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schoolClass]);

  const saving = create.isPending || update.isPending;

  async function onSubmit(values: FormValues) {
    if (!isGrade(values.grade)) return;
    const payload = {
      schoolYear: values.schoolYear,
      grade: values.grade,
      name: values.name.trim(),
    };
    try {
      if (schoolClass) {
        await update.mutateAsync({ id: schoolClass.id, patch: payload });
        toast({ title: "Turma atualizada", description: payload.name });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Turma criada", description: payload.name });
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
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schoolClass ? "Editar turma" : "Nova turma"}</DialogTitle>
          <DialogDescription>
            A sala é a turma; a série é um campo dela. Ano letivo, série e nome
            juntos não podem se repetir na escola.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="schoolYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ano letivo *</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-class-year">
                        <SelectValue placeholder="Selecione o ano" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
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
              name="grade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Série *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-class-grade">
                        <SelectValue placeholder="Selecione a série" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {GRADE_LABEL[g]}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da sala *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: A, B, Manhã"
                      data-testid="input-class-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-class"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="button-save-class">
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
