import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineBanner } from "../shared/components";
import { useAuthStore } from "../store/auth.store";

export function AppLayout() {
  const initCurrentUser = useAuthStore((s) => s.initCurrentUser);

  useEffect(() => {
    void initCurrentUser();
  }, [initCurrentUser]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
      <OfflineBanner />
    </div>
  );
}
