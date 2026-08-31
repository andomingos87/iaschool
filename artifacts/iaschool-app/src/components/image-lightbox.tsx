import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
  /** Conteúdo extra exibido abaixo da imagem (ex.: detalhes da geração). */
  footer?: React.ReactNode;
}

/** Lightbox simples para ampliar uma imagem. */
export function ImageLightbox({
  src,
  alt = "Imagem",
  onClose,
  footer,
}: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border bg-card p-2">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[70vh] w-auto rounded-md object-contain"
            data-testid="img-lightbox"
          />
        )}
        {src && footer}
      </DialogContent>
    </Dialog>
  );
}
