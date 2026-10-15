import { useEffect, useRef, useState } from "react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import { getDataLayer } from "@/lib/data";
import { regionContainsFace, regionValidationError, type PersonRegion, type PersonRegionKind, type PhotoPersonReview } from "@/lib/data/review-media";

const labels: Record<PersonRegionKind, string> = {
  protected_unknown: "Pessoa desconhecida — proteger",
  other_child: "Outra criança — proteger",
  own_child: "Aluno confirmado — nítido só para seu responsável",
  adult_or_staff: "Adulto/equipe conferido pela escola — nítido",
};

/** Coordenadas são pixels do original orientado; inputs são alternativa ao gesto. */
export function PhotoPersonRegionEditor({ photoId, onSaved }: { photoId: string; onSaved?: (review: PhotoPersonReview) => void }) {
  const [review, setReview] = useState<PhotoPersonReview | null>(null);
  const [regions, setRegions] = useState<PersonRegion[]>([]);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<"rect" | "polygon">("rect");
  const [drawing, setDrawing] = useState<number[][]>([]);
  const [polygonTexts, setPolygonTexts] = useState<Record<number, string>>({});
  const currentPhoto = useRef(photoId); currentPhoto.current = photoId;
  useEffect(() => {
    let active = true;
    setLoading(true); setSaving(false); setReview(null); setError(""); setImageReady(false); setDrawing([]); setPolygonTexts({});
    void getDataLayer().reviewMedia.photoReview(photoId).then(value => {
      if (!active) return;
      setReview(value); setRegions(value.regions); setComplete(value.all_people_reviewed && value.reviewed_version === value.regions_version);
    }).catch(() => { if (active) setError("Não foi possível abrir a revisão desta foto. Tente novamente."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [photoId, reload]);
  function change(index: number, patch: Partial<PersonRegion>) { setRegions(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r)); setComplete(false); setError(""); }
  function add(points?: number[] | number[][]) {
    if (!review) return;
    setRegions(prev => [...prev, { face_id: null, student_id: null, kind: "protected_unknown", shape: mode, points: points ?? (mode === "rect" ? [0, 0, Math.max(1, Math.round(review.width / 4)), Math.max(1, Math.round(review.height / 2))] : [[0, 0], [review.width / 4, 0], [review.width / 4, review.height / 2], [0, review.height / 2]]) }]);
    setComplete(false); setDrawing([]);
  }
  function coordinate(event: React.PointerEvent<SVGSVGElement>) {
    if (!review || saving || !imageReady) return;
    const box = event.currentTarget.getBoundingClientRect();
    // SVG preserveAspectRatio="none": os limites coincidem com a imagem.
    const point = [Math.max(0, Math.min(review.width, Math.round((event.clientX - box.left) / box.width * review.width))), Math.max(0, Math.min(review.height, Math.round((event.clientY - box.top) / box.height * review.height)))];
    if (mode === "rect" && drawing.length) {
      const first = drawing[0]!;
      const points = [Math.min(first[0]!, point[0]!), Math.min(first[1]!, point[1]!), Math.abs(first[0]! - point[0]!), Math.abs(first[1]! - point[1]!)];
      if (points[2]! > 0 && points[3]! > 0) add(points); else setError("Marque dois cantos diferentes da pessoa inteira.");
    } else setDrawing(prev => [...prev, point]);
  }
  async function save() {
    if (!review || saving || !imageReady) return;
    for (const region of regions) { const message = regionValidationError(region, review.width, review.height); if (message) { setError(message); return; } }
    if (Object.entries(polygonTexts).some(([index, value]) => { try { return JSON.stringify(JSON.parse(value)) !== JSON.stringify(regions[Number(index)]?.points); } catch { return true; } })) { setError("Confira os pontos do polígono antes de salvar."); return; }
    if (regions.some(r => r.kind === "adult_or_staff" && r.face_id && review.faces.find(f => f.id === r.face_id)?.state !== "adult_or_staff")) { setError("Classifique esse rosto como adulto/equipe na revisão do evento antes de deixá-lo nítido."); return; }
    if (regions.some(r => { const face = review.faces.find(f => f.id === r.face_id); return face && !regionContainsFace(r, face.bbox); })) { setError("A região deve cobrir o rosto correspondente e a pessoa inteira. Ajuste a marcação."); return; }
    if (complete && review.faces.some(face => !regions.some(r => r.face_id === face.id))) { setError("Associe uma região da pessoa inteira a cada rosto detectado. Acrescente também as pessoas que a detecção não encontrou."); return; }
    setSaving(true); setError("");
    try {
      const value = await getDataLayer().reviewMedia.savePhotoReview({ photoId, expectedVersion: review.regions_version, width: review.width, height: review.height, regions, allPeopleReviewed: complete });
      if (currentPhoto.current !== photoId) return;
      setReview(value); setRegions(value.regions); setPolygonTexts({}); onSaved?.(value);
    } catch (err) { if (currentPhoto.current === photoId) setError(err instanceof Error ? err.message : "Não foi possível salvar. A foto continua pendente."); }
    finally { if (currentPhoto.current === photoId) setSaving(false); }
  }
  if (loading) return <p role="status" className="text-sm">Carregando revisão da pessoa inteira…</p>;
  if (!review) return <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setReload(v => v + 1)}>Tentar novamente</Button></div>;
  return <section aria-label="Revisão da proteção da pessoa inteira" className="space-y-4 rounded-md border border-border p-3">
    <p className="text-sm font-medium">Confira todas as pessoas desta foto</p>
    <p className="text-xs text-muted-foreground">Marque a pessoa inteira, incluindo roupa, corpo e partes visíveis. Acrescente quem está de costas ou não foi detectado. O original abaixo é interno da escola; a prévia de entrega será processada depois.</p>
    {review.imageUrl ? <svg viewBox={`0 0 ${review.width} ${review.height}`} preserveAspectRatio="none" style={{ aspectRatio: `${review.width}/${review.height}` }} className="w-full rounded-md border border-border bg-muted" onPointerDown={coordinate} role="img" aria-label="Foto original com regiões de proteção. Use os campos abaixo para editar pelo teclado.">
      <image href={review.imageUrl} width={review.width} height={review.height} onLoad={() => setImageReady(true)} onError={() => { setImageReady(false); setError("Imagem indisponível. Reabra a revisão para tentar novamente."); }} />
      {review.faces.map((f, i) => <g key={f.id} className="stroke-muted-foreground" strokeDasharray="6 4" strokeWidth={Math.max(review.width / 350, 1)}><rect x={f.bbox.x} y={f.bbox.y} width={f.bbox.w} height={f.bbox.h} fill="none" /><text x={f.bbox.x} y={Math.max(review.height / 30, f.bbox.y)} className="fill-foreground" stroke="none" fontSize={review.height / 40}>Rosto {i + 1}</text></g>)}
      {regions.map((r, i) => <g key={i} className={r.kind === "adult_or_staff" || r.kind === "own_child" ? "stroke-primary fill-primary/20" : "stroke-destructive fill-destructive/20"} strokeWidth={Math.max(review.width / 250, 2)}>
        {r.shape === "rect" ? <rect x={(r.points as number[])[0]} y={(r.points as number[])[1]} width={(r.points as number[])[2]} height={(r.points as number[])[3]} /> : <polygon points={(r.points as number[][]).map(p => p.join(",")).join(" ")} />}
        <text x={r.shape === "rect" ? (r.points as number[])[0]! : (r.points as number[][])[0]?.[0]} y={(r.shape === "rect" ? (r.points as number[])[1]! : (r.points as number[][])[0]?.[1] ?? 0) + review.height / 35} stroke="none" className="fill-foreground" fontSize={review.height / 30}>{i + 1}</text>
      </g>)}
      {drawing.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(review.width / 150, 3)} className="fill-primary" />)}
    </svg> : <p role="alert" className="text-sm text-destructive">Imagem indisponível. A revisão permanece pendente.</p>}
    <fieldset disabled={saving || !imageReady} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><label className="text-sm">Forma <select value={mode} onChange={e => { setMode(e.target.value as "rect" | "polygon"); setDrawing([]); }} className="min-h-10 rounded-md border border-input bg-background px-2"><option value="rect">Retângulo</option><option value="polygon">Polígono</option></select></label><Button variant="outline" onClick={() => add()}>Adicionar pessoa pelos campos</Button>{mode === "polygon" && drawing.length >= 3 && <Button variant="outline" onClick={() => add(drawing)}>Fechar polígono</Button>}{drawing.length > 0 && <Button variant="ghost" onClick={() => setDrawing([])}>Cancelar marcação</Button>}</div>
      <p className="text-xs text-muted-foreground">{mode === "rect" ? "Na imagem, toque no canto superior esquerdo e depois no canto inferior direito da pessoa inteira." : "Toque nos pontos ao redor da pessoa inteira e use Fechar polígono. Também pode editar a lista de pontos."}</p>
      {!regions.length && <p className="text-sm text-muted-foreground">Nenhuma pessoa marcada. Se houver pessoas na imagem, adicione as regiões antes de concluir.</p>}
      {regions.map((r, i) => <fieldset key={i} className="space-y-2 rounded-md border border-border p-3"><legend className="px-1 text-sm">Pessoa {i + 1}</legend>
        <label className="grid gap-1 text-sm">Classificação<select value={r.kind} className="min-h-10 rounded-md border border-input bg-background px-2" onChange={e => { const kind = e.target.value as PersonRegionKind; change(i, { kind, student_id: kind === "own_child" || kind === "other_child" ? review.faces.find(f => f.id === r.face_id)?.student_id ?? null : null }); }}>{Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Rosto detectado correspondente<select value={r.face_id ?? ""} className="min-h-10 rounded-md border border-input bg-background px-2" onChange={e => { const face = review.faces.find(f => f.id === e.target.value); change(i, { face_id: face?.id ?? null, student_id: r.kind === "own_child" || r.kind === "other_child" ? face?.student_id ?? null : null }); }}><option value="">Pessoa não detectada / sem rosto visível</option>{review.faces.map((f, index) => <option key={f.id} value={f.id}>Rosto {index + 1}{f.student_name ? `: ${f.student_name}` : " desconhecido"}{f.state === "confirmed" ? " (confirmado)" : " (sem confirmação)"}</option>)}</select></label>
        {r.kind === "own_child" && (!r.face_id || review.faces.find(f => f.id === r.face_id)?.state !== "confirmed") && <p className="text-xs text-destructive">Só um rosto confirmado na revisão pode identificar o aluno.</p>}
        {r.shape === "rect" ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["X", "Y", "Largura", "Altura"].map((label, index) => <label key={label} className="text-xs">{label} (px)<Input type="number" min={0} step={1} aria-label={`Pessoa ${i + 1}: ${label}`} value={(r.points as number[])[index] ?? 0} onChange={e => { const points = [...r.points as number[]]; points[index] = e.target.valueAsNumber; change(i, { points }); }} /></label>)}</div> : <label className="grid gap-1 text-xs">Pontos em pixels: [[x,y],[x,y],…]<textarea className="min-h-20 rounded-md border border-input bg-background p-2" aria-label={`Pessoa ${i + 1}: pontos do polígono`} value={polygonTexts[i] ?? JSON.stringify(r.points)} onChange={e => { const text = e.target.value; setPolygonTexts(prev => ({ ...prev, [i]: text })); setComplete(false); try { const points: unknown = JSON.parse(text); if (Array.isArray(points)) change(i, { points: points as number[][] }); } catch { /* mantém texto para correção sem descartar a região */ } }} /></label>}
        {regionValidationError(r, review.width, review.height) && <p role="alert" className="text-xs text-destructive">{regionValidationError(r, review.width, review.height)}</p>}
        <Button variant="ghost" className="text-destructive" onClick={() => { setRegions(prev => prev.filter((_, index) => i !== index)); setPolygonTexts({}); setComplete(false); }}>Remover pessoa {i + 1}</Button>
      </fieldset>)}
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={complete} onCheckedChange={value => setComplete(value === true)} /><span>Conferi a foto inteira: todas as pessoas estão cobertas por suas regiões, inclusive as não detectadas. Adultos/equipe foram classificados humanamente.</span></label>
      <p className="text-xs text-muted-foreground">Outra criança e desconhecido permanecem protegidos. Se não conseguir uma proteção segura, salve sem concluir: apenas esta foto fica pendente.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={() => void save()}>{saving ? "Salvando…" : complete ? "Salvar revisão completa" : "Salvar e manter foto pendente"}</Button><Button variant="outline" onClick={() => setReload(v => v + 1)}>Recarregar foto</Button></div>
    </fieldset>
    {review.reviewed_version === review.regions_version && review.all_people_reviewed && <p role="status" className="text-xs text-muted-foreground">Revisão salva na versão {review.regions_version}. O derivado precisa ser processado e conferido antes da aprovação.</p>}
  </section>;
}
