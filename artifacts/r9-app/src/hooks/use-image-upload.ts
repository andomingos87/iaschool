import { useState } from "react";
import imageCompression from "browser-image-compression";
import { getDataLayer } from "@/lib/data";
import type { StoredImage } from "@/lib/data";
import { toast } from "@workspace/iasport/hooks/use-toast";

const COMPRESS_OPTIONS = {
  maxWidthOrHeight: 1600,
  maxSizeMB: 0.8,
  useWebWorker: true,
};

/** Comprime + faz upload de vários arquivos, retornando as imagens armazenadas. */
export function useImageUpload(bucket: string) {
  const data = getDataLayer();
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: File[]): Promise<StoredImage[]> {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: "Selecione apenas imagens.",
      });
      return [];
    }
    setUploading(true);
    const results: StoredImage[] = [];
    try {
      for (const file of imageFiles) {
        try {
          const compressed = await imageCompression(file, COMPRESS_OPTIONS);
          const stored = await data.storage.upload(bucket, compressed, file.name);
          results.push(stored);
        } catch {
          toast({
            variant: "destructive",
            title: "Falha no upload",
            description: `Não foi possível processar "${file.name}".`,
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
