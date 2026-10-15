import { describe, expect, it, vi } from "vitest";
import {
  CEP_MESSAGE,
  addressFromSaved,
  emptyAddress,
  fetchViaCep,
  reduceAddress,
  viaCepUrl,
  type AddressDraft,
  type ViaCepOutcome,
} from "./cep-address";

const CEP_A = "01310100";
const CEP_B = "22041080";

const ADDRESS_A: ViaCepOutcome = {
  kind: "filled",
  street: "Praça da Sé",
  district: "Sé",
  city: "São Paulo",
  state: "SP",
};

const ADDRESS_B: ViaCepOutcome = {
  kind: "filled",
  street: "Avenida Atlântica",
  district: "Copacabana",
  city: "Rio de Janeiro",
  state: "RJ",
};

function editZip(state: AddressDraft, value: string) {
  return reduceAddress(state, { type: "edit", field: "zip", value });
}

function finish(state: AddressDraft, lookupId: number, cep: string, result: ViaCepOutcome) {
  return reduceAddress(state, { type: "lookup-finished", lookupId, cep, result });
}

describe("reduceAddress — consulta só com CEP completo", () => {
  it("preenche logradouro, bairro, cidade e UF e preserva número e complemento", () => {
    let state = emptyAddress();
    state = reduceAddress(state, { type: "edit", field: "number", value: "100" }).state;
    state = reduceAddress(state, { type: "edit", field: "complement", value: "sala 2" }).state;

    const started = editZip(state, "01310-100");
    expect(started.lookup).toEqual({ cep: CEP_A, lookupId: 1 });
    expect(started.state.phase).toBe("loading");
    expect(started.state.message).toBe(CEP_MESSAGE.loading);
    expect(started.state.zip).toBe(CEP_A);

    const done = finish(started.state, started.lookup!.lookupId, CEP_A, ADDRESS_A);
    expect(done.lookup).toBeNull();
    expect(done.state.phase).toBe("filled");
    expect(done.state.street).toBe("Praça da Sé");
    expect(done.state.district).toBe("Sé");
    expect(done.state.city).toBe("São Paulo");
    expect(done.state.state).toBe("SP");
    expect(done.state.number).toBe("100");
    expect(done.state.complement).toBe("sala 2");
    expect(done.state.autoFields).toEqual(["street", "district", "city", "state"]);
  });

  it("CEP incompleto não consulta", () => {
    const started = editZip(emptyAddress(), "01310-10");
    expect(started.lookup).toBeNull();
    expect(started.state.phase).toBe("incomplete");
    expect(started.state.requestedCeps).toEqual([]);
    expect(started.state.message).not.toBe(CEP_MESSAGE.loading);
  });

  it("não repete o mesmo CEP no fluxo", () => {
    const first = editZip(emptyAddress(), CEP_A);
    const filled = finish(first.state, first.lookup!.lookupId, CEP_A, ADDRESS_A).state;
    const other = editZip(filled, CEP_B);
    expect(other.lookup?.cep).toBe(CEP_B);
    const back = editZip(other.state, "01310-100");
    expect(back.lookup).toBeNull();
    expect(back.state.street).toBe("Praça da Sé");
    expect(back.state.requestedCeps).toEqual([CEP_A, CEP_B]);
  });

  it("o CEP gravado ao abrir não dispara consulta", () => {
    const loaded = reduceAddress(emptyAddress(), {
      type: "load",
      address: {
        zip: "01310-100",
        street: "Rua Salva",
        number: "10",
        complement: "bloco B",
        district: "Centro",
        city: "São Paulo",
        state: "sp",
      },
    });
    expect(loaded.lookup).toBeNull();
    expect(loaded.state.street).toBe("Rua Salva");
    expect(loaded.state.state).toBe("SP");
    expect(loaded.state.number).toBe("10");
    expect(loaded.state.complement).toBe("bloco B");
    expect(loaded.state.requestedCeps).toEqual([]);
  });
});

describe("reduceAddress — resposta tardia e correção manual", () => {
  it("resposta de A não altera o CEP B", () => {
    const startedA = editZip(emptyAddress(), CEP_A);
    const startedB = editZip(startedA.state, CEP_B);
    const late = finish(startedB.state, startedA.lookup!.lookupId, CEP_A, ADDRESS_A);
    expect(late.state.zip).toBe(CEP_B);
    expect(late.state.street).toBe("");
    expect(late.state.city).toBe("");
    expect(late.state.phase).toBe("loading");

    const applied = finish(late.state, startedB.lookup!.lookupId, CEP_B, ADDRESS_B);
    expect(applied.state.street).toBe("Avenida Atlântica");
    expect(applied.state.city).toBe("Rio de Janeiro");
    expect(applied.state.state).toBe("RJ");
  });

  it("editar a rua durante a consulta não perde a correção", () => {
    const started = editZip(emptyAddress(), CEP_A);
    const edited = reduceAddress(started.state, {
      type: "edit",
      field: "street",
      value: "Rua Corrigida",
    });
    const done = finish(edited.state, started.lookup!.lookupId, CEP_A, ADDRESS_A);
    expect(done.state.street).toBe("Rua Corrigida");
    expect(done.state.district).toBe("Sé");
    expect(done.state.city).toBe("São Paulo");
    expect(done.state.state).toBe("SP");
    expect(done.state.autoFields).not.toContain("street");
  });

  it("voltar para A depois de B devolve a correção e não consulta de novo", () => {
    const startedA = editZip(emptyAddress(), CEP_A);
    const edited = reduceAddress(startedA.state, {
      type: "edit",
      field: "street",
      value: "Rua Corrigida",
    }).state;
    const filledA = finish(edited, startedA.lookup!.lookupId, CEP_A, ADDRESS_A).state;
    const startedB = editZip(filledA, CEP_B);
    const filledB = finish(startedB.state, startedB.lookup!.lookupId, CEP_B, ADDRESS_B).state;
    expect(filledB.street).toBe("Avenida Atlântica");

    const back = editZip(filledB, CEP_A);
    expect(back.lookup).toBeNull();
    expect(back.state.street).toBe("Rua Corrigida");
    expect(back.state.city).toBe("São Paulo");
    expect(back.state.number).toBe("");
  });

  it("trocar o CEP pede revisão e não apaga número nem complemento", () => {
    const started = editZip(emptyAddress(), CEP_A);
    let state = finish(started.state, started.lookup!.lookupId, CEP_A, ADDRESS_A).state;
    state = reduceAddress(state, { type: "edit", field: "number", value: "50" }).state;
    state = reduceAddress(state, { type: "edit", field: "complement", value: "fundos" }).state;
    const changed = editZip(state, "0131010");
    expect(changed.lookup).toBeNull();
    expect(changed.state.number).toBe("50");
    expect(changed.state.complement).toBe("fundos");
    expect(changed.state.street).toBe("Praça da Sé");
    expect(changed.state.reviewFields).toEqual(["street", "district", "city", "state"]);
    expect(changed.state.message).toContain("o CEP mudou");
  });
});

describe("reduceAddress — falha recuperável", () => {
  it("CEP não encontrado mantém o que já estava digitado", () => {
    let state = reduceAddress(emptyAddress(), { type: "edit", field: "street", value: "Rua Manual" }).state;
    state = reduceAddress(state, { type: "edit", field: "number", value: "9" }).state;
    const started = editZip(state, CEP_A);
    const done = finish(started.state, started.lookup!.lookupId, CEP_A, { kind: "not_found" });
    expect(done.state.phase).toBe("not_found");
    expect(done.state.message).toBe(CEP_MESSAGE.notFound);
    expect(done.state.street).toBe("Rua Manual");
    expect(done.state.number).toBe("9");
  });

  it("CEP inválido e consulta indisponível não apagam o formulário", () => {
    const base = reduceAddress(emptyAddress(), { type: "edit", field: "city", value: "Campinas" }).state;
    const invalid = finish(editZip(base, CEP_A).state, 1, CEP_A, { kind: "invalid" });
    expect(invalid.state.phase).toBe("invalid");
    expect(invalid.state.message).toBe(CEP_MESSAGE.invalid);
    expect(invalid.state.city).toBe("Campinas");

    const again = editZip(invalid.state, CEP_B);
    const down = finish(again.state, again.lookup!.lookupId, CEP_B, { kind: "unavailable" });
    expect(down.state.phase).toBe("unavailable");
    expect(down.state.message).toBe(CEP_MESSAGE.unavailable);
    expect(down.state.city).toBe("Campinas");
  });

  it("resposta sem rua ou bairro preenche o restante e pede o que faltou", () => {
    const started = editZip(emptyAddress(), CEP_A);
    const done = finish(started.state, started.lookup!.lookupId, CEP_A, {
      kind: "missing_street_or_district",
      street: "",
      district: "",
      city: "São Paulo",
      state: "SP",
    });
    expect(done.state.phase).toBe("missing_street_or_district");
    expect(done.state.message).toBe(CEP_MESSAGE.missing);
    expect(done.state.city).toBe("São Paulo");
    expect(done.state.state).toBe("SP");
    expect(done.state.street).toBe("");
    expect(done.state.reviewFields).toEqual(["street", "district"]);
    const manual = reduceAddress(done.state, { type: "edit", field: "street", value: "Rua Sem CEP" });
    expect(manual.state.street).toBe("Rua Sem CEP");
    expect(manual.state.reviewFields).not.toContain("street");
  });
});

describe("fetchViaCep", () => {
  it("consulta só a URL do ViaCEP com oito dígitos", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(viaCepUrl(CEP_A));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          logradouro: "Praça da Sé",
          complemento: "lado ímpar",
          bairro: "Sé",
          localidade: "São Paulo",
          uf: "SP",
        }),
      };
    });
    const result = await fetchViaCep(CEP_A, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: "filled",
      street: "Praça da Sé",
      district: "Sé",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("CEP curto não chama a rede", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchViaCep("0131010", fetchImpl)).toEqual({ kind: "invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("400, erro true, corpo sem rua e falha de rede têm estados próprios", async () => {
    expect(await fetchViaCep(CEP_A, async () => ({ ok: false, status: 400, json: async () => ({}) }))).toEqual({
      kind: "invalid",
    });
    expect(
      await fetchViaCep(CEP_A, async () => ({ ok: true, status: 200, json: async () => ({ erro: true }) })),
    ).toEqual({ kind: "not_found" });
    expect(
      await fetchViaCep(CEP_A, async () => ({
        ok: true,
        status: 200,
        json: async () => ({ logradouro: "", bairro: "", localidade: "Brasília", uf: "DF" }),
      })),
    ).toMatchObject({ kind: "missing_street_or_district", city: "Brasília", state: "DF" });
    expect(await fetchViaCep(CEP_A, async () => { throw new Error("rede"); })).toEqual({ kind: "unavailable" });
    expect(await fetchViaCep(CEP_A, async () => ({ ok: false, status: 503, json: async () => ({}) }))).toEqual({
      kind: "unavailable",
    });
  });
});

describe("addressFromSaved", () => {
  it("guarda só os dígitos do CEP", () => {
    expect(addressFromSaved({ zip: "01310-100" }).zip).toBe(CEP_A);
  });
});
