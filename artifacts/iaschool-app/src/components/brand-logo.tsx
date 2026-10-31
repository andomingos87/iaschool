import { cn } from "@workspace/iaschool-ui/lib/utils";
import { iaschool } from "@/config/iaschool";

/** Marca AIESCOLA: SVGs em `public/brand/`, com versão própria para o tema escuro. */
export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className={className}>
        <img
          src="/brand/aiescola-simbolo.svg"
          alt={iaschool.brand.name}
          className="size-8 shrink-0"
        />
      </span>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <img
        src="/brand/aiescola-logo.svg"
        alt={iaschool.brand.name}
        className="h-8 w-auto dark:hidden"
      />
      <img
        src="/brand/aiescola-logo-escuro.svg"
        alt={iaschool.brand.name}
        className="hidden h-8 w-auto dark:block"
      />
    </div>
  );
}
