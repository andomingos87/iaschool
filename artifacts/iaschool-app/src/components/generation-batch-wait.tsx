import { BATCH_WAIT_LEAVE } from "../lib/generation-phrases";

export function GenerationBatchWait({
  phrase,
  completed,
  total,
}: {
  phrase: string;
  completed: number;
  total: number;
}) {
  return (
    <div className="space-y-2 rounded-lg bg-accent/40 p-4">
      <h2 className="text-lg font-semibold">
        Suas artes estão sendo preparadas.
      </h2>
      <p role="status" className="text-sm">
        {completed} de {total} prontas.
      </p>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {phrase}
      </p>
      <p className="text-sm">{BATCH_WAIT_LEAVE}</p>
    </div>
  );
}
