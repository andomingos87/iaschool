import { cn } from "@workspace/iasport/lib/utils";

/** Marca R9 Escolinhas em tokens da marca (verde neon + foreground). */
export function R9Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
        R9
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight text-foreground">
            R9 Escolinhas
          </span>
          <span className="text-xs text-muted-foreground">powered by IAsport</span>
        </div>
      )}
    </div>
  );
}
