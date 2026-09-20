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

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Troca a escola ativa (quem é membro de mais de uma). */
  setActiveSchool: (schoolId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const data = getDataLayer();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    data.auth.getSession().then((s) => {
      if (active) {
        setSession(s);
        setLoading(false);
      }
    });
    const unsub = data.auth.onAuthStateChange((s) => {
      setSession(s);
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
      signIn: async (email, password) => {
        await data.auth.signIn(email, password);
      },
      signOut: async () => {
        await data.auth.signOut();
      },
      setActiveSchool: async (schoolId) => {
        await data.auth.setActiveSchool(schoolId);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
