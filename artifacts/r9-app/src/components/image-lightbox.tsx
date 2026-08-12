import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/iasport/components/ui/dialog";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/** Lightbox simples para ampliar uma imagem. */
export function ImageLightbox({ src, alt = "Imagem", onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl border-border bg-card p-2">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[80vh] w-auto rounded-md object-contain"
            data-testid="img-lightbox"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
