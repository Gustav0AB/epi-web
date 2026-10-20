import { createApiAuth } from "@epi/auth";
import type { LoginDto, User } from "@epi/shared";

export const useAuthStore = createApiAuth<User, LoginDto>({
  baseUrl: import.meta.env["VITE_API_URL"] ?? "",
  loginEndpoint: "/api/auth/login",
  currentUserEndpoint: (subject) => `/api/users/${subject}`,
  onLogin: async (token) => {
    const { seedDatabase } = await import("../lib/seed");
    await seedDatabase(token);
  },
  onLogout: () => {
    void import("../lib/seed").then(({ clearDatabase }) => clearDatabase());
  },
});
