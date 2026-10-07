import { LogOut, School } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { DemoIndicator } from "@/components/demo-indicator";
import { useAuth } from "@/hooks/use-auth";

/**
 * Conta aprovada sem vínculo em `school_members`. Não entra no app vazio
 * e não é deslogada sozinha.
 */
export default function UnlinkedSchoolPage() {
  const { signOut } = useAuth();

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute right-4 top-4">
        <DemoIndicator />
      </div>
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="scale-125" />
        </div>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="size-5 text-primary" />
              Escola não vinculada
            </CardTitle>
            <CardDescription data-testid="text-unlinked-school">
              Sua conta foi aprovada, mas nenhuma escola foi vinculada. Peça ao
              administrador da plataforma para concluir o vínculo. Depois disso,
              saia e entre de novo. Você continua logado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signOut()}
              data-testid="button-unlinked-signout"
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
