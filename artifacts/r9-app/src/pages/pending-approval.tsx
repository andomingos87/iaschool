import { Clock, LogOut, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { Button } from "@workspace/iasport/components/ui/button";
import { R9Logo } from "@/components/r9-logo";
import { DemoIndicator } from "@/components/demo-indicator";
import { useAuth } from "@/hooks/use-auth";

/**
 * Tela exibida para contas logadas ainda não aprovadas (ou recusadas).
 * Nenhum dado do app é acessível nesses estados (RLS + AuthGate).
 */
export default function PendingApprovalPage() {
  const { session, signOut } = useAuth();
  const rejected = session?.user.approvalStatus === "rejected";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute right-4 top-4">
        <DemoIndicator />
      </div>
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <R9Logo className="scale-125" />
        </div>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {rejected ? (
                <XCircle className="size-5 text-destructive" />
              ) : (
                <Clock className="size-5 text-primary" />
              )}
              {rejected ? "Cadastro não aprovado" : "Aguardando aprovação"}
            </CardTitle>
            <CardDescription data-testid="text-approval-status">
              {rejected
                ? "Seu cadastro foi recusado pelo administrador. Se você acredita que houve um engano, entre em contato com a R9."
                : "Seu cadastro foi recebido! O acesso será liberado assim que o administrador da R9 aprovar sua conta. Volte a entrar mais tarde."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signOut()}
              data-testid="button-pending-signout"
            >
              <LogOut className="size-4" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
