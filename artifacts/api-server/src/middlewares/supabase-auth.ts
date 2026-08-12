import type { NextFunction, Request, Response } from "express";

// Uid do usuário autenticado, preenchido pelo middleware para uso nas rotas
// (ex.: cota de geração por usuário).
declare global {
  namespace Express {
    interface Request {
      supabaseUserId?: string;
    }
  }
}

// Validação de sessão do Supabase (app R9 Escolinhas).
// Quando SUPABASE_URL/SUPABASE_ANON_KEY estão configuradas, o endpoint exige
// um access token válido (Authorization: Bearer <jwt>) e o valida chamando
// o Auth do Supabase (GET /auth/v1/user). Sem essas variáveis, o app roda em
// modo demonstração e a rota permanece aberta (comportamento anterior).

function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const anonKey =
    process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

export async function requireSupabaseUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const config = supabaseConfig();
  if (!config) {
    // Modo demonstração: sem Supabase configurado, bloquear por padrão.
    // Para evitar que este modo sirva de brecha em produção, rejeitar se
    // OPENAI_API_KEY estiver presente mas o Supabase não estiver configurado.
    const hasOpenAI = Boolean(process.env["OPENAI_API_KEY"]);
    if (hasOpenAI) {
      res.status(503).json({
        error:
          "Configuração incompleta: SUPABASE_URL e SUPABASE_ANON_KEY são necessárias para usar a geração de imagens.",
      });
      return;
    }
    // Sem OpenAI nem Supabase: ambiente de dev puro — deixar passar para o
    // handler retornar o erro de OPENAI_API_KEY ausente.
    next();
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({
      error: "Você precisa estar logado para gerar imagens. Entre e tente de novo.",
    });
    return;
  }

  try {
    // 1. Validar o JWT e obter o uid do usuário.
    const authResp = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!authResp.ok) {
      res.status(401).json({
        error: "Sessão inválida ou expirada. Entre novamente para gerar imagens.",
      });
      return;
    }
    const user = (await authResp.json()) as { id?: string };
    if (!user?.id) {
      res.status(401).json({
        error: "Sessão inválida ou expirada. Entre novamente para gerar imagens.",
      });
      return;
    }

    // 2. Confirmar que o usuário tem perfil cadastrado (profiles row).
    // A consulta usa o JWT do usuário como Authorization, garantindo que
    // a RLS do Supabase se aplique (o usuário só enxerga o próprio perfil).
    const profileResp = await fetch(
      `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!profileResp.ok) {
      req.log.warn({ userId: user.id }, "Falha ao verificar perfil para geração");
      res.status(403).json({
        error: "Não foi possível verificar seu perfil. Tente novamente.",
      });
      return;
    }
    const profiles = (await profileResp.json()) as unknown[];
    if (!Array.isArray(profiles) || profiles.length === 0) {
      res.status(403).json({
        error:
          "Seu usuário não tem perfil cadastrado. Peça ao administrador para criar seu acesso.",
      });
      return;
    }

    req.supabaseUserId = user.id;
    next();
  } catch (err) {
    req.log.error({ err }, "Falha ao validar sessão Supabase");
    res.status(503).json({
      error: "Não foi possível validar sua sessão agora. Tente novamente.",
    });
  }
}
