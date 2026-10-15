import type { ReferencePost, StoredImage } from "./data/types";
/** Separates file upload from registration: failed metadata never reuploads. */
export function createModelRegistration(deps: {
  create: (image: StoredImage) => Promise<ReferencePost>;
  remove: (image: StoredImage) => Promise<void>;
  findExisting?: (image: StoredImage) => Promise<ReferencePost | null>;
}) {
  const pending = new Map<string, StoredImage>();
  const registered = new Set<string>();
  let operation: Promise<{saved:ReferencePost[];failed:StoredImage[]}> | null = null;
  async function register(images: StoredImage[]) {
    const saved: ReferencePost[] = [];
    for (const image of images) {
      if (registered.has(image.id)) continue;
      try {
        const existing = deps.findExisting ? await deps.findExisting(image) : null;
        saved.push(existing ?? await deps.create(image));
        registered.add(image.id); pending.delete(image.id);
      } catch { /* Keep the already uploaded file for explicit retry/removal. */ }
    }
    return {saved,failed:[...pending.values()]};
  }
  function run(images:StoredImage[]) {
    operation ??= register(images).finally(() => {operation=null;});
    return operation;
  }
  return {
    pending: () => [...pending.values()],
    add(images:StoredImage[]) {
      const added=images.filter(image => !pending.has(image.id) && !registered.has(image.id));
      for (const image of added) pending.set(image.id,image);
      return run(added);
    },
    retry() { return run([...pending.values()]); },
    async discard(id:string): Promise<void> {
      if (operation) throw new Error("Aguarde o cadastro do modelo terminar.");
      const image=pending.get(id);
      if (!image || registered.has(id)) return;
      const existing = deps.findExisting ? await deps.findExisting(image) : null;
      if (existing) registered.add(id);
      else await deps.remove(image);
      pending.delete(id);
    },
  };
}
