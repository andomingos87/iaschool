import { isPlatformAdmin, type ApprovalStatus, type UserRole } from "./data/types";

export type AppEntry = "pending" | "unlinked" | "app";

/**
 * Para onde a sessão aprovada (ou não) vai.
 * Plataforma sem vínculo entra no app. Conta da escola sem vínculo não entra.
 */
export function appEntry(user: {
  role: UserRole;
  approvalStatus: ApprovalStatus;
  schools: readonly unknown[];
}): AppEntry {
  if (user.approvalStatus !== "approved") return "pending";
  if (!isPlatformAdmin(user.role) && user.schools.length === 0) return "unlinked";
  return "app";
}
