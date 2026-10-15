import { describe, expect, it, vi } from "vitest";
import { createModelRegistration } from "./model-registration";
import type { StoredImage } from "./data/types";
const image:StoredImage={id:"new",url:"synthetic",path:"new-only.png",createdAt:"2026-10-12"};
const saved={id:"registered",image,uploadedBy:"school",createdAt:"2026-10-12"};
describe("arquivo de modelo e cadastro separados", () => {
  it("falha no cadastro conserva arquivo, não finge sucesso e retry só recria metadados", async () => {
    const create=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(saved),remove=vi.fn();
    const manager=createModelRegistration({create,remove});
    expect(await manager.add([image])).toEqual({saved:[],failed:[image]});expect(manager.pending()).toEqual([image]);
    expect(await manager.retry()).toEqual({saved:[saved],failed:[]});expect(manager.pending()).toEqual([]);
    expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);expect(remove).not.toHaveBeenCalled();
  });
  it("cliques concorrentes/repetidos não duplicam cadastro", async () => {
    const create=vi.fn().mockResolvedValue(saved),manager=createModelRegistration({create,remove:vi.fn()});
    await Promise.all([manager.add([image]),manager.add([image]),manager.retry()]);await manager.add([image]);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("remove/cancela somente arquivo novo pendente, preservando modelo cadastrado", async () => {
    const remove=vi.fn(),create=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(saved);
    const manager=createModelRegistration({create,remove});await manager.add([image]);await manager.discard(image.id);
    expect(remove).toHaveBeenCalledWith(image);expect(manager.pending()).toEqual([]);
    await manager.add([image]);await manager.discard(image.id);await manager.discard("existing-model-never-uploaded");
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("falha ao remover conserva pendente para nova tentativa e não apaga registro", async () => {
    const create=vi.fn().mockRejectedValue(new Error("offline")),remove=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const manager=createModelRegistration({create,remove});await manager.add([image]);await expect(manager.discard(image.id)).rejects.toThrow();
    expect(manager.pending()).toEqual([image]);await manager.discard(image.id);expect(manager.pending()).toEqual([]);
  });
  it("sucesso parcial só conta cadastros salvos e preserva o que falhou", async () => {
    const other={...image,id:"other",path:"other.png"};const create=vi.fn().mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error("offline"));
    const manager=createModelRegistration({create,remove:vi.fn()});expect(await manager.add([image,other])).toEqual({saved:[saved],failed:[other]});
  });
});

it("resposta perdida após commit é recuperada no retry sem duplicar registro", async () => {
  let committed=false;
  const create=vi.fn(async()=>{committed=true;throw new Error("resposta perdida");}),remove=vi.fn();
  const manager=createModelRegistration({create,remove,findExisting:async()=>committed?saved:null});
  expect((await manager.add([image])).saved).toEqual([]);expect((await manager.retry()).saved).toEqual([saved]);
  expect(create).toHaveBeenCalledTimes(1);expect(remove).not.toHaveBeenCalled();
});
it("cancelar resposta perdida não apaga o arquivo de um cadastro já confirmado no servidor", async () => {
  let committed=false;
  const create=vi.fn(async()=>{committed=true;throw new Error("resposta perdida");}),remove=vi.fn();
  const manager=createModelRegistration({create,remove,findExisting:async()=>committed?saved:null});
  await manager.add([image]);await manager.discard(image.id);
  expect(remove).not.toHaveBeenCalled();expect(manager.pending()).toEqual([]);
});
it("falha ao consultar registro não apaga o arquivo ou tenta criar sem conhecer estado", async () => {
  const findExisting=vi.fn().mockRejectedValue(new Error("offline")),create=vi.fn(),remove=vi.fn();
  const manager=createModelRegistration({create,remove,findExisting});await manager.add([image]);
  await expect(manager.discard(image.id)).rejects.toThrow();expect(create).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(manager.pending()).toEqual([image]);
});
