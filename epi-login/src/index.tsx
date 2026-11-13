import { useState, type FormEvent, type ReactNode } from "react";
import { Button, TextField, UiProvider } from "@epi/ui";

export type LoginCredentials = { username: string; password: string };
export type LoginFormProps = {
  onSubmit: (credentials: LoginCredentials) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  brand?: ReactNode;
  locale?: "es" | "en";
};

export function LoginForm({ onSubmit, loading = false, error, brand, locale = "es" }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const labels = locale === "en"
    ? { username: "Username", password: "Password", submit: "Sign in" }
    : { username: "Usuario", password: "Contraseña", submit: "Iniciar sesión" };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!loading) void onSubmit({ username, password });
  }
  return <UiProvider lang={locale}><div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
    {brand}
    <form onSubmit={submit} className="space-y-4" aria-busy={loading}>
      <TextField label={labels.username} id="username" autoComplete="username" required disabled={loading} value={username} onChange={event => setUsername(event.target.value)} />
      <TextField label={labels.password} id="password" type="password" autoComplete="current-password" required disabled={loading} value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p role="alert" className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" loading={loading} disabled={loading} className="w-full">{labels.submit}</Button>
    </form>
  </div></UiProvider>;
}
