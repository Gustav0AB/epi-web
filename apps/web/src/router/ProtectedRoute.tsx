import { Navigate, Outlet } from "react-router-dom";
import { AuthGuard } from "@epi/auth";
import { useAuthStore } from "../store/auth.store";

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <AuthGuard authenticated={isAuthenticated} fallback={<Navigate to="/login" replace />}>
      <Outlet />
    </AuthGuard>
  );
}
