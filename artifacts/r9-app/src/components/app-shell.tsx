import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  Users,
  Shield,
  Images,
  BarChart3,
  Sparkles,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/iasport/components/ui/sidebar";
import {
  Avatar,
  AvatarFallback,
} from "@workspace/iasport/components/ui/avatar";
import { Button } from "@workspace/iasport/components/ui/button";
import { Badge } from "@workspace/iasport/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/iasport/components/ui/dropdown-menu";
import { R9Logo } from "@/components/r9-logo";
import { DemoIndicator } from "@/components/demo-indicator";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/format";

const NAV = [
  { href: "/", label: "Início", icon: Home },
  { href: "/gerar", label: "Gerar imagem", icon: Sparkles, highlight: true },
  { href: "/alunos", label: "Alunos", icon: Users },
  { href: "/clubes", label: "Clubes", icon: Shield },
  { href: "/referencias", label: "Referências", icon: Images },
  { href: "/metricas", label: "Métricas", icon: BarChart3 },
];

function roleLabel(role: string) {
  return role === "super_admin" ? "Administrador" : "Escolinha";
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { session, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const user = session?.user;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border p-3">
          <Link href="/" data-testid="link-logo">
            <R9Logo />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => {
                  const active =
                    item.href === "/"
                      ? location === "/"
                      : location.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Link
                          href={item.href}
                          className="flex items-center gap-2"
                          data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                          {item.highlight && (
                            <Badge className="ml-auto h-5 px-1.5 text-[10px]">
                              IA
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                {user ? initials(user.name) : "R9"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium" data-testid="text-user-name">
                {user?.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user ? roleLabel(user.role) : ""}
              </p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <div className="ml-auto flex items-center gap-2">
            <DemoIndicator />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Alternar tema"
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-user-menu"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                      {user ? initials(user.name) : "R9"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="leading-tight">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs font-normal text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut()}
                  data-testid="button-logout"
                >
                  <LogOut className="size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-h-[calc(100dvh-3.5rem)] p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Cabeçalho de página reutilizável. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
