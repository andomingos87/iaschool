import type { AppUser } from "../types";

/** Usuários de demonstração do modo mock (qualquer senha com 4+ caracteres). */
export const MOCK_USERS: AppUser[] = [
  {
    id: "user-admin",
    email: "admin@iaschool.demo",
    name: "Administrador IAschool",
    role: "super_admin",
    approvalStatus: "approved",
  },
  {
    id: "user-escola",
    email: "professor@iaschool.demo",
    name: "Professor Horizonte",
    role: "school_user",
    schoolName: "Escola Horizonte",
    approvalStatus: "approved",
  },
  {
    id: "user-aluno",
    email: "aluno@iaschool.demo",
    name: "Aluno Demo",
    role: "student",
    approvalStatus: "approved",
    schoolId: "user-escola",
  },
];
