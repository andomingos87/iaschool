import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, UserCheck } from "lucide-react";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import type { ReviewFace, ReviewStudentGroup } from "@/lib/data";

interface ReviewStudentCardProps {
  group: ReviewStudentGroup;
  /** `faceId` → URL assinada do recorte; sem recorte, cai para a miniatura. */
  cropUrls: Map<string, string>;
  thumbUrls: Map<string, string>;
  pending: boolean;
  /** Confirma as marcadas; as desmarcadas vão para a fila individual. */
  onConfirm: (faceIds: string[], deferred: string[]) => void;
  onOpenPhoto: (face: ReviewFace) => void;
}

/**
 * Cartão de um aluno na aba padrão da revisão (spec §7.5).
 *
 * A grade é partida por confiança: a faixa alta nasce marcada e o botão de
 * lote a alcança; "precisa de atenção" nasce desmarcada e só entra no lote
 * com clique. Isso não é bypass da D6 — cada linha confirmada continua
 * gravando `reviewed_by` e `reviewed_at`; o que muda é que um ato humano
 * cobre os N recortes que a pessoa olhou nesta grade.
 */
export function ReviewStudentCard({
  group,
  cropUrls,
  thumbUrls,
  pending,
  onConfirm,
  onOpenPhoto,
}: ReviewStudentCardProps) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(group.confident.map((f) => f.id)),
  );
  const all = useMemo(
    () => [...group.confident, ...group.needsAttention],
    [group.confident, group.needsAttention],
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selected = all.filter((f) => checked.has(f.id)).map((f) => f.id);
  const deferred = all.filter((f) => !checked.has(f.id)).map((f) => f.id);

  return (
    <Card className="border-border" data-testid={`card-review-student-${group.studentId}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <UserCheck className="size-4 text-primary" /> {group.studentName}
          </span>
          <Badge variant="outline">
            {all.length === 1 ? "1 foto sugerida" : `${all.length} fotos sugeridas`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FaceGrid
          faces={group.confident}
          checked={checked}
          onToggle={toggle}
          cropUrls={cropUrls}
          thumbUrls={thumbUrls}
          onOpenPhoto={onOpenPhoto}
          studentName={group.studentName}
        />

        {group.needsAttention.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-amber-600" />
              Precisa de atenção — {group.needsAttention.length}
            </p>
            <p className="text-xs text-muted-foreground">
              A semelhança ficou abaixo do corte ou muito perto de outro aluno.
              Marque só o que você reconhecer; o resto vai para a fila de exceção.
            </p>
            <FaceGrid
              faces={group.needsAttention}
              checked={checked}
              onToggle={toggle}
              cropUrls={cropUrls}
              thumbUrls={thumbUrls}
              onOpenPhoto={onOpenPhoto}
              studentName={group.studentName}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => onConfirm(selected, deferred)}
            disabled={pending || selected.length === 0}
            data-testid={`button-confirm-student-${group.studentId}`}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirmar {selected.length} {selected.length === 1 ? "foto" : "fotos"}
          </Button>
          {deferred.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {deferred.length} {deferred.length === 1 ? "desmarcada vai" : "desmarcadas vão"} para a
              fila de exceção.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FaceGrid({
  faces,
  checked,
  onToggle,
  cropUrls,
  thumbUrls,
  onOpenPhoto,
  studentName,
}: {
  faces: ReviewFace[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  cropUrls: Map<string, string>;
  thumbUrls: Map<string, string>;
  onOpenPhoto: (face: ReviewFace) => void;
  studentName: string;
}) {
  if (faces.length === 0) return null;
  return (
    // Célula de 160px para cima: recorte pequeno demais não é revisão, é
    // carimbo — a pessoa precisa enxergar que é outra criança (§7.5).
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {faces.map((face) => {
        const url = cropUrls.get(face.id) ?? thumbUrls.get(face.photoId);
        const isChecked = checked.has(face.id);
        return (
          <div
            key={face.id}
            className={`overflow-hidden rounded-md border ${
              isChecked ? "border-primary" : "border-border"
            }`}
            data-testid={`review-face-${face.id}`}
          >
            <button
              type="button"
              onClick={() => onToggle(face.id)}
              className="relative block w-full"
              aria-pressed={isChecked}
              aria-label={`${isChecked ? "Desmarcar" : "Marcar"} foto de ${studentName}`}
            >
              <div className="aspect-square min-h-[150px] bg-muted">
                {url ? (
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              {/* Marcador desenhado, não um <Checkbox>: a célula inteira já é
                  o botão, e um controle dentro de outro é HTML inválido. */}
              <span
                aria-hidden
                className={`absolute left-2 top-2 grid size-5 place-content-center rounded-sm border ${
                  isChecked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/80"
                }`}
              >
                {isChecked ? <Check className="size-3.5" /> : null}
              </span>
            </button>
            <div className="flex items-center justify-between gap-1 px-2 py-1">
              <span className="text-[11px] text-muted-foreground">
                {face.matchScore != null ? `semelhança ${face.matchScore.toFixed(2)}` : "sem nota"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-[11px]"
                onClick={() => onOpenPhoto(face)}
              >
                ver foto
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
