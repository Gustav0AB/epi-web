import type { User } from "@epi/shared";

export function getDefaultRoute(user: User): string {
  if (user.role === "system_admin" || user.role === "org_admin") return "/home";
  if (user.role === "functionality_user") {
    if (user.featureKeys.includes("home")) return "/home";
    if (user.featureKeys.includes("surveys")) return "/courses";
    if (user.featureKeys.includes("scoring")) return "/instruments/scoring";
    if (user.featureKeys.includes("open_questions")) return "/courses/open-questions";
    return "/reports";
  }
  return "/interactive-reports";
}
