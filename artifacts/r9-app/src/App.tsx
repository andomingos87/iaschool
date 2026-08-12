import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@workspace/iasport/components/ui/toaster';
import { TooltipProvider } from '@workspace/iasport/components/ui/tooltip';
import { Spinner } from '@workspace/iasport/components/ui/spinner';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { ThemeProvider } from '@/hooks/use-theme';
import { AppShell } from '@/components/app-shell';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import StudentsPage from '@/pages/students';
import ClubsPage from '@/pages/clubs';
import ReferencesPage from '@/pages/references';
import MetricsPage from '@/pages/metrics';
import GeneratePage from '@/pages/generate';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Pages() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/gerar" component={GeneratePage} />
      <Route path="/alunos" component={StudentsPage} />
      <Route path="/clubes" component={ClubsPage} />
      <Route path="/referencias" component={ReferencesPage} />
      <Route path="/metricas" component={MetricsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Pages />
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <AuthGate />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
