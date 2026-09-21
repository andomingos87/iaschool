import { useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { FolderUp, Loader2 } from "lucide-react";
import { cn } from "@workspace/iaschool-ui/lib/utils";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { MAX_FILES_PER_BATCH, collectFilesFromDataTransfer } from "@/lib/upload";

interface Props {
  disabled?: boolean;
  /** Recebe todos os arquivos da pasta (subpastas inclusas). */
  onFiles: (files: File[]) => Promise<void> | void;
}

/** `webkitdirectory` não está na tipagem do React; aqui ele existe. */
type DirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

/**
 * Dropzone de PASTA: arrastar a pasta do evento (ou escolher pelo botão).
 * A leitura recursiva do drop é da File and Directory Entries API; a seleção
 * pelo botão usa `webkitdirectory`.
 */
export function EventUploadDropzone({ disabled, onFiles }: Props) {
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [reading, setReading] = useState(false);

  async function handle(files: File[]) {
    if (files.length === 0) return;
    setReading(true);
    try {
      await onFiles(files);
    } finally {
      setReading(false);
    }
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    setReading(true);
    try {
      const files = await collectFilesFromDataTransfer(e.dataTransfer);
      await onFiles(files);
    } finally {
      setReading(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) folderInput.current?.click();
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragActive ? "border-primary bg-primary/5" : "border-border bg-card/50",
        disabled && "cursor-not-allowed opacity-60",
      )}
      data-testid="dropzone-event-photos"
    >
      {reading ? (
        <Loader2 className="size-8 animate-spin text-primary" />
      ) : (
        <FolderUp className="size-8 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium">Arraste a pasta com as fotos do evento</p>
        <p className="mt-1 text-sm text-muted-foreground">
          JPEG, PNG ou HEIC · até {MAX_FILES_PER_BATCH.toLocaleString("pt-BR")} fotos por vez ·
          subpastas entram junto
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || reading}
          onClick={() => folderInput.current?.click()}
          data-testid="button-pick-folder"
        >
          Escolher pasta
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || reading}
          onClick={() => filesInput.current?.click()}
          data-testid="button-pick-files"
        >
          Escolher arquivos
        </Button>
      </div>
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } satisfies DirectoryInputProps)}
        onChange={(e) => {
          void handle(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        data-testid="input-event-folder"
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          void handle(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        data-testid="input-event-files"
      />
    </div>
  );
}
