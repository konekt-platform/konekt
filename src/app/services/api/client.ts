const DEFAULT_API_URL = "http://localhost:3000";

export const API_URL =
  (import.meta as { env: Record<string, string> }).env.VITE_API_URL ||
  DEFAULT_API_URL;

export function getAuthHeaders() {
  const token = localStorage.getItem("konekt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      cache: "no-store", // Prevent caching to ensure fresh data
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        ...(options.headers || {}),
        ...getAuthHeaders(),
      },
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || `Erro ${res.status}`);
    }

    return res.json() as Promise<T>;
  } catch (error) {
    // Log detalhado para debug
    console.error("[API] Erro ao fazer requisição:", {
      url,
      error: error instanceof Error ? error.message : String(error),
      apiUrl: API_URL,
    });

    // Re-throw com mensagem mais clara
    if (
      error instanceof TypeError &&
      error.message.includes("Failed to fetch")
    ) {
      throw new Error(
        `Não foi possível conectar ao servidor em ${API_URL}. Verifique se o backend está rodando.`,
      );
    }
    throw error;
  }
}
