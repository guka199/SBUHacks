"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { auth, type User } from "@/lib/account-api";
import { useSession } from "@/components/session";

interface AuthState {
  user: User | null;
  loading: boolean; // true until we know whether someone is signed in
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Knows who is signed in (via the API's session cookie) and shares it with every page. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { clearVideo } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    clearVideo();
    setUser(null);
  }, [clearVideo]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        setUser: (next) => {
          if (next?.id !== user?.id) clearVideo();
          setUser(next);
        },
        logout,
      }}
    >
      <Fragment key={user?.id ?? "anonymous"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
