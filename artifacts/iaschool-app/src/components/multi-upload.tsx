import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, Maximize2, X } from "lucide-react";
import { cn } from "@workspace/iaschool-ui/lib/utils";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import type { StoredImage } from "@/lib/data";
import { useImageUpload } from "@/hooks/use-image-upload";
import { ACCEPT_ATTRIBUTE } from "@/lib/upload";
import { ImageLightbox } from "@/components/image-lightbox";

interface MultiUploadProps {
  bucket: string;
  value: StoredImage[];
  onChange: (images: StoredImage[]) => void | Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Se true, mantém no máximo 1 imagem (logo da escola). */
  single?: boolean;
  label?: string;
  "data-testid"?: string;
}

/**
 * Upload múltiplo com drag-and-drop, compressão no cliente, grade de
 * miniaturas com ampliar (lightbox) e remover.
 */
export function MultiUpload({
  bucket,
  value,
  onChange,
  single = false,
  disabled = false,
  onBusyChange,
  label = "Arraste imagens aqui ou clique para selecionar",
  "data-testid": testId,
}: MultiUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { uploadFiles, uploading } = useImageUpload(bucket);
  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const busy = disabled || uploading || working;
  async function operate(work: () => Promise<void>) {
    if (disabled || operationRef.current) return;
    operationRef.current = true;
    setWorking(true);
    setError(null);
    onBusyChange?.(true);
    try {
      await work();
    } catch {
      setError("Não foi possível concluir. Tente novamente.");
    } finally {
      operationRef.current = false;
      setWorking(false);
      onBusyChange?.(false);
    }
  }
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || disabled || operationRef.current)
      return;
    const selected = single ? Array.from(files).slice(0, 1) : Array.from(files);
    await operate(async () => {
      const uploaded = await uploadFiles(selected);
      if (uploaded.length === 0) return;
      if (single) await onChange([uploaded[uploaded.length - 1]!]);
      else await onChange([...valueRef.current, ...uploaded]);
    });
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (!busy) void handleFiles(e.dataTransfer.files);
  }
  async function removeAt(index: number) {
    await operate(async () => {
      await onChange(valueRef.current.filter((_, i) => i !== index));
    });
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label={label}
        aria-disabled={busy}
        aria-busy={busy}
        onKeyDown={(event) => {
          if (!busy && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!busy && !operationRef.current) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center transition-colors",
          dragActive
            ? "border-primary bg-accent"
            : "border-input bg-muted/40 hover:border-primary/60",
        )}
        data-testid={testId ?? "dropzone-upload"}
      >
        {busy ? (
          <>
            <Spinner className="size-6 text-primary" />
            <p className="text-sm text-muted-foreground">
              Processando imagens...
            </p>
          </>
        ) : (
          <>
            <ImagePlus className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, HEIC (iPhone), WebP e outros formatos. As imagens são
              convertidas e comprimidas automaticamente.
            </p>
          </>
        )}
        <input
          ref={inputRef}
          disabled={busy}
          aria-label={label}
          type="file"
          accept={`image/*,${ACCEPT_ATTRIBUTE}`}
          multiple={!single}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          data-testid="input-file-upload"
        />
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {value.map((img, i) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
              data-testid={`thumb-image-${i}`}
            >
              <img
                src={img.url}
                alt="Miniatura"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  aria-label={`Ampliar imagem ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoom(img.url);
                  }}
                  data-testid={`button-zoom-${i}`}
                >
                  <Maximize2 className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  disabled={busy}
                  aria-label={`Remover imagem ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  data-testid={`button-remove-image-${i}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Enviando...
        </p>
      )}

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
