import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, type Rol } from "./use-auth";

export function useRequireAuth(opts?: { role?: Rol }) {
  const { currentUser, hydrated } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // Esperar a que se resuelva la sesión antes de decidir si redirige: evita
    // un falso "no hay sesión" mientras se consulta al servidor.
    if (!hydrated) return;
    if (!currentUser) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (opts?.role && currentUser.rol !== opts.role) {
      navigate({ to: "/ordenes", replace: true });
    }
  }, [hydrated, currentUser, opts?.role, navigate]);
  if (!hydrated) return null;
  if (opts?.role && currentUser && currentUser.rol !== opts.role) return null;
  return currentUser;
}
