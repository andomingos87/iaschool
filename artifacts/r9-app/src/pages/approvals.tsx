import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  GraduationCap,
  Inbox,
  Link2,
  Loader2,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@workspace/iasport/components/ui/card";
import { Badge } from "@workspace/iasport/components/ui/badge";
import { Button } from "@workspace/iasport/components/ui/button";
import { Spinner } from "@workspace/iasport/components/ui/spinner";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { getDataLayer } from "@/lib/data";
import type { PendingRegistration, StudentAccountOverview } from "@/lib/data";

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

  // Contas de aluno já aprovadas, com o estado do vínculo feito pela escola.
  const accounts = useQuery({
    queryKey: ["student-accounts"],
    queryFn: () => getDataLayer().approvals.listStudentAccounts(),
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
      void queryClient.invalidateQueries({ queryKey: ["student-accounts"] });
      toast({
        title: action === "approve" ? "Cadastro aprovado" : "Cadastro recusado",
        description:
          action === "approve"
            ? "O usuário já pode entrar no app."
            : "O usuário verá que o cadastro não foi aprovado.",
      });
      void queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
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
        description="Cadastros de escolas e alunos aguardando sua aprovação."
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
              Novos cadastros de escolas e alunos aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((reg: PendingRegistration) => (
            <Card key={reg.id} className="border-border">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {reg.role === "student" ? (
                    <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" />
                  ) : (
                    <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium" data-testid={`text-pending-name-${reg.id}`}>
                        {reg.name}
                      </p>
                      <Badge variant="secondary">
                        {reg.role === "student" ? "Aluno" : "Escola"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {reg.email}
                      {reg.role === "student" && reg.schoolLabel
                        ? ` · ${reg.schoolLabel}`
                        : ""}
                      {" · "}
                      {formatDate(reg.createdAt)}
                    </p>
                    {reg.role === "student" && (
                      <p
                        className="mt-0.5 text-xs text-muted-foreground"
                        data-testid={`text-link-status-${reg.id}`}
                      >
                        {reg.studentRecordLabel
                          ? `Vinculado ao registro: ${reg.studentRecordLabel}`
                          : "Sem vínculo com registro de aluno — a escola vincula após a aprovação."}
                      </p>
                    )}
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

      <div className="mt-10">
        <h2 className="mb-1 text-lg font-semibold">Contas de aluno aprovadas</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Vínculo entre a conta e o registro de aluno, feito pela escola na tela
          de Alunos.
        </p>
        {accounts.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6 text-primary" />
          </div>
        ) : accounts.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar as contas de aluno.
              </p>
              <Button
                variant="outline"
                onClick={() => accounts.refetch()}
                data-testid="button-accounts-retry"
              >
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        ) : (accounts.data?.length ?? 0) === 0 ? (
          <Card className="border-dashed border-border">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma conta de aluno aprovada ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(accounts.data ?? []).map((acc: StudentAccountOverview) => (
              <Card key={acc.id} className="border-border">
                <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="font-medium" data-testid={`text-account-name-${acc.id}`}>
                        {acc.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {acc.email}
                        {acc.schoolLabel ? ` · ${acc.schoolLabel}` : ""}
                      </p>
                    </div>
                  </div>
                  {acc.studentRecordId ? (
                    <Badge
                      variant="secondary"
                      className="shrink-0 gap-1"
                      data-testid={`badge-account-linked-${acc.id}`}
                    >
                      <Link2 className="size-3" />
                      {acc.studentRecordLabel
                        ? `Vinculado a ${acc.studentRecordLabel}`
                        : "Vinculado"}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-muted-foreground"
                      data-testid={`badge-account-unlinked-${acc.id}`}
                    >
                      Sem vínculo
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
