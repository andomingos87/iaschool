import type { GenerationRequest } from "./data/types";
export interface OriginalComposition {
  version: "original-pixels-v1";
  photoId: string;
  points: Array<{ x: number; y: number }>;
  protectedHead: { x: number; y: number; width: number; height: number };
  reviewed: true;
}
export type OriginalGenerationRequest = GenerationRequest & { composition: OriginalComposition };
export function compositionForPhoto(request: GenerationRequest): OriginalComposition {
  const c = (request as Partial<OriginalGenerationRequest>).composition;
  if (!c || !c.reviewed || c.photoId !== request.studentPhoto.id || c.points.length < 3) throw new Error("Confira o recorte da pessoa original antes de gerar.");
  return c;
}
