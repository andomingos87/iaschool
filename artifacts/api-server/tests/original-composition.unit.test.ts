import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareOriginal, composeOriginal, parseOriginalComposition, backgroundPrompt } from "../src/lib/original-composition";
const c = { version: "original-pixels-v1", photoId: "synthetic", reviewed: true, points: [{ x:0,y:0 },{x:1,y:0},{x:1,y:1},{x:0,y:1}], protectedHead: {x:0.2,y:0.1,width:0.6,height:0.4} };
describe("composição da pessoa original", () => {
  it("rejeita recorte ausente, não conferido e coordenada inválida", () => {
    for (const value of [null, { ...c, reviewed:false }, { ...c, points:[{x:NaN,y:0}] }]) expect(() => parseOriginalComposition(value)).toThrow();
  });
  it("rejeita máscara que elimina cabeça/pescoço antes de gerar", async () => {
    const original = await sharp({create:{width:30,height:40,channels:4,background:"red"}}).png().toBuffer();
    await expect(prepareOriginal(original, {...c, points:[{x:0,y:0.6},{x:1,y:0.6},{x:1,y:1},{x:0,y:1}]})).rejects.toThrow(/cabeça/);
  });
  it("preserva pixels exatos de original sintético e saída1024 sem faixa", async () => {
    const original = await sharp({create:{width:30,height:40,channels:4,background:{r:171,g:53,b:97,alpha:1}}}).png().toBuffer();
    const background = await sharp({create:{width:1024,height:1024,channels:4,background:"blue"}}).png().toBuffer();
    const cut = await prepareOriginal(original,c);
    expect((await sharp(cut).raw().toBuffer()).equals(await sharp(original).raw().toBuffer())).toBe(true);
    const result = await composeOriginal(background,cut);
    const center = await sharp(result).extract({left:497,top:492,width:30,height:40}).raw().toBuffer();
    expect(center.equals(await sharp(original).raw().toBuffer())).toBe(true);
    expect(await sharp(result).metadata()).toMatchObject({width:1024,height:1024});
  });
  it("mantém proporções de foto maior sem recorte adicional", async () => {
    const original = await sharp({create:{width:1200,height:1600,channels:4,background:"green"}}).png().toBuffer();
    const meta = await sharp(await prepareOriginal(original,c)).metadata();
    expect(meta.height).toBe(922); expect(Math.abs(meta.width! / meta.height! - 0.75)).toBeLessThan(0.002);
  });
  it("limita a chamada ao fundo independente de instrução conflitante", () => {
    expect(backgroundPrompt("Troque a roupa")).toContain("SOMENTE ao fundo");
    expect(backgroundPrompt("Troque a roupa")).toContain("Não desenhe nenhuma pessoa");
  });
});
