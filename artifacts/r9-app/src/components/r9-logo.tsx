import { cn } from "@workspace/iasport/lib/utils";

const LOGO_SRC = `${import.meta.env.BASE_URL}iasport-logo-color.png`;

/** Marca oficial IAsport (logotipo enviado pelo usuário) + selo R9 Escolinhas. */
export function R9Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <img
        src={LOGO_SRC}
        alt="IAsport"
        className={cn("h-6 w-auto", className)}
      />
    );
  }
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <img src={LOGO_SRC} alt="IAsport" className="h-7 w-auto self-start" />
      <span className="text-xs text-muted-foreground">R9 Escolinhas</span>
    </div>
  );
}
