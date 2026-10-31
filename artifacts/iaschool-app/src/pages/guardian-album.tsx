import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Images, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { createAlbumService, type GuardianAlbum } from "@/lib/delivery-service";
import { albumEventName, groupAlbumByEvent, visibleAlbumItems } from "@/lib/album-view";
import { buildGuardianAlbumZip, getAlbumPhotoBytes } from "@/lib/album-download";
import { startBlobDownload } from "@/lib/student-folder";
import { safeZipName } from "@/lib/zip";
import { ImageLightbox } from "@/components/image-lightbox";
import { iaschool } from "@/config/iaschool";

const service = createAlbumService();
function downloadBlob(blob: Blob, filename: string) {
  startBlobDownload({ blob, filename, createObjectURL: value => URL.createObjectURL(value), revokeObjectURL: url => URL.revokeObjectURL(url),
    click: (url, name) => { const link = document.createElement("a"); link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove(); }, schedule: (fn, ms) => window.setTimeout(fn, ms) });
}
function expiryDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
/** Público: cookie HttpOnly de 24h, sem sessão/Auth da escola ou consulta ao bucket. */
export default function GuardianAlbumPage() {
  const tokenRef = useRef(window.location.hash.slice(1) || undefined);
  const opening = useRef<Promise<GuardianAlbum> | null>(null);
  const [album, setAlbum] = useState<GuardianAlbum | null>(null);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());
  async function loadAlbum(): Promise<GuardianAlbum> {
    const token = tokenRef.current;
    const value = token ? await service.consume(token) : await service.list();
    if (token) { window.history.replaceState(null, "", "/album"); tokenRef.current = undefined; }
    return value;
  }
  useEffect(() => {
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer"; document.head.appendChild(meta);
    let active = true;
    opening.current ??= loadAlbum();
    void opening.current.then(value => { if (!active) return; setAlbum(value); setError(null); setLoading(false); })
      .catch(err => { if (active) { setError(err instanceof Error ? err.message : "Não foi possível abrir o álbum. Procure a escola."); setLoading(false); } });
    return () => { active = false; meta.remove(); };
  }, []);
  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy("refresh");
    setLoading(true); setError(null);
    try { setAlbum(await loadAlbum()); setFailedThumbs(new Set()); } catch (err) { setAlbum(null); setError(err instanceof Error ? err.message : "Não foi possível abrir o álbum."); }
    finally { busyRef.current = false; setBusy(null); setLoading(false); }
  }
  async function download(itemId: string, show = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(itemId); setNotice(null);
    try {
      const photo = await getAlbumPhotoBytes(itemId, id => service.download(id));
      const blob = new Blob([new Uint8Array(photo.bytes)], { type: "image/jpeg" });
      if (show) { if (zoom) URL.revokeObjectURL(zoom); setZoom(URL.createObjectURL(blob)); }
      else downloadBlob(blob, photo.filename);
    } catch (err) { setNotice(err instanceof Error ? err.message : "Não foi possível baixar a foto."); }
    finally { busyRef.current = false; setBusy(null); }
  }
  const fallbackName = album?.eventName || "Evento";
  const eventGroups = useMemo(() => groupAlbumByEvent(album?.items ?? [], fallbackName), [album, fallbackName]);
  const visible = useMemo(() => visibleAlbumItems(album?.items ?? [], query, eventFilter, fallbackName), [album, query, eventFilter, fallbackName]);
  const visibleGroups = useMemo(() => groupAlbumByEvent(visible, fallbackName), [visible, fallbackName]);
  const title = eventGroups.length > 1 ? "Fotos dos eventos" : eventGroups[0]?.eventName ?? album?.eventName ?? "Fotos do evento";
  async function zip() {
    if (!album || busyRef.current || visible.length === 0) return;
    busyRef.current = true; setBusy("zip"); setNotice("Preparando o ZIP…");
    try {
      const result = await buildGuardianAlbumZip({ items: visible, sign: id => service.download(id), audit: ids => service.auditZip(ids),
        onProgress: (done, total) => setNotice(`Preparando o ZIP: ${done} de ${total} fotos…`) });
      downloadBlob(result.blob, `${safeZipName(visibleGroups.length === 1 ? visibleGroups[0]!.eventName : "eventos", "evento")}.zip`);
      setNotice(result.missing ? `ZIP incompleto: ${result.included} fotos incluídas; ${result.missing} indisponíveis. Atualize o álbum para conferir.`
        : `${result.included} fotos no ZIP.`);
    } catch (err) { setNotice(err instanceof Error ? err.message : "Não foi possível baixar o conjunto."); }
    finally { busyRef.current = false; setBusy(null); }
  }
  useEffect(() => () => { if (zoom) URL.revokeObjectURL(zoom); }, [zoom]);
  return <main className="mx-auto min-h-dvh max-w-5xl space-y-6 px-4 py-8 sm:px-6">
    <header className="space-y-2"><p className="text-sm font-medium text-primary">{iaschool.brand.name} · Álbum privado</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{album?.signature ?? "As fotos autorizadas pela escola aparecem somente neste acesso."}</p>
    </header>
    {loading ? <p className="flex items-center gap-2" role="status"><Loader2 className="size-5 animate-spin" /> Abrindo o álbum…</p>
      : error ? <section className="space-y-3 rounded-lg border p-5"><p role="alert">{error}</p>
        <p className="text-sm text-muted-foreground">O mesmo link abre de novo enquanto as fotos continuarem disponíveis. A escola pode revogar o acesso.</p>
        <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" /> {tokenRef.current ? "Tentar abrir de novo" : "Verificar sessão deste navegador"}</Button></section>
      : album && <>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div className="space-y-1 text-sm">
          <p>Sessão deste navegador até {expiryDate(album.sessionExpiresAt)}.</p><p className="text-muted-foreground">O mesmo link abre de novo enquanto as fotos continuarem disponíveis. A escola pode revogar o acesso. Arquivos até {expiryDate(album.filesExpireAt)}.</p>
        </div><Button disabled={Boolean(busy) || visible.length === 0} onClick={() => void zip()}><Download className="size-4" /> Baixar estas ({visible.length})</Button></section>
        <section className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <label className="space-y-1 text-sm" htmlFor="album-search">Buscar evento
            <Input id="album-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome do evento" />
          </label>
          <label className="space-y-1 text-sm" htmlFor="album-event">Filtrar evento
            <select id="album-event" className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={eventFilter} onChange={event => setEventFilter(event.target.value)}>
              <option value="all">Todos os eventos</option>
              {eventGroups.map(group => <option key={group.key} value={group.key}>{group.eventName}</option>)}
            </select>
          </label>
        </section>
        <p className="text-xs text-muted-foreground">As fotos deste álbum foram selecionadas e aprovadas pela escola. Revogar o acesso bloqueia novos downloads; cópias já baixadas continuam com quem as recebeu.</p>
        {album.items.length === 0 ? <div className="space-y-2 rounded-lg border p-6"><Images className="size-6" /><p>Nenhuma foto disponível. Os arquivos podem ter vencido ou sido revogados. Procure a escola.</p></div>
          : visible.length === 0 ? <div className="space-y-2 rounded-lg border p-6"><Images className="size-6" /><p>Nenhuma foto combina com a busca ou o filtro.</p></div>
          : visibleGroups.map(group => <section key={group.key} className="space-y-3">
            <h2 className="text-lg font-semibold">{group.eventName}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{group.items.map((photo, index) => <article key={photo.id} className="overflow-hidden rounded-lg border">
              <button type="button" className="block w-full" disabled={Boolean(busy)} onClick={() => void download(photo.id, true)} aria-label={`Abrir foto ${index + 1} de ${albumEventName(photo, fallbackName)}`}>
                {failedThumbs.has(photo.id) ? <span className="flex aspect-square items-center justify-center bg-muted p-3 text-center text-sm">Miniatura indisponível. Atualize o álbum para tentar novamente.</span>
                  : <img src={photo.thumbUrl} referrerPolicy="no-referrer" alt={`Foto ${index + 1} de ${albumEventName(photo, fallbackName)}`} className="aspect-square w-full object-cover" loading="lazy" onError={() => setFailedThumbs(prev => new Set([...prev, photo.id]))} />}
              </button><Button className="w-full rounded-t-none" variant="outline" disabled={Boolean(busy)} onClick={() => void download(photo.id)}>
                {busy === photo.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Baixar foto {index + 1}</Button>
            </article>)}</div>
          </section>)}
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw className="size-4" /> Atualizar disponibilidade</Button>
      </>}
    {notice && <p role="status" className="rounded-md bg-muted p-3 text-sm">{notice}</p>}
    <ImageLightbox src={zoom} onClose={() => { if (zoom) URL.revokeObjectURL(zoom); setZoom(null); }} alt="Foto do evento" />
  </main>;
}
