import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading, firebaseConfigured } = useAuth();
  const location = useLocation();

  if (!firebaseConfigured) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return (
      <p role="status" style={{ textAlign: "center", padding: "2rem" }}>
        Yuklanmoqda…
      </p>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
