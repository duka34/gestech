import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  Users,
  Boxes,
  MessageCircle,
  BarChart3,
  LogOut,
  Cpu,
  PackagePlus,
  History,
  LayoutDashboard,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = { to: string; label: string; icon: typeof Cpu; adminOnly?: boolean };

const nav: NavItem[] = [
  { to: "/dashboard", label: "Panel principal", icon: LayoutDashboard, adminOnly: true },
  { to: "/ordenes", label: "Órdenes de trabajo", icon: ClipboardList },
  { to: "/stock", label: "Gestión de productos", icon: Boxes },
  { to: "/reposicion-stock", label: "Reposición de stock", icon: PackagePlus, adminOnly: true },
  { to: "/chatbot", label: "Chatbot WhatsApp", icon: MessageCircle, adminOnly: true },
  { to: "/reportes", label: "Informes y estadísticas", icon: BarChart3, adminOnly: true },
  { to: "/auditoria", label: "Auditoría", icon: History, adminOnly: true },
  { to: "/usuarios", label: "Gestión de usuarios", icon: Users, adminOnly: true },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const { currentUser, logout } = useAuth();
  const nombreCompleto = currentUser ? `${currentUser.nombre} ${currentUser.apellido}` : "";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 flex items-center justify-center shadow-lg shadow-sidebar-primary/20 ring-1 ring-white/10">
            <Cpu className="size-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-sidebar-accent-foreground leading-tight">
              GesTech
            </div>
            <div className="text-[11px] text-sidebar-foreground/55">Gestión de servicio</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((item) => {
            if (item.adminOnly && currentUser?.rol !== "ADMINISTRADOR") return null;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-sidebar-primary" />
                )}
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="size-9 ring-1 ring-sidebar-border">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-medium">
                {[currentUser?.nombre, currentUser?.apellido]
                  .filter(Boolean)
                  .map((s) => s![0])
                  .slice(0, 2)
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate text-sidebar-accent-foreground">
                {nombreCompleto}
              </div>
              <div className="text-[11px] text-sidebar-foreground/55 capitalize">
                {currentUser?.rol === "ADMINISTRADOR" ? "Administrador" : "Técnico"}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
