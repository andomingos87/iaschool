import { createOpaqueToken, sha256Hex } from "./tokens.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("token opaco tem 256 bits em hexadecimal e não repete", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  if (!/^[0-9a-f]{64}$/.test(first)) throw new Error(`token fora do formato: ${first}`);
  if (first === second) throw new Error("dois tokens iguais seguidos");
});

Deno.test("sha256Hex é estável e bate com o vetor conhecido", async () => {
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assertEquals(await sha256Hex("abc"), await sha256Hex("abc"));
});
