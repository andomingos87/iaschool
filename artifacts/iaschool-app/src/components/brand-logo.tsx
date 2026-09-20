import { cn } from "@workspace/iaschool-ui/lib/utils";
import { iaschool } from "@/config/iaschool";

/** Marca vetorial temporária, independente de arquivos da marca anterior. */
export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const mark = (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="size-8 shrink-0"
      fill="none"
    >
      <rect width="40" height="40" rx="12" className="fill-primary" />
      <path d="M11 12.5h18v3H11zM14 18h12v3H14zM11 23.5h18v3H11z" fill="white" />
      <circle cx="29" cy="29" r="6" className="fill-destructive" />
    </svg>
  );

  if (compact) return <span className={className}>{mark}</span>;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {mark}
      <span className="text-lg font-bold tracking-[-0.04em] text-foreground">
        IA<span className="text-primary">school</span>
      </span>
    </div>
  );
}
