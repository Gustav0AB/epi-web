import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import { getDefaultRoute } from "./RoleGate";

export function PublicRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.currentUser);

  if (isAuthenticated) {
    return <Navigate to={currentUser ? getDefaultRoute(currentUser) : "/home"} replace />;
  }

  return <Outlet />;
}
