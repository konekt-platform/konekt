import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { User } from "../types";
import { API_URL, getAuthHeaders } from "../services/api/client";
import { changePasswordRequest } from "../services/api/users";

type AuthResult = { ok: boolean; error?: string };

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (payload: {
    email: string;
    name: string;
    birthDate: string;
    password: string;
  }) => Promise<AuthResult>;
  loginWithGoogleMock: (payload: {
    email: string;
    name: string;
    birthDate: string;
  }) => Promise<AuthResult>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
  logoutAll: () => Promise<AuthResult>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<AuthResult>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Verifica se há usuário salvo no localStorage
    const savedUser = localStorage.getItem("konekt_user");
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    return null;
  });

  const logout = () => {
    setUser(null);
    localStorage.removeItem("konekt_user");
    localStorage.removeItem("konekt_token");
  };

  useEffect(() => {
    // Escuta evento de logout global disparado pelo client.ts (401)
    const handleLogout = () => logout();
    window.addEventListener("konekt:auth:logout", handleLogout);
    return () => window.removeEventListener("konekt:auth:logout", handleLogout);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Mantém a sessão viva atualizando o lastActivity no backend a cada 5m
    const interval = setInterval(
      () => {
        refreshUser().catch(() => {
          // Erros de refresh são silenciosos
          // Se for 401, o interceptor do client.ts vai disparar o logout
        });
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [user]);

  const applyUserOverrides = (baseUser: User) => {
    try {
      const overridesRaw = localStorage.getItem(
        `konekt_user_overrides_${baseUser.id}`,
      );
      if (!overridesRaw) return baseUser;
      const overrides = JSON.parse(overridesRaw) as Partial<User>;
      // Prioriza avatar do localStorage se o backend não tiver
      const merged = { ...baseUser, ...overrides };
      if (!merged.avatar && overrides.avatar) {
        merged.avatar = overrides.avatar;
      }
      return merged;
    } catch {
      return baseUser;
    }
  };

  const login = async (
    username: string,
    password: string,
  ): Promise<AuthResult> => {
    try {
      const url = `${API_URL}/auth/login`;
      console.log("[Auth] Tentando login em:", url);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        let error = "Usuário ou senha incorretos";
        try {
          const data = await res.json();
          if (data?.error) error = data.error;
        } catch {
          // ignora parse inválido
        }
        return { ok: false, error };
      }
      const data = await res.json();
      if (!data?.user || !data?.token)
        return { ok: false, error: "Resposta inválida do servidor" };
      const mergedUser = applyUserOverrides(data.user);
      setUser(mergedUser);
      localStorage.setItem("konekt_user", JSON.stringify(mergedUser));
      localStorage.setItem("konekt_token", data.token);
      return { ok: true };
    } catch (err) {
      console.error("[Auth] Erro ao fazer login:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Detecta diferentes tipos de erros de conexão
      if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError") ||
        errorMessage.includes("ERR_CONNECTION_REFUSED") ||
        errorMessage.includes("ERR_CONNECTION_RESET") ||
        errorMessage.includes("ERR_NETWORK")
      ) {
        return {
          ok: false,
          error: `Não foi possível conectar ao servidor em ${API_URL}. Verifique se o backend está rodando.`,
        };
      }

      return { ok: false, error: `Erro de conexão: ${errorMessage}` };
    }
  };

  const register = async (payload: {
    email: string;
    name: string;
    birthDate: string;
    password: string;
  }): Promise<AuthResult> => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let error = "Falha ao criar usuário";
        try {
          const data = await res.json();
          if (data?.error) error = data.error;
        } catch {
          // ignora parse inválido
        }
        return { ok: false, error };
      }
      const data = await res.json();
      if (!data?.user || !data?.token)
        return { ok: false, error: "Resposta inválida do servidor" };
      const mergedUser = applyUserOverrides(data.user);
      setUser(mergedUser);
      localStorage.setItem("konekt_user", JSON.stringify(mergedUser));
      localStorage.setItem("konekt_token", data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: "Falha de conexão com o servidor" };
    }
  };

  const loginWithGoogleMock = async (payload: {
    email: string;
    name: string;
    birthDate: string;
  }): Promise<AuthResult> => {
    try {
      const res = await fetch(`${API_URL}/auth/google-mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let error = "Falha no login Google (mock)";
        try {
          const data = await res.json();
          if (data?.error) error = data.error;
        } catch {
          // ignora parse inválido
        }
        return { ok: false, error };
      }
      const data = await res.json();
      if (!data?.user || !data?.token)
        return { ok: false, error: "Resposta inválida do servidor" };
      const mergedUser = applyUserOverrides(data.user);
      setUser(mergedUser);
      localStorage.setItem("konekt_user", JSON.stringify(mergedUser));
      localStorage.setItem("konekt_token", data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: "Falha de conexão com o servidor" };
    }
  };



  const logoutAll = async (): Promise<AuthResult> => {
    try {
      const res = await fetch(`${API_URL}/auth/logout-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });
      if (!res.ok) {
        let error = "Falha ao fazer logout de todos os dispositivos";
        try {
          const data = await res.json();
          if (data?.error) error = data.error;
        } catch {
          // ignora parse inválido
        }
        return { ok: false, error };
      }
      logout(); // Faz logout local também
      return { ok: true };
    } catch {
      logout(); // Faz logout local mesmo se a requisição falhar
      return { ok: false, error: "Falha de conexão com o servidor" };
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> => {
    try {
      const res = await changePasswordRequest(currentPassword, newPassword);
      if (!res.ok) {
        return { ok: false, error: res.error || "Falha ao alterar senha" };
      }
      return { ok: true };
    } catch (err) {
      console.error("[Auth] Erro ao alterar senha:", err);
      return { ok: false, error: "Falha de conexão com o servidor" };
    }
  };

  const refreshUser = async () => {
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      const mergedUser = applyUserOverrides(data);
      setUser(mergedUser);
      localStorage.setItem("konekt_user", JSON.stringify(mergedUser));
    } catch {
      // ignora falhas de refresh
    }
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    const nextUser = { ...user, ...updates };
    setUser(nextUser);
    localStorage.setItem("konekt_user", JSON.stringify(nextUser));
    try {
      const overridesKey = `konekt_user_overrides_${user.id}`;
      const prevOverrides = localStorage.getItem(overridesKey);
      const mergedOverrides = {
        ...(prevOverrides ? (JSON.parse(prevOverrides) as Partial<User>) : {}),
        ...updates,
      };
      localStorage.setItem(overridesKey, JSON.stringify(mergedOverrides));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        loginWithGoogleMock,
        refreshUser,
        updateUser,
        logout,
        logoutAll,
        changePassword,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
