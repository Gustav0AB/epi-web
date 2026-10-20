# @epi/auth

Reusable browser authentication for apps with a JSON API. Each app configures its own endpoints and user type; route definitions and permission rules stay in that app.

For a separate app, copy `packages/auth`, `packages/ui`, and `packages/api-client` into its workspace packages. Install the dependencies declared by those packages and compile them before the app. The app supplies its own user/credential types, endpoint paths, and permission rules.

```tsx
import { AuthGuard, GuestGuard, LoginPage, createApiAuth } from "@epi/auth";
import { Navigate, Outlet } from "react-router-dom";

type AppUser = { id: string; permissions: string[] };
type Credentials = { email: string; password: string };

export const useAuth = createApiAuth<AppUser, Credentials>({
  baseUrl: import.meta.env.VITE_API_URL ?? "",
  loginEndpoint: "/auth/login",
  currentUserEndpoint: (id) => `/users/${id}`,
  parseLoginResult: (data) => {
    const result = data as { token: string };
    return { accessToken: result.token };
  },
});
```

Wire the reusable login screen and route guard like this:

```tsx
function LoginRoute() {
  const { login, isLoading, error, clearError } = useAuth();
  return (
    <LoginPage
      title="Example App"
      labels={{ username: "Email", password: "Password", signIn: "Sign in" }}
      onLogin={login}
      createCredentials={(email, password) => ({ email, password })}
      loading={isLoading}
      error={error}
      onClearError={clearError}
    />
  );
}

function ProtectedRoute() {
  const authenticated = useAuth((state) => state.isAuthenticated);
  return (
    <AuthGuard authenticated={authenticated} fallback={<Navigate to="/login" replace />}>
      <Outlet />
    </AuthGuard>
  );
}

function GuestRoute() {
  const authenticated = useAuth((state) => state.isAuthenticated);
  return (
    <GuestGuard authenticated={authenticated} fallback={<Navigate to="/" replace />}>
      <LoginRoute />
    </GuestGuard>
  );
}
```

`currentUserEndpoint` receives the JWT `sub` claim by default; provide `getSubject` when the identity claim differs. Use `PermissionGate` with the app's own permission check, or keep permission checks in the app's route configuration. The package establishes identity/session only; the app chooses which screens and permissions to expose.

The default API format is `{ success: true, data: ... }` / `{ success: false, error: { code, message, details? } }`. Use `parseLoginResult` to adapt a different token field. This package handles session state and a login form; it does not implement OIDC/SAML SSO.
