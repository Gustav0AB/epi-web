import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { OfflineBanner } from "../shared/components";

export function ReportLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <Header />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <Outlet />
      </main>
      <OfflineBanner />
    </div>
  );
}
