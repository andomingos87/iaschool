import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import { Skeleton } from "@workspace/iasport/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@workspace/iasport/components/ui/empty";

/** Estado de erro padrão com botão "Tentar de novo". */
export function ErrorState({
  message = "Não foi possível carregar os dados.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <Empty className="border border-dashed border-border bg-card/50">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/15 text-destructive">
          <AlertTriangle className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Algo deu errado</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry} variant="outline" data-testid="button-retry">
          <RefreshCw className="size-4" /> Tentar de novo
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Estado vazio amigável com CTA opcional. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="border border-dashed border-border bg-card/50">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-accent text-accent-foreground">
          {icon}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Grade de skeletons para listas em carregamento. */
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Skeletons em grade de imagens (galerias). */
export function GallerySkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-lg" />
      ))}
    </div>
  );
}
