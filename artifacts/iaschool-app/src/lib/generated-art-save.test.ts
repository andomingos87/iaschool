import { describe, expect, it, vi } from "vitest";
import { createGeneratedArtSaver } from "./generated-art-save";
const input = {
  imageUrl: "received",
  studentId: "student",
  details: { prompt: "Festa", model: "model", size: "1024x1024", images: [] },
};
it("autosave dispensa conferência e mantém snapshot após alterações de contexto", async () => {
  const source = structuredClone(input),
    upload = vi.fn().mockResolvedValue("stored"),
    persist = vi.fn().mockResolvedValue({ id: "saved" });
  const saver = createGeneratedArtSaver(source, { upload, persist });
  source.studentId = "other";
  await saver.save();
  expect(persist.mock.calls[0]![0].studentId).toBe("student");
  expect(persist.mock.calls[0]![0].details).not.toHaveProperty(
    "assemblyReviewed",
  );
});
it("falha persistência reaproveita upload e não gera outra arte nem duplica por concorrência", async () => {
  const upload = vi.fn().mockResolvedValue("stored"),
    persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ id: "saved" });
  const saver = createGeneratedArtSaver(input, { upload, persist });
  await expect(saver.save()).rejects.toThrow();
  await Promise.all([saver.save(), saver.save()]);
  await saver.save();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(2);
});
it("falha upload mantém a mesma imagem para retry sem fallback silencioso", async () => {
  const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("stored"),
    persist = vi.fn().mockResolvedValue({ id: "saved" });
  const saver = createGeneratedArtSaver(input, { upload, persist });
  await expect(saver.save()).rejects.toThrow();
  expect(persist).not.toHaveBeenCalled();
  await saver.save();
  expect(upload.mock.calls[0]).toEqual(upload.mock.calls[1]);
});
