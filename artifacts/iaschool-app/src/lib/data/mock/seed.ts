import type { AppUser, SchoolBrand } from "../types";

/** Escola de demonstração do modo mock (id = uid do professor, como no M1). */
export const MOCK_SCHOOLS: SchoolBrand[] = [
  {
    id: "user-escola",
    name: "Escola Horizonte",
    colors: [],
    createdAt: "2026-08-30T12:00:00.000Z",
    updatedAt: "2026-08-30T12:00:00.000Z",
  },
];

/** Usuários de demonstração do modo mock (qualquer senha com 4+ caracteres). */
export const MOCK_USERS: AppUser[] = [
  {
    id: "user-admin",
    email: "admin@iaschool.demo",
    name: "Administrador IAschool",
    role: "super_admin",
    approvalStatus: "approved",
    schools: [],
  },
  {
    id: "user-escola",
    email: "professor@iaschool.demo",
    name: "Professor Horizonte",
    role: "user",
    schoolName: "Escola Horizonte",
    approvalStatus: "approved",
    schools: [
      { schoolId: "user-escola", schoolName: "Escola Horizonte", role: "school_admin" },
    ],
  },
];
