import { Navigate, Outlet } from "react-router-dom";
import { GuestGuard } from "@epi/auth";
import { useAuthStore } from "../store/auth.store";
import { getDefaultRoute } from "./RoleGate";

export function PublicRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.currentUser);

  return (
    <GuestGuard
      authenticated={isAuthenticated}
      fallback={<Navigate to={currentUser ? getDefaultRoute(currentUser) : "/home"} replace />}
    >
      <Outlet />
    </GuestGuard>
  );
}
