// Seletor para vincular manualmente uma conta de aluno cadastrada (profiles)
// a um registro da tabela students — usado quando o vínculo automático por
// nome falha na aprovação.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/iasport/components/ui/dialog";
import { Button } from "@workspace/iasport/components/ui/button";
import { Spinner } from "@workspace/iasport/components/ui/spinner";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { getDataLayer } from "@/lib/data";
import type { LinkableStudentAccount, Student } from "@/lib/data";
import { qk } from "@/lib/query-keys";

interface Props {
  student: Student | null;
  onOpenChange: (open: boolean) => void;
}

export function LinkStudentAccountDialog({ student, onOpenChange }: Props) {
  const open = Boolean(student);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const accounts = useQuery({
    queryKey: qk.linkableStudentAccounts,
    queryFn: () => getDataLayer().approvals.listLinkableStudentAccounts(),
    enabled: open,
  });

  const link = useMutation({
    mutationFn: (profileId: string) =>
      getDataLayer().approvals.linkStudentAccount(profileId, student!.id),
    onSuccess: () => {
      toast({
        title: "Conta vinculada",
        description: `A conta agora está ligada ao registro de ${student?.name}.`,
      });
      void queryClient.invalidateQueries({
        queryKey: qk.linkableStudentAccounts,
      });
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Não foi possível vincular",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  function handleOpenChange(o: boolean) {
    if (!o) setSelectedId(null);
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular conta de aluno</DialogTitle>
          <DialogDescription>
            Escolha a conta aprovada que corresponde ao registro de{" "}
            <span className="font-medium text-foreground">{student?.name}</span>.
            O aluno passará a ver os próprios dados e posts na área dele.
          </DialogDescription>
        </DialogHeader>

        {accounts.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6 text-primary" />
          </div>
        ) : accounts.isError ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar as contas de aluno.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => accounts.refetch()}
              data-testid="button-retry-linkable"
            >
              Tentar de novo
            </Button>
          </div>
        ) : (accounts.data?.length ?? 0) === 0 ? (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="text-no-linkable-accounts"
          >
            Nenhuma conta de aluno aprovada sem vínculo. Contas novas aparecem
            aqui depois de aprovadas pelo administrador.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto" role="radiogroup">
            {(accounts.data ?? []).map((acc: LinkableStudentAccount) => (
              <button
                key={acc.id}
                type="button"
                role="radio"
                aria-checked={selectedId === acc.id}
                onClick={() => setSelectedId(acc.id)}
                className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                  selectedId === acc.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
                data-testid={`option-link-account-${acc.id}`}
              >
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {acc.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {acc.email}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            data-testid="button-cancel-link"
          >
            Cancelar
          </Button>
          <Button
            disabled={!selectedId || link.isPending}
            onClick={() => selectedId && link.mutate(selectedId)}
            data-testid="button-confirm-link"
          >
            {link.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Link2 className="size-4" />
            )}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
