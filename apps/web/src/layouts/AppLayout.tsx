import { Navigate, Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuthStore } from "../store/auth.store";
import { OfflineBanner } from "../shared/components";

export function AppLayout() {
  const reportViewer = useAuthStore(state => state.currentUser?.role === "report_viewer");
  if (reportViewer) return <Navigate to="/interactive-reports" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
      <OfflineBanner />
    </div>
  );
}
