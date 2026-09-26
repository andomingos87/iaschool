import { useEffect, useMemo, useState } from "react";
import {
  Baby,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SkipForward,
  UserRoundX,
} from "lucide-react";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iaschool-ui/components/ui/select";
import { Kbd } from "@workspace/iaschool-ui/components/ui/kbd";
import { useFaceCandidates } from "@/hooks/use-face-review";
import type { FaceRejectState, ReviewFace, Student } from "@/lib/data";

interface ReviewFaceQueueProps {
  faces: ReviewFace[];
  students: Student[];
  cropUrls: Map<string, string>;
  thumbUrls: Map<string, string>;
  pending: boolean;
  onConfirm: (faceId: string, studentId: string) => void;
  onReject: (faceId: string, state: FaceRejectState) => void;
}

/**
 * Fila individual (spec §7.5, aba de exceção): atende os rostos sem
 * correspondência e os que a pessoa desmarcou no cartão do aluno.
 *
 * Teclado, porque é aqui que o tempo vai embora: `←/→` navega, `1..3`
 * escolhe candidato, `N` marca "criança de fora" e `A`, "adulto / equipe".
 *
 * A ação "não é aluno" é dupla de propósito: o sistema não sabe — e, por
 * decisão de projeto, não pode descobrir — quem é adulto. O `genderage` do
 * `buffalo_l` foi apagado da imagem do worker para não inferir idade de
 * rosto de criança (§9.1). Quem separa o irmão de 5 anos da professora é a
 * pessoa que revisa.
 */
export function ReviewFaceQueue({
  faces,
  students,
  cropUrls,
  thumbUrls,
  pending,
  onConfirm,
  onReject,
}: ReviewFaceQueueProps) {
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState<string>("");
  const current = faces[Math.min(index, Math.max(faces.length - 1, 0))];
  const candidatesQuery = useFaceCandidates(current?.id ?? null);

  // Quando a lista encolhe (o item atual saiu da fila), o cursor acompanha.
  useEffect(() => {
    if (index > 0 && index >= faces.length) setIndex(Math.max(faces.length - 1, 0));
  }, [faces.length, index]);

  useEffect(() => {
    setManual("");
  }, [current?.id]);

  const candidates = useMemo(() => {
    const fromRpc = candidatesQuery.data ?? [];
    if (fromRpc.length > 0) return fromRpc;
    // Sem vetor não há busca: sobra o que o worker já tinha gravado na linha.
    const out: Array<{ studentId: string; studentName: string; sim: number }> = [];
    if (current?.studentId) {
      out.push({
        studentId: current.studentId,
        studentName: current.studentName ?? "Aluno",
        sim: current.matchScore ?? 0,
      });
    }
    if (current?.runnerUpStudentId) {
      out.push({
        studentId: current.runnerUpStudentId,
        studentName: current.runnerUpName ?? "Aluno",
        sim: current.runnerUpScore ?? 0,
      });
    }
    return out;
  }, [candidatesQuery.data, current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || pending) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, faces.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (["1", "2", "3"].includes(e.key)) {
        const pick = candidates[Number(e.key) - 1];
        if (pick) onConfirm(current.id, pick.studentId);
      } else if (e.key.toLowerCase() === "n") onReject(current.id, "not_a_student");
      else if (e.key.toLowerCase() === "a") onReject(current.id, "adult_or_staff");
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, current, faces.length, onConfirm, onReject, pending]);

  if (!current) return null;

  const cropUrl = cropUrls.get(current.id);
  const photoUrl = thumbUrls.get(current.photoId);

  return (
    <Card className="border-border" data-testid="card-review-queue">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>
            Rosto {index + 1} de {faces.length}
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              aria-label="Rosto anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIndex((i) => Math.min(i + 1, faces.length - 1))}
              disabled={index >= faces.length - 1}
              aria-label="Próximo rosto"
            >
              <ChevronRight className="size-4" />
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-md border border-border bg-muted">
            <div className="aspect-square">
              {cropUrl ?? photoUrl ? (
                <img
                  src={cropUrl ?? photoUrl}
                  alt="Rosto em revisão"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              detecção {current.detScore.toFixed(2)}
            </p>
          </div>
          <div className="overflow-hidden rounded-md border border-border bg-muted">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Foto inteira"
                className="max-h-[320px] w-full object-contain"
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                A foto inteira ainda não tem miniatura.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">De quem é este rosto?</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sem candidato: este rosto não corresponde a nenhuma referência, e o
              sistema não guarda biometria de quem não autorizou. Escolha o aluno na
              lista abaixo.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidates.slice(0, 3).map((c, i) => (
                <Button
                  key={c.studentId}
                  variant="outline"
                  onClick={() => onConfirm(current.id, c.studentId)}
                  disabled={pending}
                  data-testid={`button-candidate-${c.studentId}`}
                >
                  <Kbd>{i + 1}</Kbd> {c.studentName}
                  <Badge variant="secondary">{c.sim.toFixed(2)}</Badge>
                </Button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={manual} onValueChange={setManual}>
              <SelectTrigger className="w-64" data-testid="select-review-student">
                <SelectValue placeholder="Corrigir para outro aluno" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => manual && onConfirm(current.id, manual)}
              disabled={pending || !manual}
              data-testid="button-confirm-manual"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            onClick={() => onReject(current.id, "not_a_student")}
            disabled={pending}
            data-testid="button-not-a-student"
          >
            <Baby className="size-4" /> Criança de fora <Kbd>N</Kbd>
          </Button>
          <Button
            variant="outline"
            onClick={() => onReject(current.id, "adult_or_staff")}
            disabled={pending}
            data-testid="button-adult-or-staff"
          >
            <UserRoundX className="size-4" /> Adulto / equipe <Kbd>A</Kbd>
          </Button>
          <Button
            variant="ghost"
            onClick={() => onReject(current.id, "rejected")}
            disabled={pending}
            data-testid="button-reject-face"
          >
            <SkipForward className="size-4" /> Ignorar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          "Criança de fora" sai borrada na entrega; "adulto / equipe" sai nítido. Os dois
          apagam o recorte e o vetor na hora — a caixa do rosto fica, porque é ela que
          permite desfocar depois.
        </p>
      </CardContent>
    </Card>
  );
}
