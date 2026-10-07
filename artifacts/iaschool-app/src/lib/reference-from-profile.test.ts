import { describe, expect, it } from "vitest";
import {
  decideProfileEnqueue,
  hasReferenceHash,
  hashFromReferencePath,
  referenceStoragePath,
} from "./reference-from-profile";

const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);

describe("decideProfileEnqueue", () => {
  it("não enfileira sem reconhecimento", () => {
    expect(
      decideProfileEnqueue({
        recognitionActive: false,
        hasProfilePhoto: true,
        preparedHash: HASH,
        existingPaths: [],
      }),
    ).toBe("skip-no-recognition");
  });

  it("enfileira a foto de perfil quando o hash é novo", () => {
    expect(
      decideProfileEnqueue({
        recognitionActive: true,
        hasProfilePhoto: true,
        preparedHash: HASH,
        existingPaths: [],
      }),
    ).toBe("enqueue");
  });

  it("não duplica a mesma foto preparada", () => {
    const path = referenceStoragePath("school", "student", "job", HASH, true);
    expect(hasReferenceHash(HASH, [path])).toBe(true);
    expect(
      decideProfileEnqueue({
        recognitionActive: true,
        hasProfilePhoto: true,
        preparedHash: HASH,
        existingPaths: [path],
      }),
    ).toBe("duplicate");
  });

  it("hash diferente enfileira de novo e o caminho antigo continua reconhecível", () => {
    const oldPath = referenceStoragePath("school", "student", "job-1", HASH, true);
    expect(hashFromReferencePath(oldPath)).toEqual({ hash: HASH, fromProfile: true });
    expect(
      decideProfileEnqueue({
        recognitionActive: true,
        hasProfilePhoto: true,
        preparedHash: OTHER,
        existingPaths: [oldPath],
      }),
    ).toBe("enqueue");
  });
});
