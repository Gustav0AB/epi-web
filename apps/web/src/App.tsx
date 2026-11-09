import { InteractiveCourseReportPage } from "./features/reports/InteractiveCourseReportPage";
import { CourseReportPage } from "./features/reports/CourseReportPage";
import { PublishedCourseReportsPage } from "./features/reports/PublishedCourseReportsPage";
import { useEffect } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ReportLayout } from "./layouts/ReportLayout";
import { ProtectedRoute } from "./router/ProtectedRoute";
import { PublicRoute } from "./router/PublicRoute";
import { RoleGate } from "./router/RoleGate";
import { LoginPage } from "./features/auth/LoginPage";
import { HomePage } from "./pages/HomePage";
import { UsersPage } from "./features/users/UsersPage";
import { SurveyGroupsPage } from "./features/surveys/SurveyGroupsPage";
import { ScoringPage } from "./features/surveys/ScoringPage";
import { SurveySettingsPage } from "./features/surveys/SurveySettingsPage";
import { JotformAccountsPage } from "./features/surveys/JotformAccountsPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { OrganizationsPage } from "./features/organizations/OrganizationsPage";
import { SitesPage } from "./features/sites/SitesPage";
import { CategoriesPage } from "./features/categories/CategoriesPage";
import { AuditLogPage } from "./features/audit/AuditLogPage";
import { initSync } from "./lib/sync";
import { useAuthStore } from "./store/auth.store";
import { getDefaultRoute } from "./router/RoleGate";

function NoAccessPage() {
  return (
    <div className="flex h-screen items-center justify-center text-gray-500">
      Tu cuenta no tiene ninguna función asignada todavía. Contacta a tu
      administrador.
    </div>
  );
}

function Workspace({ area }: { area: "courses" | "instruments" | "organizations" }) {
  const user = useAuthStore(state => state.currentUser);
  const system = user?.role === "system_admin";
  const admin = system || user?.role === "org_admin";
  const feature = (key: string) => admin || user?.featureKeys.includes(key);
  if (area === "courses") return <Outlet />;
  const tabs = area === "instruments" ? [
    ["/instruments/forms", "Formularios", system],
    ["/instruments/accounts", "Cuentas Jotform", system],
    ["/instruments/scoring", "Ponderaciones", feature("scoring")],
    ["/instruments/categories", "Catálogo de categorías", admin],
  ] : [
    ["/organization-management/organizations", "Organizaciones", system],
    ["/organization-management/sites", "Sitios", admin],
  ];
  return <div className="space-y-4">
    <nav aria-label={area === "instruments" ? "Área de instrumentos" : "Organizaciones y sitios"} className="flex flex-wrap gap-2 border-b pb-2">
      {tabs.filter(([, , allowed]) => allowed).map(([to, label]) =>
        <NavLink key={String(to)} to={String(to)} end={to !== "/courses/review"} className={({ isActive }) => `rounded px-3 py-2 text-sm font-medium ${isActive ? "bg-primary text-white" : "text-primary hover:bg-gray-100"}`}>{label}</NavLink>)}
    </nav>
    <Outlet />
  </div>;
}

function WorkspaceIndex({ area }: { area: "courses" | "instruments" }) {
  const user = useAuthStore(state => state.currentUser);
  if (area === "courses") return user?.role === "system_admin" || user?.role === "org_admin" || user?.featureKeys.includes("surveys") ? <SurveyGroupsPage /> : <NoAccessPage />;
  return <CourseRedirect to={user?.role === "system_admin" ? "/instruments/forms" : user?.role === "org_admin" ? "/instruments/categories" : "/instruments/scoring"} />;
}

function CourseRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={to + search + hash} replace />;
}

function PublishedReportRedirect() {
  const { publicationId } = useParams();
  return <CourseRedirect to={publicationId ? `/reports/${encodeURIComponent(publicationId)}` : "/reports"} />;
}

function InteractiveReportRedirect() {
  const { publicationId } = useParams();
  return <CourseRedirect to={publicationId ? `/interactive-reports/${encodeURIComponent(publicationId)}` : "/interactive-reports"} />;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.currentUser);
  const reportViewer = currentUser?.role === "report_viewer";

  useEffect(() => {
    initSync();
  }, []);
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<RoleGate allow="published_reports" />}>
          <Route element={<ReportLayout />}>
            <Route path="/interactive-reports/:publicationId?" element={<InteractiveCourseReportPage />} />
          </Route>
          <Route path="/reports/latest" element={<InteractiveReportRedirect />} />
          <Route element={reportViewer ? <Outlet /> : <AppLayout />}>
            <Route path="/reports" element={reportViewer ? <InteractiveReportRedirect /> : <PublishedCourseReportsPage />} />
            <Route path="/reports/:publicationId" element={reportViewer ? <InteractiveReportRedirect /> : <PublishedCourseReportsPage />} />
          </Route>
        </Route>
        <Route element={<RoleGate allow="functionality" featureKey="surveys" />}>
          <Route element={<AppLayout />}><Route path="/reports/prepare/:id" element={<CourseReportPage />} /></Route>
        </Route>
        <Route path="/published-courses" element={<PublishedReportRedirect />} />
        <Route path="/published-courses/:publicationId" element={<PublishedReportRedirect />} />
        <Route path="/no-access" element={<NoAccessPage />} />

        <Route path="/report-assignments" element={<Navigate to="/reports" replace />} />

        {/* Reportes: con sidebar — herramienta interna del usuario operativo
            para ver la información de forma genérica y dar visto bueno,
            antes de preparar y publicar el reporte desde el curso. */}
        <Route
          element={<RoleGate allow="report_template" templateKey="reports" />}
        >
          <Route element={<AppLayout />}>
            <Route path="/reports/builder" element={<ReportsPage />} />
          </Route>
        </Route>

        {/* Funcionalidades: system_admin/org_admin sin restricción; functionality_user según featureKeys */}
        <Route element={<RoleGate allow="functionality" featureKey="home" />}>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<HomePage />} />
          </Route>
        </Route>
        <Route element={<AppLayout />}>
          <Route path="/surveys" element={<CourseRedirect to="/courses/responses" />} />
          <Route path="/survey-groups" element={<CourseRedirect to="/courses/review" />} />
          <Route path="/survey-groups/comparison" element={<CourseRedirect to="/courses/review/comparison" />} />
          <Route path="/complementary-instruments" element={<CourseRedirect to="/courses/complementary" />} />
          <Route path="/open-questions" element={<CourseRedirect to="/courses/open-questions" />} />
          <Route path="/scoring" element={<CourseRedirect to="/instruments/scoring" />} />
          <Route path="/survey-settings" element={<CourseRedirect to="/instruments/forms" />} />
          <Route path="/jotform-accounts" element={<CourseRedirect to="/instruments/accounts" />} />
          <Route path="/categories" element={<CourseRedirect to="/instruments/categories" />} />
          <Route path="/organizations" element={<CourseRedirect to="/organization-management/organizations" />} />
          <Route path="/sites" element={<CourseRedirect to="/organization-management/sites" />} />
          <Route path="/courses" element={<Workspace area="courses" />}>
            <Route index element={<WorkspaceIndex area="courses" />} />
            <Route element={<RoleGate allow="functionality" featureKey="surveys" />}>
              <Route path="*" element={<CourseRedirect to="/courses" />} />
            </Route>
          </Route>
          <Route path="/instruments" element={<Workspace area="instruments" />}>
            <Route index element={<WorkspaceIndex area="instruments" />} />
            <Route element={<RoleGate allow="system_admin" />}>
              <Route path="forms" element={<SurveySettingsPage />} />
              <Route path="accounts" element={<JotformAccountsPage />} />
            </Route>
            <Route element={<RoleGate allow="functionality" featureKey="scoring" />}>
              <Route path="scoring" element={<ScoringPage />} />
            </Route>
            <Route element={<RoleGate allow="admin_tier" />}>
              <Route path="categories" element={<CategoriesPage />} />
            </Route>
          </Route>
          <Route element={<RoleGate allow="admin_tier" />}>
            <Route path="/organization-management" element={<Workspace area="organizations" />}>
              <Route index element={<CourseRedirect to="/organization-management/sites" />} />
              <Route path="sites" element={<SitesPage />} />
              <Route element={<RoleGate allow="system_admin" />}>
                <Route path="organizations" element={<OrganizationsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        {/* Gestión de usuarios: system_admin (cualquier org) u org_admin (solo la propia) */}
        <Route element={<RoleGate allow="user_management" />}>
          <Route element={<AppLayout />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
        </Route>

        {/* Plantillas de reporte y organizaciones: solo system_admin */}
        <Route element={<RoleGate allow="system_admin" />}>
          <Route element={<AppLayout />}>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>

      </Route>

      <Route
        path="*"
        element={
          <Navigate
            to={
              isAuthenticated && currentUser
                ? getDefaultRoute(currentUser)
                : "/home"
            }
            replace
          />
        }
      />
    </Routes>
  );
}
