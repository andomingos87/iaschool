import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Info, Loader2, Save } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Card, CardContent } from "@workspace/iaschool-ui/components/ui/card";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iaschool-ui/components/ui/form";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iaschool-ui/components/ui/select";
import { Switch } from "@workspace/iaschool-ui/components/ui/switch";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/data-state";
import { ReferenceCoverageNotice } from "@/components/reference-coverage-notice";
import { useAuth } from "@/hooks/use-auth";
import { useClasses } from "@/hooks/use-classes";
import { useCreateEvent } from "@/hooks/use-events";
import { EVENT_RETENTION_YEARS, classLabel } from "@/lib/data";
import { localIsoDate, localIsoDatePlusYears } from "@/lib/format";
import { CalendarDays } from "lucide-react";

const NO_CLASS = "__none__";

const schema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome ao evento (ex.: Festa Junina)"),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do evento"),
    classId: z.string(),
    photoRetentionUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe até quando as fotos ficam guardadas"),
    keepOriginals: z.boolean(),
    imageRights: z.boolean(),
  })
  .refine((v) => v.photoRetentionUntil > v.eventDate, {
    path: ["photoRetentionUntil"],
    message: "A retenção precisa ser depois da data do evento",
  });
type FormValues = z.infer<typeof schema>;

/**
 * Novo evento (spec §10, `/eventos/novo`): nome, data, turma, retenção com
 * padrão de 2 anos editável e a declaração de direito de imagem (§9.2). A
 * declaração não é obrigatória para criar, mas sem ela o upload não abre.
 */
export default function EventNewPage() {
  const [, navigate] = useLocation();
  const { session } = useAuth();
  const classes = useClasses();
  const create = useCreateEvent();
  const hasSchool = Boolean(session?.activeSchoolId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      eventDate: localIsoDate(),
      classId: NO_CLASS,
      photoRetentionUntil: localIsoDatePlusYears(EVENT_RETENTION_YEARS),
      keepOriginals: false,
      imageRights: false,
    },
  });

  const selectedClassId = form.watch("classId");
  const classId = selectedClassId === NO_CLASS ? undefined : selectedClassId;

  const classOptions = useMemo(
    () => (classes.data ?? []).map((c) => ({ id: c.id, label: `${c.schoolYear} · ${classLabel(c)}` })),
    [classes.data],
  );

  async function onSubmit(values: FormValues) {
    try {
      const created = await create.mutateAsync({
        name: values.name,
        eventDate: values.eventDate,
        classId,
        photoRetentionUntil: values.photoRetentionUntil,
        keepOriginals: values.keepOriginals,
        declareImageRights: values.imageRights,
      });
      toast({
        title: "Evento criado",
        description: values.imageRights
          ? "Pode começar a subir as fotos."
          : "Declare o direito de imagem na tela do evento para abrir o upload.",
      });
      navigate(`/eventos/${created.id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível criar o evento",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  if (!hasSchool) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Novo evento" />
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="Nenhuma escola selecionada"
          description="Selecione a escola no topo da tela para criar um evento."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/eventos" data-testid="link-back-events">
          <ArrowLeft className="size-4" /> Eventos
        </Link>
      </Button>
      <PageHeader
        title="Novo evento"
        description="As fotos que você subir ficam neste evento até a data de retenção."
      />

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do evento *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Festa Junina 2026" data-testid="input-event-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="eventDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data do evento *</FormLabel>
                      <FormControl>
                        <Input type="date" data-testid="input-event-date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Turma</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-class">
                            <SelectValue placeholder="Toda a escola" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_CLASS}>Toda a escola</SelectItem>
                          {classOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Opcional. Ajuda o reconhecimento a buscar só entre os alunos da sala.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <ReferenceCoverageNotice classId={classId} />

              <FormField
                control={form.control}
                name="photoRetentionUntil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guardar as fotos até *</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-event-retention" {...field} />
                    </FormControl>
                    <FormDescription>
                      Padrão de {EVENT_RETENTION_YEARS} anos a partir de hoje. Vencido o prazo, as fotos
                      e tudo que foi derivado delas são apagados.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="keepOriginals"
                render={({ field }) => (
                  <FormItem className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
                    <div className="space-y-1">
                      <FormLabel>Guardar os arquivos originais</FormLabel>
                      <FormDescription>
                        Por padrão só a versão otimizada (2560px) é guardada. Manter o original
                        multiplica o espaço usado por cerca de 7.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-event-keep-originals"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imageRights"
                render={({ field }) => (
                  <FormItem className="rounded-md border border-border bg-muted/30 p-4">
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(v) => field.onChange(v === true)}
                          data-testid="checkbox-event-image-rights"
                          className="mt-0.5"
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="font-medium">
                          Declaro que a escola possui autorização de uso de imagem dos alunos
                          presentes neste evento
                        </FormLabel>
                        <FormDescription className="flex gap-2">
                          <Info className="mt-0.5 size-4 shrink-0" />
                          <span>
                            Subir a foto de um aluno já é tratamento de imagem de menor. Esta
                            declaração fica registrada com seu nome e a data; sem ela o upload
                            não abre. Ela não substitui o termo assinado pelo responsável.
                          </span>
                        </FormDescription>
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" asChild>
                  <Link href="/eventos" data-testid="button-cancel-event">
                    Cancelar
                  </Link>
                </Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-save-event">
                  {create.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Criar evento
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
