import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, Maximize2, X } from "lucide-react";
import { cn } from "@workspace/iaschool-ui/lib/utils";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import type { StoredImage } from "@/lib/data";
import { useImageUpload } from "@/hooks/use-image-upload";
import { ImageLightbox } from "@/components/image-lightbox";

interface MultiUploadProps {
  bucket: string;
  value: StoredImage[];
  onChange: (images: StoredImage[]) => void;
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
  label = "Arraste imagens aqui ou clique para selecionar",
  "data-testid": testId,
}: MultiUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, uploading } = useImageUpload(bucket);
  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const uploaded = await uploadFiles(Array.from(files));
    if (uploaded.length === 0) return;
    if (single) onChange([uploaded[uploaded.length - 1]]);
    else onChange([...value, ...uploaded]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
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
        {uploading ? (
          <>
            <Spinner className="size-6 text-primary" />
            <p className="text-sm text-muted-foreground">Processando imagens...</p>
          </>
        ) : (
          <>
            <ImagePlus className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">
              As imagens são comprimidas automaticamente.
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
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
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
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

      {uploading && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Enviando...
        </p>
      )}

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
