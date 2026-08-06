import { useAuthStore } from "../../store/auth.store";
import { Button, TextField } from "../../shared/components";
import Logo from "../../assets/epi-logo.png";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";

export function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    await login({ username, password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <img src={Logo} alt={t("login.logoAlt")} className="mx-auto mb-4 h-16" />
        <h1 className="mb-6 text-center text-2xl font-semibold text-primary">
          EPI
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label={t("login.username")}
            id="username"
            type="text"
            autoComplete="username"
            required
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label={t("login.password")}
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" loading={isLoading} className="w-full">
            {t("login.signIn")}
          </Button>
        </form>
      </div>
    </div>
  );
}
