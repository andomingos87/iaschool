import { useEffect, useMemo, useState } from "react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/iaschool-ui/components/ui/dialog";
import { getDataLayer } from "@/lib/data";
import type { ConfirmedReferencePhoto } from "@/lib/data/review-media";
import { isoToBrDate } from "@/lib/format";

export function ConfirmedEventReferencePicker({ studentId, studentName, onEnqueued }: { studentId: string; studentName: string; onEnqueued: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ConfirmedReferencePhoto[]>([]);
  const [event, setEvent] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(""); setSelected(null); setUnavailable(new Set());
    void getDataLayer().reviewMedia.referenceCandidates(studentId).then(data => { if (active) setRows(data); }).catch(() => { if (active) setError("Não foi possível consultar as fotos confirmadas. Confira a autorização do aluno e tente novamente."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, studentId, reload]);
  const events = useMemo(() => [...new Map(rows.map(r => [r.event_id, `${r.event_name} · ${isoToBrDate(r.event_date)}`])).entries()], [rows]);
  const current = rows.find(r => r.face_id === selected);
  async function enqueue() {
    if (!current || current.already_used || unavailable.has(current.face_id)) return;
    setBusy(true); setError("");
    try {
      const result = await getDataLayer().reviewMedia.enqueueEventReference(studentId, current.face_id);
      if (result.duplicate) { setError("Este rosto já está na fila ou entre as referências."); setRows(prev => prev.map(r => r.face_id === current.face_id ? { ...r, already_used: true } : r)); return; }
      onEnqueued(); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível adicionar este rosto. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" onClick={() => { setEvent(""); setOpen(true); }}>Escolher foto de evento</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Rosto confirmado de {studentName}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Confira o rosto destacado. Apenas esse rosto será processado; a foto do grupo não vira referência inteira.</p>
        {loading ? <p role="status">Carregando fotos confirmadas…</p> : <>
          {error && <div role="alert" className="text-sm text-destructive">{error} <Button variant="link" onClick={() => setReload(v => v + 1)} disabled={busy}>Consultar novamente</Button></div>}
          <label className="grid gap-1 text-sm">Evento<select aria-label="Filtrar fotos confirmadas por evento" value={event} onChange={e => { setEvent(e.target.value); setSelected(null); }} disabled={busy} className="min-h-10 rounded-md border border-input bg-background px-3"><option value="">Todos os eventos</option>{events.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {!rows.length && !error && <p className="text-sm text-muted-foreground">Nenhuma foto com rosto confirmado. Confirme o reconhecimento na revisão do evento antes de escolher uma referência.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{rows.filter(r => !event || r.event_id === event).map(r => <button key={r.face_id} type="button" aria-pressed={selected === r.face_id} disabled={busy || r.already_used || !r.imageUrl || unavailable.has(r.face_id)} onClick={() => setSelected(r.face_id)} className={`overflow-hidden rounded-md border p-2 text-left ${selected === r.face_id ? "border-primary ring-2 ring-primary" : "border-border"}`}>
            <div className="relative aspect-[4/3] bg-muted">{r.imageUrl && !unavailable.has(r.face_id) ? <svg viewBox={`0 0 ${r.width} ${r.height}`} className="h-full w-full" role="img" aria-label={`Rosto confirmado de ${studentName} em ${r.event_name}`}><image href={r.imageUrl} width={r.width} height={r.height} onError={() => setUnavailable(prev => new Set([...prev, r.face_id]))} /><rect x={r.bbox.x} y={r.bbox.y} width={r.bbox.w} height={r.bbox.h} fill="none" className="stroke-primary" strokeWidth={Math.max(r.width / 180, 2)} /></svg> : <span className="text-xs">Imagem indisponível</span>}</div>
            <p className="mt-1 text-xs">{r.event_name}</p>{r.already_used && <p className="text-xs text-muted-foreground">Já usada</p>}
          </button>)}</div>
          <Button disabled={busy || !current || current.already_used || unavailable.has(current.face_id) || !current.imageUrl} onClick={() => void enqueue()}>{busy ? "Adicionando…" : "Conferi o rosto: adicionar à fila"}</Button>
          <p className="text-xs text-muted-foreground">A cobertura só aumenta depois que o worker processar este rosto com autorização ainda válida.</p>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
