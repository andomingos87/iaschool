import type { SupabaseClient } from "@supabase/supabase-js";

export type PersonRegionKind = "protected_unknown" | "other_child" | "own_child" | "adult_or_staff";
export interface PersonRegion {
  id?: string;
  face_id: string | null;
  student_id: string | null;
  kind: PersonRegionKind;
  shape: "rect" | "polygon";
  points: number[] | number[][];
}
export interface ReviewedPhotoFace {
  id: string;
  student_id: string | null;
  student_name: string | null;
  state: string;
  bbox: { x: number; y: number; w: number; h: number };
}
export interface PhotoPersonReview {
  photo_id: string;
  regions_version: number;
  reviewed_version: number | null;
  all_people_reviewed: boolean;
  width: number;
  height: number;
  storage_path: string;
  regions: PersonRegion[];
  faces: ReviewedPhotoFace[];
  imageUrl?: string;
}
export interface ConfirmedReferencePhoto {
  photo_id: string;
  face_id: string;
  event_id: string;
  event_name: string;
  event_date: string;
  width: number;
  height: number;
  bbox: ReviewedPhotoFace["bbox"];
  storage_path: string;
  already_used: boolean;
  imageUrl?: string;
}
export interface ReviewMediaRepository {
  referenceCandidates(studentId: string): Promise<ConfirmedReferencePhoto[]>;
  enqueueEventReference(studentId: string, faceId: string): Promise<{ id: string; duplicate: boolean }>;
  photoReview(photoId: string): Promise<PhotoPersonReview>;
  savePhotoReview(input: { photoId: string; expectedVersion: number; width: number; height: number; regions: PersonRegion[]; allPeopleReviewed: boolean }): Promise<PhotoPersonReview>;
}

export function regionValidationError(region: PersonRegion, width: number, height: number): string | null {
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return "Dimensões da foto inválidas.";
  if (region.shape === "rect") {
    if (region.points.length !== 4 || !region.points.every(valid)) return "Informe x, y, largura e altura.";
    const [x, y, w, h] = region.points as number[];
    if (x! < 0 || y! < 0 || w! < 1 || h! < 1 || x! + w! > width || y! + h! > height) return "A região deve ficar dentro da foto e cobrir a pessoa inteira.";
    return null;
  }
  const points = region.points as number[][];
  if (points.length < 3 || points.length > 100 || !points.every(p => Array.isArray(p) && p.length === 2 && p.every(valid) && p[0]! >= 0 && p[1]! >= 0 && p[0]! <= width && p[1]! <= height)) return "O polígono precisa de 3 a 100 pontos dentro da foto.";
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!;
    area += a[0]! * b[1]! - b[0]! * a[1]!;
    if (a[0] === b[0] && a[1] === b[1]) return "Remova os pontos repetidos do polígono.";
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!; const d = points[(j + 1) % points.length]!;
      const orient = (p: number[], q: number[], r: number[]) => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
      if (orient(a, b, c) * orient(a, b, d) <= 0 && orient(c, d, a) * orient(c, d, b) <= 0 && Math.max(Math.min(a[0]!, b[0]!), Math.min(c[0]!, d[0]!)) <= Math.min(Math.max(a[0]!, b[0]!), Math.max(c[0]!, d[0]!)) && Math.max(Math.min(a[1]!, b[1]!), Math.min(c[1]!, d[1]!)) <= Math.min(Math.max(a[1]!, b[1]!), Math.max(c[1]!, d[1]!))) return "As linhas do polígono não podem se cruzar.";
    }
  }
  return Math.abs(area) < 2 ? "O polígono precisa cobrir uma área da foto." : null;
}

export function createReviewMediaRepository(client: SupabaseClient): ReviewMediaRepository {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message === "review version changed" ? "A foto mudou durante a revisão. Recarregue e confira novamente." : error.message === "reference requires active authorization" ? "A autorização de reconhecimento foi revogada. Confira a ficha do aluno." : "Não foi possível concluir a revisão. Confira os dados e tente novamente.");
    return data as T;
  }
  async function sign<T extends { storage_path: string; imageUrl?: string }>(photo: T): Promise<T> {
    const { data, error } = await client.storage.from("event-photos").createSignedUrl(photo.storage_path, 300);
    return { ...photo, imageUrl: error ? undefined : data?.signedUrl };
  }
  return {
    async referenceCandidates(studentId) { return Promise.all((await rpc<ConfirmedReferencePhoto[]>("confirmed_reference_photos", { p_student_id: studentId })).map(sign)); },
    enqueueEventReference(studentId, faceId) { return rpc("enqueue_confirmed_event_reference", { p_student_id: studentId, p_face_id: faceId }); },
    async photoReview(photoId) { return sign(await rpc<PhotoPersonReview>("photo_person_review", { p_photo_id: photoId })); },
    async savePhotoReview(input) { return sign(await rpc<PhotoPersonReview>("save_photo_person_review", { p_photo_id: input.photoId, p_expected_version: input.expectedVersion, p_width: input.width, p_height: input.height, p_regions: input.regions.map(({ id: _id, ...r }) => r), p_all_people_reviewed: input.allPeopleReviewed })); },
  };
}

/** Modo demonstração não simula confirmação, autorização ou entrega real. */
export function createMockReviewMediaRepository(): ReviewMediaRepository {
  const reviews = new Map<string, PhotoPersonReview>();
  return {
    async referenceCandidates() { return []; },
    async enqueueEventReference() { throw new Error("Use uma escola conectada para adicionar referências de evento."); },
    async photoReview(photoId) {
      const saved = reviews.get(photoId);
      if (saved) return structuredClone(saved);
      // Cena sintética sem pessoas: a escola ainda precisa conferir a cobertura.
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e5e7eb"/><text x="200" y="300" font-size="24">Foto de demonstração</text></svg>';
      return { photo_id: photoId, regions_version: 0, reviewed_version: null, all_people_reviewed: false, width: 800, height: 600, storage_path: "", regions: [], faces: [], imageUrl: `data:image/svg+xml,${encodeURIComponent(svg)}` };
    },
    async savePhotoReview(input) {
      const current = await this.photoReview(input.photoId);
      if (current.regions_version !== input.expectedVersion) throw new Error("A foto mudou durante a revisão. Recarregue.");
      for (const region of input.regions) { const error = regionValidationError(region, input.width, input.height); if (error) throw new Error(error); }
      const version = current.regions_version + 1;
      const next = { ...current, regions: structuredClone(input.regions), regions_version: version, reviewed_version: input.allPeopleReviewed ? version : null, all_people_reviewed: input.allPeopleReviewed };
      reviews.set(input.photoId, next);
      return structuredClone(next);
    },
  };
}

/** A linked region must retain the detected face box, including concave contours. */
export function regionContainsFace(region: PersonRegion, bbox: ReviewedPhotoFace["bbox"]): boolean {
  const {x,y,w,h} = bbox;
  if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) return false;
  if (region.shape === "rect") {
    const [left,top,width,height] = region.points as number[];
    return left! <= x && top! <= y && left! + width! >= x+w && top! + height! >= y+h;
  }
  const polygon = region.points as number[][];
  const corners = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const orient = (a:number[],b:number[],c:number[]) => (b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!);
  function inside(point:number[]) {
    let result = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i]!,b=polygon[j]!;
      if (orient(a,b,point) === 0 && point[0]! >= Math.min(a[0]!,b[0]!) && point[0]! <= Math.max(a[0]!,b[0]!) && point[1]! >= Math.min(a[1]!,b[1]!) && point[1]! <= Math.max(a[1]!,b[1]!)) return true;
      if ((a[1]! > point[1]!) !== (b[1]! > point[1]!) && point[0]! < (b[0]!-a[0]!)*(point[1]!-a[1]!)/(b[1]!-a[1]!)+a[0]!) result=!result;
    }
    return result;
  }
  if (!corners.every(inside)) return false;
  for (let i=0;i<polygon.length;i++) {
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!;
    if (a[0]! > x && a[0]! < x+w && a[1]! > y && a[1]! < y+h) return false;
    for (let j=0;j<4;j++) {
      const c=corners[j]!,d=corners[(j+1)%4]!;
      if (orient(a,b,c)*orient(a,b,d)<0 && orient(c,d,a)*orient(c,d,b)<0) return false;
    }
  }
  return true;
}
