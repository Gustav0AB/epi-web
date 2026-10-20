import type { ReactNode } from "react";

type AuthGuardProps = {
  authenticated: boolean;
  children: ReactNode;
  fallback: ReactNode;
};

export function AuthGuard({ authenticated, children, fallback }: AuthGuardProps) {
  return authenticated ? children : fallback;
}

export function GuestGuard({ authenticated, children, fallback }: AuthGuardProps) {
  return authenticated ? fallback : children;
}

export function PermissionGate({
  allowed,
  children,
  fallback = null,
}: {
  allowed: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return allowed ? children : fallback;
}
