import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { currentUser, hydrated } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) navigate({ to: "/login", replace: true });
    else navigate({ to: "/ordenes", replace: true });
  }, [hydrated, currentUser, navigate]);
  return null;
}
