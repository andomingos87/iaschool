import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@workspace/iaschool-ui/components/ui/toaster';
import { TooltipProvider } from '@workspace/iaschool-ui/components/ui/tooltip';
import { Spinner } from '@workspace/iaschool-ui/components/ui/spinner';
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
import ResetPasswordPage from '@/pages/reset-password';
import { isRecoveryPending } from '@/lib/recovery';
import DashboardPage from '@/pages/dashboard';
import StudentsPage from '@/pages/students';
import StudentDetailPage from '@/pages/student-detail';
import SchoolBrandsPage from '@/pages/school-brands';
import ClassesPage from '@/pages/classes';
import ReferencesPage from '@/pages/references';
import GalleryPage from '@/pages/gallery';
import GeneratePage from '@/pages/generate';
import AdminPromptPage from '@/pages/admin-prompt';
import AdminLogsPage from '@/pages/admin-logs';
import { LOGS_ADMIN_EMAIL } from '@/lib/constants';
import { isPlatformAdmin } from '@/lib/data';
import ApprovalsPage from '@/pages/approvals';
import PendingApprovalPage from '@/pages/pending-approval';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Pages() {
  const { session } = useAuth();
  const role = session?.user.role;

  // Papel de plataforma (super_admin ou dev): aprovações, prompt, logs.
  const isSuperAdmin = isPlatformAdmin(role);
  // Logs de geração: além de super_admin, exige o e-mail exato do admin.
  const isLogsAdmin =
    isSuperAdmin &&
    session?.user.email.toLowerCase() === LOGS_ADMIN_EMAIL;

  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/gerar" component={GeneratePage} />
      <Route path="/alunos" component={StudentsPage} />
      <Route path="/alunos/:id" component={StudentDetailPage} />
      <Route path="/escolas" component={SchoolBrandsPage} />
      <Route path="/turmas" component={ClassesPage} />
      <Route path="/referencias" component={ReferencesPage} />
      <Route path="/galeria" component={GalleryPage} />
      {/* Rotas de super_admin */}
      <Route path="/admin/prompt">
        {isSuperAdmin ? <AdminPromptPage /> : <NotFound />}
      </Route>
      <Route path="/admin/logs">
        {isLogsAdmin ? <AdminLogsPage /> : <NotFound />}
      </Route>
      {isSuperAdmin && (
        <Route path="/aprovacoes" component={ApprovalsPage} />
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  const [recovering, setRecovering] = useState(
    () => isRecoveryPending(),
  );

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

  // Conta cadastrada mas ainda não aprovada (ou recusada): sem acesso ao app.
  if (session.user.approvalStatus && session.user.approvalStatus !== 'approved') {
    return <PendingApprovalPage />;
  }

  // Sessão criada pelo link de recuperação de senha do e-mail:
  // exige definir a nova senha antes de entrar no app.
  if (recovering) {
    return <ResetPasswordPage onDone={() => setRecovering(false)} />;
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
