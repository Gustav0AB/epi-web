import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { User } from "@epi/shared";
import { Sidebar } from "../layouts/Sidebar";
const auth = vi.hoisted(() => ({ currentUser: null as User | null, logout: () => {}, initCurrentUser: async () => {} }));
vi.mock("../store/auth.store", () => ({ useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth) }));
afterEach(() => { auth.currentUser = null; });
function menu(role: User["role"], featureKeys: string[] = []) {
 auth.currentUser = { role, featureKeys, reportTemplateKeys: [] } as unknown as User;
 return renderToStaticMarkup(<MemoryRouter><Sidebar /></MemoryRouter>);
}
describe("flat navigation and site publications", () => {
 it("opens with labels and direct links to every admin option, without group toggles or assignments", () => {
  const html = menu("system_admin");
  expect(html).toContain('aria-expanded="true"'); expect(html).toContain("Cursos</span>"); expect(html).toContain("Reportes publicados</span>");
  for (const path of ["/courses","/instruments","/published-courses","/users","/organization-management","/settings","/audit-log"]) expect(html).toContain(`href="${path}"`);
  for (const path of ["/surveys", "/survey-groups", "/reports", "/open-questions", "/complementary-instruments", "/scoring", "/survey-settings", "/jotform-accounts", "/categories", "/organizations", "/sites"]) expect(html).not.toContain(`href="${path}"`);
  expect(html).not.toContain("/report-assignments"); expect(html).not.toContain('aria-expanded="false"'); expect(html).not.toContain("max-h-0");
 });
 it("gives a reader published reports without any template or document assignment", () => {
  const html = menu("report_viewer");
  expect(html).toContain('href="/published-courses"'); expect(html).toContain("Reportes publicados</span>"); expect(html).not.toContain('href="/surveys"'); expect(html).not.toContain('href="/users"');
 });
 it("keeps role permissions while exposing all available operational links", () => {
  const html = menu("functionality_user",["surveys","scoring"]);
  expect(html).toContain('href="/courses"'); expect(html).toContain('href="/instruments"'); expect(html).toContain('href="/published-courses"');
  expect(html).not.toContain('href="/organization-management"'); expect(html).not.toContain('href="/audit-log"');
 });
 it("keeps the workspace available with only a single moved permission", () => {
  const open = menu("functionality_user", ["open_questions"]);
  expect(open).toContain('href="/courses"');
  expect(open).not.toContain('href="/instruments"');
  const scoring = menu("functionality_user", ["scoring"]);
  expect(scoring).toContain('href="/instruments"');
  expect(scoring).not.toContain('href="/courses"');
 });
 it("keeps the sidebar expanded by default for organization administrators too", () => {
  const html = menu("org_admin");
  expect(html).toContain('aria-expanded="true"'); expect(html).toContain('href="/organization-management"'); expect(html).not.toContain('href="/jotform-accounts"');
 });
});
