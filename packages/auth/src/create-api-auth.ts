import { createApiClient } from "@epi/api-client";
import type { StateStorage } from "zustand/middleware";
import { createAuthStore } from "./create-auth-store.js";

type LoginResult = {
  accessToken: string;
  mustChangePassword?: boolean;
};

export type ApiAuthOptions<User, Credentials> = {
  loginEndpoint: string;
  currentUserEndpoint: (subject: string) => string;
  baseUrl?: string;
  storage?: StateStorage;
  storageKey?: string;
  fetcher?: typeof fetch;
  getSubject?: (token: string) => string | null;
  parseLoginResult?: (result: unknown) => LoginResult;
  onLogin?: (token: string) => Promise<void>;
  onLogout?: () => void;
};

function defaultGetSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

function defaultParseLoginResult(result: unknown): LoginResult {
  const data = result as Partial<LoginResult>;
  if (typeof data.accessToken !== "string") {
    throw new Error("Login response did not include an access token");
  }
  return {
    accessToken: data.accessToken,
    ...(data.mustChangePassword !== undefined
      ? { mustChangePassword: data.mustChangePassword }
      : {}),
  };
}

export function createApiAuth<User, Credentials>({
  loginEndpoint,
  currentUserEndpoint,
  baseUrl = "",
  storage,
  storageKey = "auth-storage",
  fetcher,
  getSubject = defaultGetSubject,
  parseLoginResult = defaultParseLoginResult,
  onLogin,
  onLogout,
}: ApiAuthOptions<User, Credentials>) {
  const clientOptions = {
    baseUrl,
    ...(fetcher ? { fetcher } : {}),
  };
  const publicClient = createApiClient(clientOptions);

  const loadCurrentUser = async (token: string): Promise<User | null> => {
    const subject = getSubject(token);
    if (!subject) return null;
    try {
      const userClient = createApiClient({ ...clientOptions, getToken: () => token });
      return await userClient.get<User>(currentUserEndpoint(encodeURIComponent(subject)));
    } catch {
      return null;
    }
  };

  return createAuthStore<User, Credentials>({
    authenticate: async (credentials) => {
      const data = parseLoginResult(await publicClient.post<unknown>(loginEndpoint, credentials));
      return {
        token: data.accessToken,
        currentUser: await loadCurrentUser(data.accessToken),
        ...(data.mustChangePassword !== undefined
          ? { mustChangePassword: data.mustChangePassword }
          : {}),
      };
    },
    loadCurrentUser,
    ...(onLogin ? { onLogin } : {}),
    ...(onLogout ? { onLogout } : {}),
    ...(storage ? { storage } : {}),
    storageKey,
  });
}
