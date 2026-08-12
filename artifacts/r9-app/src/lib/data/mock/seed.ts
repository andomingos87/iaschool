import type { AppUser, Metric } from "../types";

/** Usuários de demonstração do modo mock (qualquer senha com 4+ caracteres). */
export const MOCK_USERS: AppUser[] = [
  {
    id: "user-admin",
    email: "admin@r9.com.br",
    name: "Administrador R9",
    role: "super_admin",
    approvalStatus: "approved",
  },
  {
    id: "user-escola",
    email: "escola@r9.com.br",
    name: "Escolinha R9 Osasco",
    role: "school_user",
    schoolName: "R9 Osasco",
    approvalStatus: "approved",
  },
  {
    id: "user-aluno",
    email: "aluno@r9.com.br",
    name: "Aluno Demo",
    role: "student",
    approvalStatus: "approved",
    schoolId: "user-escola",
  },
];

/** As 10 métricas pré-definidas. */
export const PREDEFINED_METRICS: Metric[] = [
  "Chutes",
  "Gols",
  "Passes",
  "Assistências",
  "Roubos de bola",
  "Finalizações",
  "Dribles",
  "Desarmes",
  "Cruzamentos",
  "Defesas",
].map((name, i) => ({
  id: `predef-${i + 1}`,
  name,
  predefined: true,
  createdAt: "2026-01-01T00:00:00.000Z",
}));
