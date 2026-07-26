import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ReportLayout } from "./layouts/ReportLayout";
import { ProtectedRoute } from "./router/ProtectedRoute";
import { PublicRoute } from "./router/PublicRoute";
import { RoleGate } from "./router/RoleGate";
import { LoginPage } from "./features/auth/LoginPage";
import { HomePage } from "./pages/HomePage";
import { UsersPage } from "./features/users/UsersPage";
import { SurveysPage } from "./features/surveys/SurveysPage";
import { ScoringPage } from "./features/surveys/ScoringPage";
import { OpenQuestionsPage } from "./features/open-questions/OpenQuestionsPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { InteractiveReportsPage } from "./features/reports/InteractiveReportsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { OrganizationsPage } from "./features/organizations/OrganizationsPage";
import { SitesPage } from "./features/sites/SitesPage";
import { CategoriesPage } from "./features/categories/CategoriesPage";
import { AuditLogPage } from "./features/audit/AuditLogPage";
import { ReportAssignmentsPage } from "./features/reports/ReportAssignmentsPage";
import { initSync } from "./lib/sync";

function NoAccessPage() {
  return (
    <div className="flex h-screen items-center justify-center text-gray-500">
      Tu cuenta no tiene ninguna función asignada todavía. Contacta a tu administrador.
    </div>
  );
}

export default function App() {
  useEffect(() => {
    initSync();
  }, []);
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/no-access" element={<NoAccessPage />} />

        {/* Reportes interactivos: sin sidebar, acceso exclusivo */}
        <Route element={<RoleGate allow="report_template" templateKey="interactive_reports" />}>
          <Route element={<ReportLayout />}>
            <Route path="/interactive-reports" element={<InteractiveReportsPage />} />
          </Route>
        </Route>

        {/* Reportes: con sidebar, accesible para system_admin/org_admin y report_viewer con esa plantilla */}
        <Route element={<RoleGate allow="report_template" templateKey="reports" />}>
          <Route element={<AppLayout />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
        </Route>

        {/* Funcionalidades: system_admin/org_admin sin restricción; functionality_user según featureKeys */}
        <Route element={<RoleGate allow="functionality" featureKey="home" />}>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<HomePage />} />
          </Route>
        </Route>
        <Route element={<RoleGate allow="functionality" featureKey="surveys" />}>
          <Route element={<AppLayout />}>
            <Route path="/surveys" element={<SurveysPage />} />
          </Route>
        </Route>
        <Route element={<RoleGate allow="functionality" featureKey="scoring" />}>
          <Route element={<AppLayout />}>
            <Route path="/scoring" element={<ScoringPage />} />
          </Route>
        </Route>
        <Route element={<RoleGate allow="functionality" featureKey="open_questions" />}>
          <Route element={<AppLayout />}>
            <Route path="/open-questions" element={<OpenQuestionsPage />} />
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
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>

        {/* Sitios y categorías: system_admin (cualquier org) u org_admin (solo la propia) */}
        <Route element={<RoleGate allow="admin_tier" />}>
          <Route element={<AppLayout />}>
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/report-assignments" element={<ReportAssignmentsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
