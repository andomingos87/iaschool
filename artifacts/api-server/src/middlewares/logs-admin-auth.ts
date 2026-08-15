import type { NextFunction, Request, Response } from "express";

// Autorização da tela de logs de geração: exige um usuário autenticado no
// Supabase que seja super_admin aprovado E tenha exatamente o e-mail do
// administrador da IAsport. Outros super_admins recebem 403.

export const LOGS_ADMIN_EMAIL = "iasport@andersondomingos.com.br";

function config(): { url: string; anonKey: string } | null {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const anonKey =
    process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

export async function requireLogsAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const cfg = config();
  if (!cfg) {
    res.status(503).json({
      error:
        "Logs de geração exigem o Supabase configurado (SUPABASE_URL e SUPABASE_ANON_KEY).",
    });
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Você precisa estar logado." });
    return;
  }

  try {
    const authResp = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!authResp.ok) {
      res.status(401).json({ error: "Sessão inválida ou expirada." });
      return;
    }
    const user = (await authResp.json()) as { id?: string; email?: string };
    if (!user?.id || !user.email) {
      res.status(401).json({ error: "Sessão inválida ou expirada." });
      return;
    }
    if (user.email.toLowerCase() !== LOGS_ADMIN_EMAIL) {
      res.status(403).json({ error: "Acesso restrito ao administrador." });
      return;
    }

    // Confirma o papel super_admin aprovado (RLS: usuário lê o próprio perfil).
    const profileResp = await fetch(
      `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,approval_status&limit=1`,
      {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!profileResp.ok) {
      res.status(403).json({ error: "Não foi possível verificar seu perfil." });
      return;
    }
    const profiles = (await profileResp.json()) as Array<{
      role?: string;
      approval_status?: string;
    }>;
    const profile = Array.isArray(profiles) ? profiles[0] : undefined;
    if (
      !profile ||
      profile.role !== "super_admin" ||
      (profile.approval_status && profile.approval_status !== "approved")
    ) {
      res.status(403).json({ error: "Acesso restrito ao administrador." });
      return;
    }

    req.supabaseUserId = user.id;
    next();
  } catch (err) {
    req.log.error({ err }, "Falha ao validar admin dos logs de geração");
    res.status(503).json({
      error: "Não foi possível validar sua sessão agora. Tente novamente.",
    });
  }
}
