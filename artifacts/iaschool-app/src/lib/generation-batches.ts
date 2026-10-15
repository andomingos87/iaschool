import {
  getDataLayer,
  isAuthorizationActive,
  type DataLayer,
  type Student,
  type SchoolClass,
  classLabel,
} from "./data";
import { generationBlockers } from "./eca";

export interface BatchPhoto {
  source: "profile" | "event";
  id: string;
}
export interface GenerationBatchItem {
  id: string;
  studentId: string;
  status: "pending" | "processing" | "completed" | "failed" | "unknown";
  photo: BatchPhoto;
  imageUrl?: string;
  postId?: string;
  error?: string;
}
export interface GenerationBatch {
  id: string;
  status: "pending" | "processing" | "completed" | "partial" | "failed";
  prompt: string;
  total: number;
  completed: number;
  failed: number;
  items: GenerationBatchItem[];
}
export interface GenerationPhotoChoice extends BatchPhoto {
  url: string;
  eventId?: string;
  eventName?: string;
}
export type GenerationBatchSummary = Omit<GenerationBatch, "items">;
export interface GenerationEligibility {
  students: { studentId: string; photoId: string }[];
  remainingQuota: number;
}
export interface CreateGenerationBatch {
  requestId: string;
  schoolId: string;
  prompt: string;
  students: { studentId: string; photo: BatchPhoto }[];
}
export interface GenerationBatchService {
  eligibility(schoolId: string): Promise<GenerationEligibility>;
  photos(studentId: string): Promise<{ photos: GenerationPhotoChoice[] }>;
  create(input: CreateGenerationBatch): Promise<GenerationBatch>;
  list(schoolId: string): Promise<GenerationBatchSummary[]>;
  get(id: string): Promise<GenerationBatch>;
  retry(
    id: string,
    input: { requestId: string; itemIds: string[] },
  ): Promise<GenerationBatch>;
}
export function eligibleRoster(
  students: Student[],
  schoolId: string,
  eligibility: GenerationEligibility | undefined,
): Student[] {
  const ids = new Set(eligibility?.students.map((s) => s.studentId));
  return students.filter((s) => s.schoolId === schoolId && ids.has(s.id));
}
export function addEligibleStudents(
  selected: readonly string[],
  added: readonly string[],
  eligible: readonly Student[],
): string[] {
  const allowed = new Set(eligible.map((s) => s.id));
  return [...new Set([...selected, ...added])].filter((id) => allowed.has(id));
}
export function classSelection(
  schoolClass: SchoolClass,
  students: readonly Student[],
  eligible: readonly Student[],
) {
  const members = students.filter(
    (s) => s.schoolId === schoolClass.schoolId && s.classId === schoolClass.id,
  );
  const ids = new Set(eligible.map((s) => s.id));
  return {
    id: schoolClass.id,
    label: classLabel(schoolClass),
    total: members.length,
    eligibleIds: members.filter((s) => ids.has(s.id)).map((s) => s.id),
  };
}
export function batchIsActive(batch: GenerationBatch) {
  return batch.status === "pending" || batch.status === "processing";
}
export function failedBatchItemIds(batch: GenerationBatch) {
  return batch.items.filter((i) => i.status === "failed").map((i) => i.id);
}
export function batchReviewError(
  prompt: string,
  students: readonly { studentId: string; photo: BatchPhoto }[],
  remaining: number,
) {
  if (!prompt.trim() || prompt.trim().length > 3000)
    return "Descreva a arte com até 3.000 caracteres.";
  if (students.length > 50) return "Escolha até 50 alunos por lote.";
  if (!students.length) return "Escolha pelo menos um aluno.";
  if (new Set(students.map((s) => s.studentId)).size !== students.length)
    return "Confira os alunos selecionados.";
  if (students.some((s) => !s.photo.id))
    return "Escolha uma foto para cada aluno.";
  if (students.length > remaining)
    return `São ${students.length} artes e você tem ${remaining} gerações disponíveis.`;
  return null;
}
export class GenerationBatchRequestError extends Error {
  constructor(
    message: string,
    public readonly definitive: boolean,
  ) {
    super(message);
  }
}
const safeErrors: Record<string, string> = {
  quota_exceeded:
    "A cota não é suficiente para este lote. Ajuste a seleção ou tente amanhã.",
  student_ineligible: "Uma autorização mudou. Atualize os alunos aptos.",
  photo_ineligible: "Uma foto deixou de estar disponível. Escolha outra foto.",
  invalid_input: "Confira os dados do lote.",
  forbidden: "Você não tem permissão para esta escola.",
  not_eligible:
    "Uma autorização ou foto mudou. Atualize os alunos aptos antes de gerar.",
  invalid_photo:
    "Uma foto deixou de estar disponível para este aluno. Escolha outra foto.",
  request_conflict:
    "Este pedido já foi recebido. Atualize o progresso antes de repetir.",
};
export function createGenerationBatchService(
  token: () => Promise<string | null>,
  transport: typeof fetch = fetch,
): GenerationBatchService {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const jwt = await token();
    if (!jwt) throw new Error("Entre novamente com sua conta da escola.");
    const response = await transport(`/api/generation/batches${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Não foi possível consultar a geração. Atualize o progresso.",
      );
    }
    if (!response.ok) {
      const code = (data as { code?: string }).code;
      throw new GenerationBatchRequestError(
        safeErrors[code ?? ""] ??
          "Não foi possível concluir. Atualize o progresso antes de tentar novamente.",
        response.status >= 400 &&
          response.status < 500 &&
          code !== "request_conflict",
      );
    }
    return data as T;
  }
  return {
    photos: (id) => call(`/photos?studentId=${encodeURIComponent(id)}`),
    eligibility: (id) =>
      call(`/eligibility?schoolId=${encodeURIComponent(id)}`),
    create: (input) => call("", input),
    list: async (id) =>
      (
        await call<{ batches: GenerationBatchSummary[] }>(
          `?schoolId=${encodeURIComponent(id)}`,
        )
      ).batches,
    get: (id) => call(`/${encodeURIComponent(id)}`),
    retry: (id, input) => call(`/${encodeURIComponent(id)}/retry`, input),
  };
}
/** Only the demonstration adapter simulates progress. Production work is server-owned. */
export function createMockGenerationBatchService(
  data: DataLayer,
  opts: {
    failStudentIds?: string[];
    eventPhotos?: Record<string, GenerationPhotoChoice[]>;
  } = {},
): GenerationBatchService {
  const key = "iaschool:demo-generation-batches";
  type Stored = {
    schoolId: string;
    created: number;
    retried: string[];
    retryRequests?: string[];
    batch: GenerationBatch;
  };
  const read = (): Stored[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]") as Stored[];
    } catch {
      return [];
    }
  };
  const write = (rows: Stored[]) =>
    localStorage.setItem(key, JSON.stringify(rows));
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  }
  async function photoChoices(id: string) {
    const student = await data.students.get(id);
    return {
      photos: [
        ...(student?.photos ?? []).map((p) => ({
          source: "profile" as const,
          id: p.id,
          url: p.url,
        })),
        ...(opts.eventPhotos?.[id] ?? []),
      ],
    };
  }
  async function eligibility(schoolId: string) {
    const students = (await data.students.list()).filter(
      (s) => s.schoolId === schoolId,
    );
    const allowed = await Promise.all(
      students.map(async (student) => {
        const active = (
          await data.authorizations.listForStudent(student.id)
        ).some(
          (a) => a.scope === "biometric_sorting" && isAuthorizationActive(a),
        );
        return active &&
          student.photos[0] &&
          generationBlockers(student, { biometricSortingActive: active })
            .length === 0
          ? { studentId: student.id, photoId: student.photos[0].id }
          : null;
      }),
    );
    return {
      students: allowed.filter((s): s is NonNullable<typeof s> => Boolean(s)),
      remainingQuota: Math.max(
        0,
        50 -
          read()
            .filter(
              (row) =>
                row.schoolId === schoolId &&
                new Date(row.created).toDateString() ===
                  new Date().toDateString(),
            )
            .reduce(
              (count, row) => count + row.batch.total + row.retried.length,
              0,
            ),
      ),
    };
  }
  async function advance(row: Stored) {
    const age = Date.now() - row.created;
    for (let index = 0; index < row.batch.items.length; index++) {
      const item = row.batch.items[index]!;
      if (item.status !== "pending" && item.status !== "processing") continue;
      if (age < (index + 1) * 1200) {
        item.status =
          index === Math.floor(age / 1200) ? "processing" : "pending";
        continue;
      }
      if (
        opts.failStudentIds?.includes(item.studentId) &&
        !row.retried.includes(item.id)
      ) {
        item.status = "failed";
        item.error = "Falha simulada. Tente novamente apenas esta arte.";
        continue;
      }
      const student = await data.students.get(item.studentId);
      if (!student) {
        item.status = "failed";
        item.error = "Aluno indisponível.";
        continue;
      }
      const image = (await photoChoices(student.id)).photos.find(
        (p) => p.id === item.photo.id && p.source === item.photo.source,
      );
      if (!image) {
        item.status = "failed";
        continue;
      }
      try {
        const saved = await data.generatedPosts.create({
          studentId: student.id,
          imageUrl: image.url,
          details: {
            prompt: row.batch.prompt,
            model: "demonstracao",
            size: "1024x1024",
            images: [],
          },
        });
        item.status = "completed";
        item.imageUrl = saved.imageUrl;
        item.postId = saved.id;
      } catch {
        item.status = "failed";
        item.error =
          "Não foi possível salvar esta arte de demonstração. As outras continuam.";
      }
    }
    row.batch.completed = row.batch.items.filter(
      (i) => i.status === "completed",
    ).length;
    row.batch.failed = row.batch.items.filter(
      (i) => i.status === "failed" || i.status === "unknown",
    ).length;
    row.batch.status = row.batch.items.some(
      (i) => i.status === "pending" || i.status === "processing",
    )
      ? "processing"
      : row.batch.failed
        ? row.batch.completed
          ? "partial"
          : "failed"
        : "completed";
    return row.batch;
  }
  return {
    eligibility,
    photos: photoChoices,
    async create(input) {
      return serial(async () => {
        const rows = read();
        const previous = rows.find((r) => r.batch.id === input.requestId);
        if (previous) return previous.batch;
        const eligible = await eligibility(input.schoolId);
        const allowed = new Set(eligible.students.map((s) => s.studentId));
        const error = batchReviewError(
          input.prompt,
          input.students,
          eligible.remainingQuota,
        );
        if (error || input.students.some((s) => !allowed.has(s.studentId)))
          throw new Error(error ?? "Aluno não está apto.");
        for (const item of input.students)
          if (
            !(await photoChoices(item.studentId)).photos.some(
              (p) => p.id === item.photo.id && p.source === item.photo.source,
            )
          )
            throw new Error("Foto indisponível.");
        const batch: GenerationBatch = {
          id: input.requestId,
          status: "pending",
          prompt: input.prompt,
          total: input.students.length,
          completed: 0,
          failed: 0,
          items: input.students.map((s) => ({
            id: crypto.randomUUID(),
            studentId: s.studentId,
            photo: s.photo,
            status: "pending",
          })),
        };
        rows.unshift({
          schoolId: input.schoolId,
          created: Date.now(),
          retried: [],
          batch,
        });
        write(rows);
        return structuredClone(batch);
      });
    },
    async list(id) {
      return serial(async () => {
        const rows = read();
        for (const row of rows.filter((r) => r.schoolId === id))
          await advance(row);
        write(rows);
        return structuredClone(
          rows.filter((r) => r.schoolId === id).map((r) => r.batch),
        );
      });
    },
    async get(id) {
      return serial(async () => {
        const rows = read(),
          row = rows.find((r) => r.batch.id === id);
        if (!row) throw new Error("Lote não encontrado.");
        await advance(row);
        write(rows);
        return structuredClone(row.batch);
      });
    },
    async retry(id, input) {
      return serial(async () => {
        const rows = read(),
          row = rows.find((r) => r.batch.id === id);
        if (!row) throw new Error("Lote não encontrado.");
        if (row.retryRequests?.includes(input.requestId))
          return structuredClone(row.batch);
        if (!input.itemIds.length || batchIsActive(row.batch))
          throw new Error("Confira os itens antes de repetir.");
        if (
          input.itemIds.some(
            (id) =>
              !row.batch.items.some(
                (i) =>
                  i.id === id &&
                  (i.status === "failed" || i.status === "unknown"),
              ),
          )
        )
          throw new Error("Este item não permite nova tentativa.");
        const eligible = await eligibility(row.schoolId);
        if (input.itemIds.length > eligible.remainingQuota)
          throw new Error("Cota insuficiente para repetir estas artes.");
        row.retryRequests = [...(row.retryRequests ?? []), input.requestId];
        for (const itemId of input.itemIds) {
          const item = row.batch.items.find((i) => i.id === itemId);
          if (item?.status !== "failed" && item?.status !== "unknown")
            throw new Error("Só uma falha confirmada permite nova tentativa.");
          item.status = "pending";
          row.retried.push(item.id);
        }
        row.created = Date.now();
        row.batch.status = "pending";
        write(rows);
        return structuredClone(row.batch);
      });
    },
  };
}
let service: GenerationBatchService | null = null;
export function getGenerationBatchService(): GenerationBatchService {
  const data = getDataLayer();
  return (service ??= data.isMock
    ? createMockGenerationBatchService(data)
    : createGenerationBatchService(() => data.auth.getAccessToken()));
}

export interface GenerationSelection {
  studentIds: string[];
  classIds: string[];
  excludedStudentIds: string[];
}
export const EMPTY_GENERATION_SELECTION: GenerationSelection = {
  studentIds: [],
  classIds: [],
  excludedStudentIds: [],
};
export function expandGenerationSelection(
  selection: GenerationSelection,
  eligible: readonly Student[],
): string[] {
  const classIds = new Set(selection.classIds),
    direct = new Set(selection.studentIds),
    excluded = new Set(selection.excludedStudentIds);
  return eligible
    .filter(
      (s) =>
        direct.has(s.id) ||
        (Boolean(s.classId && classIds.has(s.classId)) && !excluded.has(s.id)),
    )
    .map((s) => s.id);
}
export function toggleGenerationStudent(
  selection: GenerationSelection,
  id: string,
  eligible: readonly Student[],
): GenerationSelection {
  const selected = expandGenerationSelection(selection, eligible).includes(id);
  return selected
    ? {
        ...selection,
        studentIds: selection.studentIds.filter((value) => value !== id),
        excludedStudentIds: [...new Set([...selection.excludedStudentIds, id])],
      }
    : {
        ...selection,
        studentIds: [...new Set([...selection.studentIds, id])],
        excludedStudentIds: selection.excludedStudentIds.filter(
          (value) => value !== id,
        ),
      };
}
export function toggleGenerationClass(
  selection: GenerationSelection,
  id: string,
  eligible: readonly Student[],
): GenerationSelection {
  return selection.classIds.includes(id)
    ? {
        ...selection,
        classIds: selection.classIds.filter((value) => value !== id),
      }
    : {
        ...selection,
        classIds: [...selection.classIds, id],
        excludedStudentIds: selection.excludedStudentIds.filter(
          (studentId) =>
            !eligible.some((s) => s.id === studentId && s.classId === id),
        ),
      };
}

/** Explicit functional fixture hook; impossible on hosted/real-data surfaces. */
export function installGenerationBatchFixtureService(
  fixture: GenerationBatchService,
): void {
  if (
    typeof location === "undefined" ||
    !["localhost", "127.0.0.1"].includes(location.hostname) ||
    !getDataLayer().isMock
  )
    throw new Error("Fixture exige localhost em demonstração.");
  service = fixture;
}

/** Busca por nome/rótulo visível; IDs e prefixos técnicos não entram no filtro. */
export function generationSearchMatch(label: string, search: string): boolean {
  const normalize = (text: string) => text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");
  return normalize(label).includes(normalize(search));
}
