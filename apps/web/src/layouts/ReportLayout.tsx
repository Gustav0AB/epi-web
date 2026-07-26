import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { OfflineBanner } from "../shared/components";

// Layout para usuarios que solo ven reportes: sin sidebar, solo el header
// (con cerrar sesión). El contenido por ahora es la pantalla "Coming Soon".
export function ReportLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <Header />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
      <OfflineBanner />
    </div>
  );
}
