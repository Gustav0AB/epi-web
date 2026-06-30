import { useAuthStore } from "../../store/auth.store";
import { Button, TextField } from "../../shared/components";
import { useState } from "react";

export function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    await login({ username, password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-primary">Epi Web</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Username"
            id="username"
            type="text"
            autoComplete="username"
            required
            placeholder="epi_admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <Button type="submit" loading={isLoading} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
