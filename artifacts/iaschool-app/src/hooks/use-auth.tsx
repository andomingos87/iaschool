import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getDataLayer } from "@/lib/data";
import type { Session } from "@/lib/data";
import { SessionReadError } from "@/lib/auth-messages";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  /** Erro ao ler perfil com a sessão do Auth ainda válida. Não some sozinho. */
  sessionError: string | null;
  clearSessionError: () => void;
  signIn: (email: string, password: string) => Promise<Session>;
  /** Relê o perfil sem pedir a senha de novo. */
  retrySession: () => Promise<Session>;
  signOut: () => Promise<void>;
  /** Troca a escola ativa (quem é membro de mais de uma). */
  setActiveSchool: (schoolId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const data = getDataLayer();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    data.auth.getSession().then(
      (s) => {
        if (!active) return;
        setSession(s);
        setSessionError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (!active) return;
        setSession(null);
        setSessionError(
          err instanceof SessionReadError
            ? err.message
            : "Não foi possível carregar a sessão. Tente de novo.",
        );
        setLoading(false);
      },
    );
    const unsub = data.auth.onAuthStateChange((s) => {
      setSession(s);
      if (s) setSessionError(null);
    });
    return () => {
      active = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      sessionError,
      clearSessionError: () => setSessionError(null),
      signIn: async (email, password) => {
        try {
          const next = await data.auth.signIn(email, password);
          setSession(next);
          setSessionError(null);
          return next;
        } catch (err) {
          if (err instanceof SessionReadError) setSessionError(err.message);
          throw err;
        }
      },
      retrySession: async () => {
        try {
          const next = await data.auth.retrySession();
          setSession(next);
          setSessionError(null);
          return next;
        } catch (err) {
          if (err instanceof SessionReadError) setSessionError(err.message);
          throw err;
        }
      },
      signOut: async () => {
        setSessionError(null);
        await data.auth.signOut();
      },
      setActiveSchool: async (schoolId) => {
        await data.auth.setActiveSchool(schoolId);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, loading, sessionError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
