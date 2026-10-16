import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/iaschool-ui/components/ui/tabs";
import { ErrorState } from "./data-state";
import {
  getGenerationBatchService,
  type GenerationPhotoChoice,
} from "@/lib/generation-batches";
import type { Student } from "@/lib/data";
export function GenerationPhotoPicker({
  student,
  onSelect,
  onClose,
}: {
  student: Student;
  onSelect: (photo: GenerationPhotoChoice) => void;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [failed, setFailed] = useState<string[]>([]);
  const [eventId, setEventId] = useState("all");
  const query = useQuery({
    queryKey: [
      "generation-photo-choices",
      session?.user.id,
      student.schoolId,
      student.id,
    ],
    queryFn: () => getGenerationBatchService().photos(student.id),
    retry: false,
    staleTime: 0,
  });
  const photos = query.data?.photos ?? [];
  const events = [
    ...new Map(
      photos
        .filter((p) => p.source === "event" && p.eventId)
        .map((p) => [p.eventId!, p.eventName ?? "Evento"]),
    ).entries(),
  ];
  const render = (list: GenerationPhotoChoice[], empty: string) =>
    list.length ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((p, index) => (
          <button
            type="button"
            key={`${p.source}:${p.id}`}
            disabled={failed.includes(`${p.source}:${p.id}`)}
            onClick={() => onSelect(p)}
            className="overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img
              onError={() =>
                setFailed((previous) => [...previous, `${p.source}:${p.id}`])
              }
              src={p.url}
              alt={`Escolher foto ${index + 1} de ${student.name}`}
              loading="lazy"
              className="aspect-square w-full object-contain"
            />
            <span className="block p-2 text-xs text-muted-foreground">
              {p.source === "profile"
                ? "Foto do perfil"
                : p.source === "reference_face"
                  ? "Rosto de referência"
                  : (p.eventName ?? "Foto de evento")}
            </span>
          </button>
        ))}
      </div>
    ) : (
      <p className="p-4 text-sm text-muted-foreground">{empty}</p>
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolha a foto de {student.name}</DialogTitle>
          <DialogDescription>
            A foto de perfil é a padrão. O rosto de referência é um recorte e
            pode deixar a arte mais fechada no rosto. Em eventos, veja todos ou
            escolha um.
          </DialogDescription>
        </DialogHeader>
        {failed.length > 0 && (
          <div role="alert" className="text-sm">
            Uma foto não carregou.
            <Button
              variant="outline"
              onClick={() => {
                setFailed([]);
                void query.refetch();
              }}
            >
              Atualizar fotos
            </Button>
          </div>
        )}
        {query.isLoading ? (
          <p role="status">Carregando as fotos…</p>
        ) : query.isError ? (
          <ErrorState
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <Tabs defaultValue="perfil">
            <TabsList className="w-full">
              <TabsTrigger value="perfil" className="flex-1">
                Perfil
              </TabsTrigger>
              <TabsTrigger value="rosto" className="flex-1">
                Rosto de referência
              </TabsTrigger>
              <TabsTrigger value="events" className="flex-1">
                Eventos
              </TabsTrigger>
            </TabsList>
            <TabsContent value="perfil">
              {render(
                photos.filter((p) => p.source === "profile"),
                "Nenhuma foto de perfil disponível.",
              )}
            </TabsContent>
            <TabsContent value="rosto">
              <p className="mb-3 text-sm text-muted-foreground">
                O recorte de rosto deixa a arte mais fechada no rosto.
              </p>
              {render(
                photos.filter((p) => p.source === "reference_face"),
                "Nenhum rosto de referência disponível.",
              )}
            </TabsContent>
            <TabsContent value="events">
              <label
                htmlFor="generation-event-filter"
                className="mb-2 block text-sm font-medium"
              >
                Evento
              </label>
              <select
                id="generation-event-filter"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="mb-3 h-11 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">Todos os eventos</option>
                {events.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              {render(
                photos.filter(
                  (p) =>
                    p.source === "event" &&
                    (eventId === "all" || p.eventId === eventId),
                ),
                "Nenhuma foto de evento neste filtro.",
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
