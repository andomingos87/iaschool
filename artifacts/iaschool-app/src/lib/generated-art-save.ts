import type { GenerationDetails } from "./data/types";
/** Auto-save/retry operates on the result already received; never generates. */
export function createGeneratedArtSaver(
  input: {
    imageUrl: string;
    studentId: string;
    details: GenerationDetails;
    logId?: string;
  },
  deps: {
    upload: (url: string) => Promise<string>;
    persist: (input: {
      studentId: string;
      imageUrl: string;
      details: GenerationDetails;
    }) => Promise<{ id: string }>;
  },
) {
  const snapshot = structuredClone(input);
  let storedUrl: string | null = null,
    saved: { id: string; imageUrl: string } | null = null,
    pending: Promise<{ id: string; imageUrl: string }> | null = null;
  return {
    snapshot,
    save(): Promise<{ id: string; imageUrl: string }> {
      if (saved) return Promise.resolve(saved);
      if (pending) return pending;
      pending = (async () => {
        storedUrl ??= await deps.upload(snapshot.imageUrl);
        const result = await deps.persist({
          studentId: snapshot.studentId,
          imageUrl: storedUrl,
          details: snapshot.details,
        });
        saved = { id: result.id, imageUrl: storedUrl };
        return saved;
      })().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
