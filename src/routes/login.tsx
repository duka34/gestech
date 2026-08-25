import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Cpu, Wrench, Camera, MessageCircle, BarChart3 } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Iniciar sesión — GesTech" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin123");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const usuario = await login(username.trim(), password);
      toast.success(`Bienvenido ${usuario.nombre}`);
      navigate({ to: "/ordenes" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Credenciales incorrectas");
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div
        className="hidden lg:flex relative flex-col justify-between p-12 bg-sidebar text-sidebar-foreground overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(720px circle at 85% -10%, color-mix(in oklch, var(--color-sidebar-primary) 25%, transparent), transparent 60%), radial-gradient(600px circle at -10% 110%, color-mix(in oklch, var(--color-sidebar-primary) 16%, transparent), transparent 55%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 flex items-center justify-center shadow-lg shadow-sidebar-primary/20 ring-1 ring-white/10">
            <Cpu className="size-6 text-sidebar-primary-foreground" />
          </div>
          <div className="text-xl font-semibold text-sidebar-accent-foreground">GesTech</div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-3xl font-semibold text-sidebar-accent-foreground leading-tight">
            Toda la operación del negocio, en un solo lugar.
          </h2>
          <ul className="space-y-3">
            {[
              { icon: Wrench, text: "Servicio técnico con presupuesto, estados y garantías" },
              { icon: Camera, text: "Instalación y mantenimiento de cámaras de seguridad" },
              { icon: MessageCircle, text: "Chatbot de WhatsApp para presupuestos y avisos" },
              { icon: BarChart3, text: "Informes y estadísticas para la toma de decisiones" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-sidebar-foreground/80">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
                  <Icon className="size-3.5 text-sidebar-primary" />
                </span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">
          Universidad Católica de Santiago del Estero · Proyecto GesTech
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2.5 mb-2">
            <div className="size-9 rounded-lg bg-primary flex items-center justify-center">
              <Cpu className="size-5 text-primary-foreground" />
            </div>
            <div className="font-semibold tracking-tight">GesTech</div>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
            <p className="text-sm text-muted-foreground">Accedé al panel de gestión.</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" size="lg">
            Ingresar
          </Button>
          <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/40">
            <div className="font-medium mb-1 text-foreground">Usuarios demo</div>
            <div>
              Admin: <code>admin</code> / <code>Admin123</code>
            </div>
            <div>
              Técnico: <code>marcelo</code> / <code>Marcelo1</code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
