import { useState } from "react";
import { getDataLayer } from "@/lib/data";
import type { StoredImage } from "@/lib/data";
import {
  ACCEPTED_FORMATS_LABEL,
  UnreadableImageError,
  isImageLike,
  prepareAssetImage,
} from "@/lib/upload";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";

/** Converte (HEIC → JPEG), comprime e faz upload de vários arquivos, retornando as imagens armazenadas. */
export function useImageUpload(bucket: string) {
  const data = getDataLayer();
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: File[]): Promise<StoredImage[]> {
    const imageFiles = files.filter(isImageLike);
    if (imageFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: `Selecione apenas imagens (${ACCEPTED_FORMATS_LABEL}).`,
      });
      return [];
    }
    setUploading(true);
    const results: StoredImage[] = [];
    try {
      for (const file of imageFiles) {
        let prepared: File;
        try {
          prepared = await prepareAssetImage(file);
        } catch (err) {
          toast({
            variant: "destructive",
            title: "Formato não suportado",
            description: `"${file.name}": ${
              err instanceof UnreadableImageError ? err.message : "não foi possível ler a imagem."
            }`,
          });
          continue;
        }
        try {
          results.push(await data.storage.upload(bucket, prepared, prepared.name));
        } catch {
          toast({
            variant: "destructive",
            title: "Falha no upload",
            description: `Não foi possível enviar "${file.name}". Tente de novo em instantes.`,
          });
        }
      }
    } finally {
      setUploading(false);
    }
    return results;
  }

  return { uploadFiles, uploading };
}
