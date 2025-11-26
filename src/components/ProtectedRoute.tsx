import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/hooks/useUser";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useUser();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Salva a localização atual para redirecionar de volta após login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
