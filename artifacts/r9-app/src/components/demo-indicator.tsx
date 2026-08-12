import { Database } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/iasport/components/ui/tooltip";
import { getDataLayer } from "@/lib/data";

/** Indicador discreto e permanente de modo demonstração (dados locais). */
export function DemoIndicator() {
  if (!getDataLayer().isMock) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-muted-foreground"
          data-testid="indicator-demo"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <Database className="size-3.5" />
          <span className="hidden sm:inline">Modo demonstração</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        Modo demonstração (dados locais — Supabase ainda não conectado)
      </TooltipContent>
    </Tooltip>
  );
}
