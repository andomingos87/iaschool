import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import { Card, CardContent } from "@workspace/iasport/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Compass className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Página não encontrada</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              O endereço que você tentou acessar não existe.
            </p>
          </div>
          <Link href="/" data-testid="link-home">
            <Button>Voltar ao início</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
