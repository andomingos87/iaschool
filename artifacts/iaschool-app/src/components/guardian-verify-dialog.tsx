import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { Student } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import { storedToMasked } from "@/lib/format";

/**
 * Confirmação do WhatsApp do responsável legal.
 *
 * Enquanto o número não é confirmado, o envio da imagem do menor fica
 * bloqueado — o produto não pode entregar material de criança ou adolescente
 * a um canal não verificado (Decreto nº 12.880/2026, art. 35).
 */
export function GuardianVerifyDialog({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student | null;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  /** Só existe no modo demo; em produção o código nunca volta ao cliente. */
  const [demoCode, setDemoCode] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setCode("");
    setSent(false);
    setDemoCode(null);
  }, [open]);

  const guardian = student?.guardian;

  async function requestCode() {
    if (!student) return;
    setSending(true);
    try {
      const { demoCode: demo } = await getDataLayer().guardianVerification.requestCode(
        student.id,
      );
      setSent(true);
      setDemoCode(demo ?? null);
      toast({
        title: "Código enviado",
        description: `Enviamos um código para ${storedToMasked(guardian?.whatsapp ?? "")}.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível enviar o código",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSending(false);
    }
  }

  async function confirm() {
    if (!student) return;
    setConfirming(true);
    try {
      await getDataLayer().guardianVerification.confirmCode(student.id, code);
      await queryClient.invalidateQueries({ queryKey: qk.students });
      toast({
        title: "WhatsApp do responsável verificado",
        description: "O envio da imagem está liberado para este número.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível confirmar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            Verificar WhatsApp do responsável
          </DialogTitle>
          <DialogDescription>
            {guardian?.name
              ? `Enviaremos um código de 6 dígitos para ${guardian.name} confirmar que este é o número correto.`
              : "Cadastre o responsável legal do aluno antes de verificar o número."}
          </DialogDescription>
        </DialogHeader>

        {guardian?.whatsapp && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Número informado</p>
              <p className="font-mono text-sm" data-testid="text-guardian-number">
                {storedToMasked(guardian.whatsapp)}
              </p>
            </div>

            {!sent ? (
              <Button
                className="w-full"
                onClick={requestCode}
                disabled={sending}
                data-testid="button-send-guardian-code"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Enviar código
              </Button>
            ) : (
              <div className="space-y-3">
                {demoCode && (
                  <p
                    className="rounded-md border border-dashed border-primary/50 p-2 text-center text-xs text-muted-foreground"
                    data-testid="text-demo-code"
                  >
                    Modo demonstração — o código é{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {demoCode}
                    </span>
                    . Em produção ele só chega ao WhatsApp do responsável.
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="guardian-code">Código recebido</Label>
                  <Input
                    id="guardian-code"
                    inputMode="numeric"
                    placeholder="000000"
                    className="text-center font-mono text-lg tracking-[0.4em]"
                    value={code}
                    maxLength={6}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    data-testid="input-guardian-code"
                  />
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={requestCode}
                  disabled={sending}
                >
                  Enviar outro código
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-guardian-verify-cancel"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={!sent || code.length !== 6 || confirming}
            data-testid="button-guardian-verify-confirm"
          >
            {confirming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
