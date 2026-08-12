// Implementação mock (localStorage) do contrato Supabase — ver ../contract.ts
// Troca futura: substituir createMockDataLayer() por createSupabaseDataLayer()
// em ../index.ts, mantendo as mesmas interfaces.

import type {
  AuthService,
  ClubRepository,
  DataLayer,
  GeneratedPostRepository,
  ImageGenerationService,
  MetricRepository,
  ReferenceRepository,
  StorageService,
  StudentRepository,
} from "../contract";
import type {
  Club,
  GeneratedPost,
  Metric,
  ReferencePost,
  Session,
  StoredImage,
  Student,
} from "../types";
import { PREDEFINED_METRICS, MOCK_USERS } from "./seed";
import {
  delay,
  newId,
  nowIso,
  readCollection,
  readValue,
  writeCollection,
  writeValue,
} from "./store";
import { composePostImage } from "./generation";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(blob);
  });
}

const auth: AuthService = {
  async getSession() {
    await delay(200);
    return readValue<Session>("session");
  },
  async signIn(email, password) {
    await delay(600);
    const user = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!user || password.length < 4) {
      throw new Error("E-mail ou senha inválidos");
    }
    const session: Session = {
      user,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    };
    writeValue("session", session);
    listeners.forEach((cb) => cb(session));
    return session;
  },
  async signOut() {
    await delay(200);
    writeValue("session", null);
    listeners.forEach((cb) => cb(null));
  },
  onAuthStateChange(cb) {
    listeners.push(cb);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
};
const listeners: Array<(s: Session | null) => void> = [];

const storage: StorageService = {
  async upload(bucket, file, fileName) {
    await delay(250);
    const url = await blobToDataUrl(file);
    const img: StoredImage = {
      id: newId(),
      url,
      path: `${bucket}/${Date.now()}-${fileName}`,
      createdAt: nowIso(),
    };
    return img;
  },
  async remove() {
    await delay(100);
  },
};

function makeCrud<T extends { id: string; createdAt: string }>(key: string) {
  return {
    async list(): Promise<T[]> {
      await delay();
      return readCollection<T>(key, []);
    },
    async get(id: string): Promise<T | null> {
      await delay(200);
      return readCollection<T>(key, []).find((x) => x.id === id) ?? null;
    },
    async create(input: Record<string, unknown>): Promise<T> {
      await delay(400);
      const item = {
        ...input,
        id: newId(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } as unknown as T;
      const items = readCollection<T>(key, []);
      items.unshift(item);
      writeCollection(key, items);
      return item;
    },
    async update(id: string, patch: Record<string, unknown>): Promise<T> {
      await delay(400);
      const items = readCollection<T>(key, []);
      const idx = items.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error("Registro não encontrado");
      items[idx] = { ...items[idx], ...patch, updatedAt: nowIso() } as T;
      writeCollection(key, items);
      return items[idx];
    },
    async delete(id: string): Promise<void> {
      await delay(300);
      writeCollection(
        key,
        readCollection<T>(key, []).filter((x) => x.id !== id),
      );
    },
  };
}

const students = makeCrud<Student>("students") as StudentRepository;
const clubs = makeCrud<Club>("clubs") as ClubRepository;

const referencesCrud = makeCrud<ReferencePost>("references");
const references: ReferenceRepository = {
  list: () => referencesCrud.list(),
  create: (input) => referencesCrud.create(input as Record<string, unknown>),
  delete: (id) => referencesCrud.delete(id),
};

const metrics: MetricRepository = {
  async list() {
    await delay(250);
    const custom = readCollection<Metric>("custom-metrics", []);
    return [...PREDEFINED_METRICS, ...custom];
  },
  async createCustom(name) {
    await delay(350);
    const metric: Metric = {
      id: newId(),
      name: name.trim(),
      predefined: false,
      createdAt: nowIso(),
    };
    const custom = readCollection<Metric>("custom-metrics", []);
    custom.push(metric);
    writeCollection("custom-metrics", custom);
    return metric;
  },
  async delete(id) {
    await delay(250);
    writeCollection(
      "custom-metrics",
      readCollection<Metric>("custom-metrics", []).filter((m) => m.id !== id),
    );
  },
};

const generatedPostsCrud = makeCrud<GeneratedPost>("generated-posts");
const generatedPosts: GeneratedPostRepository = {
  list: () => generatedPostsCrud.list(),
  create: (input) =>
    generatedPostsCrud.create(input as Record<string, unknown>),
};

const generation: ImageGenerationService = {
  async generate(request) {
    // Simula o tempo de geração da IA (a UI mostra frases rotativas).
    await delay(6000 + Math.random() * 3000);
    const imageUrl = await composePostImage(request);
    return { imageUrl };
  },
};

export function createMockDataLayer(): DataLayer {
  return {
    auth,
    storage,
    students,
    clubs,
    references,
    metrics,
    generatedPosts,
    generation,
    isMock: true,
  };
}
