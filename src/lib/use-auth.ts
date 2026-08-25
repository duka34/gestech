import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loginFn, logoutFn, meFn } from "@/server/fn/auth";

export type Rol = "ADMINISTRADOR" | "TECNICO";

export type AuthUser = {
  id: number;
  nombre: string;
  apellido: string;
  nombreUsuario: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
};

const ME_KEY = ["auth", "me"] as const;

/**
 * Identidad real, respaldada por la sesión del servidor (T-03) — reemplaza
 * la porción de autenticación que antes vivía en `gestech-store.tsx`
 * (localStorage). El resto de los datos de negocio (órdenes, stock, chat)
 * sigue en `useGesTech()` hasta que se migren en fases posteriores.
 */
export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: () => meFn(),
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (vars: { nombreUsuario: string; contrasena: string }) => loginFn({ data: vars }),
    onSuccess: (usuario) => queryClient.setQueryData(ME_KEY, usuario),
  });

  const logoutMutation = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });

  return {
    currentUser: (meQuery.data ?? null) as AuthUser | null,
    /** true una vez que se resolvió si hay sesión o no (evita un falso "sin sesión" mientras carga). */
    hydrated: !meQuery.isPending,
    login: (nombreUsuario: string, contrasena: string) =>
      loginMutation.mutateAsync({ nombreUsuario, contrasena }),
    logout: () => logoutMutation.mutateAsync(),
  };
}
