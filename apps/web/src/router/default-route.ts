import type { User } from "@epi/shared";

export function getDefaultRoute(user: User): string {
  if (user.role === "system_admin" || user.role === "org_admin") return "/home";
  if (user.role === "functionality_user") {
    if (user.featureKeys.includes("home")) return "/home";
    if (user.featureKeys.includes("surveys")) return "/surveys";
    if (user.featureKeys.includes("scoring")) return "/scoring";
    return "/no-access";
  }
  if (user.reportTemplateKeys.includes("reports")) return "/reports";
  if (user.reportTemplateKeys.includes("interactive_reports")) return "/interactive-reports";
  return "/no-access";
}
