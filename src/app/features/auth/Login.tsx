import { useState } from "react";
import {
  LogIn,
  User,
  Lock,
  AlertCircle,
  Moon,
  Sun,
  Mail,
  Calendar,
  Chrome,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, register, loginWithGoogleMock } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validação de campos vazios
    if (mode === "login") {
      if (!username.trim()) {
        setError("Por favor, digite seu usuário ou email");
        return;
      }
      if (!password) {
        setError("Por favor, digite sua senha");
        return;
      }
    } else {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        setError("Por favor, digite seu email");
        return;
      }
      if (!emailRegex.test(normalizedEmail)) {
        setError("Por favor, digite um email válido (exemplo: seu@email.com)");
        return;
      }
      if (!name.trim()) {
        setError("Por favor, digite seu nome");
        return;
      }
      if (!birthDate) {
        setError("Por favor, selecione sua data de nascimento");
        return;
      }
      if (!password) {
        setError("Por favor, digite uma senha");
        return;
      }
      if (password.length < 4) {
        setError("A senha deve ter pelo menos 4 caracteres");
        return;
      }
    }

    setIsLoading(true);

    // Simula um pequeno delay para melhor UX
    await new Promise((resolve) => setTimeout(resolve, 300));

    let result = { ok: false, error: "" as string | undefined };
    if (mode === "login") {
      result = await login(username.trim(), password);
    } else {
      const normalizedEmail = email.trim();
      result = await register({
        email: normalizedEmail,
        name: name.trim(),
        birthDate,
        password,
      });
    }

    if (!result.ok) {
      // Mensagens de erro mais específicas
      let errorMessage = result.error;

      if (!errorMessage) {
        if (mode === "login") {
          errorMessage =
            "Usuário ou senha incorretos. Verifique se digitou corretamente.";
        } else {
          errorMessage =
            "Falha ao criar usuário. Verifique se todos os dados estão corretos.";
        }
      }

      // Detecta erros de conexão
      if (
        errorMessage.includes("conexão") ||
        errorMessage.includes("servidor") ||
        errorMessage.includes("offline")
      ) {
        errorMessage =
          "Não foi possível conectar ao servidor. Verifique se o backend está rodando.";
      }

      setError(errorMessage);
      setIsLoading(false);
    } else {
      // Login bem-sucedido - o contexto vai atualizar e redirecionar
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-card p-4 relative">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-foreground shadow-sm hover:bg-accent transition-colors"
        aria-label={
          theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
        }
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
      </button>
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <LogIn className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Konekt</h1>
          <p className="text-muted-foreground">Entre para explorar eventos</p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-full border border-border bg-card">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`px-4 py-2 text-sm rounded-full transition-colors ${
                mode === "login"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`px-4 py-2 text-sm rounded-full transition-colors ${
                mode === "register"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground"
              }`}
            >
              Criar conta
            </button>
          </div>
        </div>

        {/* Login/Register Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "login" && (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-foreground"
                >
                  Usuário ou email
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Digite seu usuário"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>
            </>
          )}

          {mode === "register" && (
            <>
              <button
                type="button"
                onClick={async () => {
                  setIsLoading(true);
                  setError("");
                  const result = await loginWithGoogleMock({
                    email: email || `google_user_${Date.now()}@konekt.com`,
                    name: name || "Google User",
                    birthDate: birthDate || "2000-01-01",
                  });
                  if (!result.ok)
                    setError(result.error || "Falha no login Google (mock)");
                  setIsLoading(false);
                }}
                className="w-full py-3 rounded-lg border border-border bg-background text-foreground font-semibold hover:bg-accent transition-colors flex items-center justify-center gap-2"
              >
                <Chrome className="w-4 h-4" />
                Continuar com Google (mock)
              </button>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="text-sm font-medium text-foreground"
                >
                  Nome
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="birthDate"
                  className="text-sm font-medium text-foreground"
                >
                  Data de nascimento
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </>
          )}

          {/* Password Field */}
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm border-2 border-destructive/30 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold mb-1">
                  Erro ao {mode === "login" ? "entrar" : "criar conta"}
                </p>
                <p className="text-destructive/90">{error}</p>
                {mode === "login" && error.includes("incorretos") && (
                  <p className="text-xs text-destructive/70 mt-2">
                    💡 Dica: Verifique se digitou o usuário corretamente (ex:
                    "Konekt" com K maiúsculo)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isLoading
              ? mode === "login"
                ? "Entrando..."
                : "Criando..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>

        {/* Credentials Hint removido */}
      </div>
    </div>
  );
}
