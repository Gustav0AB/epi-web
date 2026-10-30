import { useState, type FormEvent } from "react";
import { Button, TextField } from "@epi/ui";

export type LoginLabels = {
  username: string;
  password: string;
  signIn: string;
  logoAlt?: string;
};

type LoginPageProps<Credentials> = {
  title: string;
  labels: LoginLabels;
  onLogin: (credentials: Credentials) => Promise<void>;
  createCredentials: (username: string, password: string) => Credentials;
  loading: boolean;
  error: string | null;
  onClearError?: () => void;
  logo?: string;
  usernamePlaceholder?: string;
  passwordPlaceholder?: string;
};

export function LoginPage<Credentials>({
  title,
  labels,
  onLogin,
  createCredentials,
  loading,
  error,
  onClearError,
  logo,
  usernamePlaceholder,
  passwordPlaceholder,
}: LoginPageProps<Credentials>) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onClearError?.();
    try {
      await onLogin(createCredentials(username, password));
    } catch {
      // Auth state exposes the error for display.
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-4">
      <div
        className="w-full max-w-[400px] rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        style={{ maxWidth: "400px" }}
      >
        {logo && (
          <img
            src={logo}
            alt={labels.logoAlt ?? title}
            style={{ maxWidth: "100px", height: "100px" }}
          />
        )}
        <h1 className="mb-6 text-center text-2xl font-semibold text-primary">
          {title}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label={labels.username}
            id="username"
            type="text"
            autoComplete="username"
            required
            placeholder={usernamePlaceholder}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <TextField
            label={labels.password}
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder={passwordPlaceholder}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="w-full">
            {labels.signIn}
          </Button>
        </form>
      </div>
    </div>
  );
}
