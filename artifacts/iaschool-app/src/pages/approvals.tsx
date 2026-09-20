import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Inbox, Loader2, X } from "lucide-react";
import {
  Card,
  CardContent,
} from "@workspace/iaschool-ui/components/ui/card";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { getDataLayer } from "@/lib/data";
import type { PendingRegistration } from "@/lib/data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-registrations"],
    queryFn: () => getDataLayer().approvals.listPending(),
  });

  const mutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "reject";
    }) => {
      if (action === "approve") await getDataLayer().approvals.approve(id);
      else await getDataLayer().approvals.reject(id);
      return action;
    },
    onSuccess: (action) => {
      toast({
        title: action === "approve" ? "Cadastro aprovado" : "Cadastro recusado",
        description:
          action === "approve"
            ? "A escola foi criada e o usuário já pode entrar no app."
            : "O usuário verá que o cadastro não foi aprovado.",
      });
      void queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-count"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Não foi possível concluir",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  return (
    <div>
      <PageHeader
        title="Aprovações"
        description="Cadastros de escolas aguardando sua aprovação. Ao aprovar, a escola é criada e a pessoa vira administradora dela."
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-8 text-primary" />
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar os cadastros pendentes.
            </p>
            <Button variant="outline" onClick={() => refetch()} data-testid="button-approvals-retry">
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">Nenhum cadastro pendente</p>
            <p className="text-sm text-muted-foreground">
              Novos cadastros de escolas aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((reg: PendingRegistration) => (
            <Card key={reg.id} className="border-border">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium" data-testid={`text-pending-name-${reg.id}`}>
                        {reg.schoolName ?? reg.name}
                      </p>
                      <Badge variant="secondary">Escola</Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {reg.email}
                      {" · "}
                      {formatDate(reg.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: reg.id, action: "approve" })}
                    data-testid={`button-approve-${reg.id}`}
                  >
                    {mutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: reg.id, action: "reject" })}
                    data-testid={`button-reject-${reg.id}`}
                  >
                    <X className="size-4" />
                    Recusar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}
