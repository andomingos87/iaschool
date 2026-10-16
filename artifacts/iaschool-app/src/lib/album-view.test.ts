import { describe, expect, it } from "vitest";
import { groupAlbumByEvent, visibleAlbumItems } from "./album-view";

const eventA = "20000000-0000-0000-0000-000000000001";
const eventB = "20000000-0000-0000-0000-000000000002";
const items = [
  { id: "a", eventId: eventA, eventName: "Teste" },
  { id: "b", eventId: eventB, eventName: "Festa dois" },
];

describe("visão do álbum do responsável", () => {
  it("busca vazia mantém o conjunto e não apaga a lista recebida", () => {
    const visible = visibleAlbumItems(items, "   ", "all");
    expect(visible.map(item => item.id)).toEqual(["a", "b"]);
    expect(items).toHaveLength(2);
    expect(visible).not.toBe(items);
  });
  it("busca e filtro reduzem o que fica visível", () => {
    expect(visibleAlbumItems(items, "festá", "all").map(item => item.id)).toEqual(["b"]);
    expect(visibleAlbumItems(items, "", eventA).map(item => item.id)).toEqual(["a"]);
    expect(visibleAlbumItems(items, "festa", eventA)).toEqual([]);
    expect(items).toHaveLength(2);
  });
  it("agrupa por evento e usa o nome do álbum quando o item não traz evento", () => {
    const groups = groupAlbumByEvent([{ id: "legado" }, { id: "legado-2", eventName: "Passeio" }], "Formatura");
    expect(groups.map(group => group.eventName)).toEqual(["Formatura", "Passeio"]);
    expect(groups[0]?.items).toHaveLength(1);
  });
});
