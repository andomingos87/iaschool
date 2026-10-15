// Consulta de CEP da escola (S01, N-D6). ViaCEP é a única fonte.
// A associação dos campos fica fora do formulário para o teste chamá-la
// direto, sem a rede. Número e complemento nunca são preenchidos daqui:
// o complemento do ViaCEP ("lado ímpar") não é o complemento do cadastro.

import { onlyDigits } from "./format";

export const VIA_CEP_ORIGIN = "https://viacep.com.br/ws";

export type AutoField = "street" | "district" | "city" | "state";

export type AddressField = "zip" | "number" | "complement" | AutoField;

export type CepPhase =
  | "idle"
  | "incomplete"
  | "loading"
  | "filled"
  | "not_found"
  | "invalid"
  | "unavailable"
  | "missing_street_or_district";

export interface ViaCepAddress {
  street: string;
  district: string;
  city: string;
  state: string;
}

export type ViaCepOutcome =
  | ({ kind: "filled" } & ViaCepAddress)
  | ({ kind: "missing_street_or_district" } & ViaCepAddress)
  | { kind: "not_found" }
  | { kind: "invalid" }
  | { kind: "unavailable" };

export interface SavedAddress {
  zip?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
}

export interface AddressSnapshot {
  street: string;
  district: string;
  city: string;
  state: string;
}

export interface AddressDraft {
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  phase: CepPhase;
  message: string;
  /** Campos escritos pela associação do CEP que está na tela. */
  autoFields: AutoField[];
  /** Campos que a pessoa precisa rever depois que o CEP mudou. */
  reviewFields: AutoField[];
  /** CEP da associação aplicada na tela. */
  associatedCep: string | null;
  /** CEP gravado ao abrir. Não dispara consulta até a pessoa trocar e voltar com outro pedido. */
  loadedZip: string;
  /** CEPs já enviados ao ViaCEP neste fluxo. */
  requestedCeps: string[];
  lookupId: number;
  /** lookupId emitido para cada CEP. Resposta com outro id é ignorada. */
  issuedLookup: Record<string, number>;
  outcomes: Record<string, ViaCepOutcome>;
  /** Valores dos quatro campos automáticos por CEP, depois da resposta ou da edição. */
  snapshots: Record<string, AddressSnapshot>;
  /**
   * Resultado chegou com outro CEP na tela. Ao voltar, a resposta se aplica;
   * o snapshot antigo não esconde esse resultado.
   */
  pendingOutcome: Record<string, true>;
  /** Campos editados durante a consulta daquele CEP. */
  locks: Partial<Record<string, AutoField[]>>;
  touchedDuringLookup: AutoField[];
}

export interface LookupRequest {
  cep: string;
  lookupId: number;
}

export interface AddressStep {
  state: AddressDraft;
  lookup: LookupRequest | null;
}

export type CepAction =
  | { type: "load"; address?: SavedAddress | null }
  | { type: "edit"; field: AddressField; value: string }
  | { type: "lookup-finished"; lookupId: number; cep: string; result: ViaCepOutcome };

const AUTO_FIELDS: readonly AutoField[] = ["street", "district", "city", "state"];

const FIELD_LABEL: Record<AutoField, string> = {
  street: "logradouro",
  district: "bairro",
  city: "cidade",
  state: "UF",
};

export const CEP_MESSAGE = {
  loading: "Buscando endereço…",
  invalid: "CEP inválido. Preencha o endereço manualmente.",
  notFound: "CEP não encontrado. Preencha o endereço manualmente.",
  unavailable: "Consulta de CEP indisponível. Preencha o endereço manualmente.",
  missing: "O CEP não trouxe rua ou bairro. Complete esses campos.",
} as const;

export function emptyAddress(): AddressDraft {
  return {
    zip: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    phase: "idle",
    message: "",
    autoFields: [],
    reviewFields: [],
    associatedCep: null,
    loadedZip: "",
    requestedCeps: [],
    lookupId: 0,
    issuedLookup: {},
    outcomes: {},
    snapshots: {},
    pendingOutcome: {},
    locks: {},
    touchedDuringLookup: [],
  };
}

function snapshotOf(state: Pick<AddressDraft, AutoField>): AddressSnapshot {
  return {
    street: state.street,
    district: state.district,
    city: state.city,
    state: state.state,
  };
}

export function addressFromSaved(address?: SavedAddress | null): AddressDraft {
  const zip = onlyDigits(address?.zip ?? "").slice(0, 8);
  const draft = emptyAddress();
  draft.zip = zip;
  draft.street = address?.street ?? "";
  draft.number = address?.number ?? "";
  draft.complement = address?.complement ?? "";
  draft.district = address?.district ?? "";
  draft.city = address?.city ?? "";
  draft.state = (address?.state ?? "").toUpperCase();
  draft.loadedZip = zip.length === 8 ? zip : "";
  if (draft.loadedZip) draft.snapshots[draft.loadedZip] = snapshotOf(draft);
  return draft;
}

function clone(state: AddressDraft): AddressDraft {
  return {
    ...state,
    autoFields: [...state.autoFields],
    reviewFields: [...state.reviewFields],
    requestedCeps: [...state.requestedCeps],
    issuedLookup: { ...state.issuedLookup },
    outcomes: { ...state.outcomes },
    snapshots: Object.fromEntries(
      Object.entries(state.snapshots).map(([cep, snap]) => [cep, { ...snap }]),
    ),
    pendingOutcome: { ...state.pendingOutcome },
    locks: Object.fromEntries(
      Object.entries(state.locks).map(([cep, fields]) => [cep, [...(fields ?? [])]]),
    ),
    touchedDuringLookup: [...state.touchedDuringLookup],
  };
}

function reviewMessage(fields: readonly AutoField[]): string {
  if (fields.length === 0) return "";
  return `Revise ${fields.map((field) => FIELD_LABEL[field]).join(", ")}: o CEP mudou.`;
}

function phaseOf(outcome: ViaCepOutcome): CepPhase {
  if (outcome.kind === "filled") return "filled";
  if (outcome.kind === "missing_street_or_district") return "missing_street_or_district";
  if (outcome.kind === "not_found") return "not_found";
  if (outcome.kind === "invalid") return "invalid";
  return "unavailable";
}

function messageOf(outcome: ViaCepOutcome, reviewFields: readonly AutoField[]): string {
  if (outcome.kind === "filled") return reviewMessage(reviewFields);
  if (outcome.kind === "missing_street_or_district") return CEP_MESSAGE.missing;
  if (outcome.kind === "not_found") return CEP_MESSAGE.notFound;
  if (outcome.kind === "invalid") return CEP_MESSAGE.invalid;
  return CEP_MESSAGE.unavailable;
}

function remember(state: AddressDraft, cep: string) {
  if (!state.requestedCeps.includes(cep)) state.requestedCeps.push(cep);
}

function rememberSnapshot(state: AddressDraft, cep: string) {
  if (cep.length === 8) state.snapshots[cep] = snapshotOf(state);
}

function invalidateAssociation(state: AddressDraft) {
  if (state.autoFields.length === 0) return;
  const review = new Set(state.reviewFields);
  for (const field of state.autoFields) review.add(field);
  state.reviewFields = [...review];
  state.autoFields = [];
  state.associatedCep = null;
}

function restoreSnapshot(state: AddressDraft, cep: string): AddressDraft {
  const snap = state.snapshots[cep];
  if (!snap) return state;
  const next = clone(state);
  next.street = snap.street;
  next.district = snap.district;
  next.city = snap.city;
  next.state = snap.state;
  const outcome = next.outcomes[cep];
  if (outcome) {
    next.phase = phaseOf(outcome);
    next.message = messageOf(outcome, []);
    next.reviewFields = [];
    next.associatedCep =
      outcome.kind === "filled" || outcome.kind === "missing_street_or_district" ? cep : null;
    next.autoFields =
      outcome.kind === "filled" || outcome.kind === "missing_street_or_district"
        ? AUTO_FIELDS.filter((field) => !(next.locks[cep] ?? []).includes(field) && snap[field] !== "")
        : [];
  } else {
    next.phase = "idle";
    next.message = "";
    next.associatedCep = null;
    next.autoFields = [];
    next.reviewFields = [];
  }
  next.touchedDuringLookup = [];
  return next;
}

function applyOutcome(state: AddressDraft, cep: string, outcome: ViaCepOutcome): AddressDraft {
  const next = clone(state);
  next.outcomes[cep] = outcome;
  next.phase = phaseOf(outcome);
  next.touchedDuringLookup = [];
  if (outcome.kind !== "filled" && outcome.kind !== "missing_street_or_district") {
    next.associatedCep = null;
    next.autoFields = [];
    next.message = messageOf(outcome, next.reviewFields);
    delete next.pendingOutcome[cep];
    rememberSnapshot(next, cep);
    return next;
  }

  const locked = new Set(next.locks[cep] ?? []);
  const written: AutoField[] = [];
  const review = new Set(next.reviewFields);
  const values: Record<AutoField, string> = {
    street: outcome.street,
    district: outcome.district,
    city: outcome.city,
    state: outcome.state.toUpperCase(),
  };
  for (const field of AUTO_FIELDS) {
    const value = values[field];
    if (locked.has(field)) {
      review.delete(field);
      continue;
    }
    if (!value) {
      review.add(field);
      continue;
    }
    next[field] = value;
    written.push(field);
    review.delete(field);
  }
  next.autoFields = written;
  next.reviewFields = [...review];
  next.associatedCep = cep;
  next.message = messageOf(outcome, next.reviewFields);
  delete next.pendingOutcome[cep];
  rememberSnapshot(next, cep);
  return next;
}

export function reduceAddress(state: AddressDraft, action: CepAction): AddressStep {
  if (action.type === "load") {
    return { state: addressFromSaved(action.address), lookup: null };
  }

  if (action.type === "edit") {
    const next = clone(state);
    if (action.field === "zip") {
      const digits = onlyDigits(action.value).slice(0, 8);
      if (digits === next.zip) return { state: next, lookup: null };
      if (next.zip.length === 8) {
        rememberSnapshot(next, next.zip);
        delete next.pendingOutcome[next.zip];
      }
      next.zip = digits;
      next.lookupId += 1;
      invalidateAssociation(next);
      next.touchedDuringLookup = [];
      if (digits.length !== 8) {
        next.phase = digits.length === 0 ? "idle" : "incomplete";
        next.message = reviewMessage(next.reviewFields);
        return { state: next, lookup: null };
      }
      if (next.pendingOutcome[digits] && next.outcomes[digits]) {
        return { state: applyOutcome(next, digits, next.outcomes[digits]), lookup: null };
      }
      if (next.snapshots[digits]) {
        return { state: restoreSnapshot(next, digits), lookup: null };
      }
      if (next.requestedCeps.includes(digits)) {
        next.phase = "loading";
        next.message = CEP_MESSAGE.loading;
        return { state: next, lookup: null };
      }
      remember(next, digits);
      next.issuedLookup[digits] = next.lookupId;
      next.phase = "loading";
      next.message = CEP_MESSAGE.loading;
      return { state: next, lookup: { cep: digits, lookupId: next.lookupId } };
    }

    next[action.field] = action.field === "state" ? action.value.toUpperCase() : action.value;
    if (action.field !== "number" && action.field !== "complement") {
      if (next.phase === "loading" && next.zip.length === 8) {
        const locks = new Set(next.locks[next.zip] ?? []);
        locks.add(action.field);
        next.locks[next.zip] = [...locks];
        if (!next.touchedDuringLookup.includes(action.field)) {
          next.touchedDuringLookup.push(action.field);
        }
      }
      next.reviewFields = next.reviewFields.filter((field) => field !== action.field);
      next.autoFields = next.autoFields.filter((field) => field !== action.field);
      if (next.zip.length === 8) rememberSnapshot(next, next.zip);
      if (next.phase !== "loading") next.message = reviewMessage(next.reviewFields);
    }
    return { state: next, lookup: null };
  }

  if (state.issuedLookup[action.cep] !== action.lookupId) {
    return { state, lookup: null };
  }
  if (state.outcomes[action.cep] && state.zip === action.cep && state.phase !== "loading") {
    return { state, lookup: null };
  }
  const stored = clone(state);
  stored.outcomes[action.cep] = action.result;
  if (stored.zip !== action.cep) {
    stored.pendingOutcome[action.cep] = true;
    return { state: stored, lookup: null };
  }
  return { state: applyOutcome(stored, action.cep, action.result), lookup: null };
}

export function viaCepUrl(digits: string): string {
  return `${VIA_CEP_ORIGIN}/${digits}/json/`;
}

type ViaCepResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

/**
 * Adaptador fino. `fetchImpl` existe para o teste injetar a fronteira HTTP
 * sem simular esta função. Menos de 8 dígitos nem chega na rede.
 */
export async function fetchViaCep(
  digits: string,
  fetchImpl: (url: string) => Promise<ViaCepResponse> = fetch,
): Promise<ViaCepOutcome> {
  if (!/^\d{8}$/.test(digits)) return { kind: "invalid" };
  try {
    const response = await fetchImpl(viaCepUrl(digits));
    if (response.status === 400) return { kind: "invalid" };
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return { kind: "unavailable" };
    if (body["erro"] === true || body["erro"] === "true") return { kind: "not_found" };
    const street = String(body["logradouro"] ?? "").trim();
    const district = String(body["bairro"] ?? "").trim();
    const city = String(body["localidade"] ?? "").trim();
    const state = String(body["uf"] ?? "").trim().toUpperCase();
    if (!street || !district) {
      return { kind: "missing_street_or_district", street, district, city, state };
    }
    return { kind: "filled", street, district, city, state };
  } catch {
    return { kind: "unavailable" };
  }
}
