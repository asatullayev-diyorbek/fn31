import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setToken, type ApiUser } from "@/lib/api";

interface AuthContextValue { user: ApiUser | null; loading: boolean; logout: () => void; }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<ApiUser | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { api<{ user: ApiUser }>("/api/auth/session").then((value) => setUser(value.user)).catch(() => setToken(null)).finally(() => setLoading(false)); }, []);
  const logout = () => { setToken(null); setUser(null); };
  const value = useMemo(() => ({ user, loading, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue { const context = useContext(AuthContext); if (!context) throw new Error("useAuth must be used within <AuthProvider>"); return context; }
