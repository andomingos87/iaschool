import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Users,
  Shield,
  Images,
  Sparkles,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { Button } from "@workspace/iasport/components/ui/button";
import { Skeleton } from "@workspace/iasport/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { GenerationDetailsSection } from "@/components/generation-details";
import type { GeneratedPost } from "@/lib/data";
import { useStudents } from "@/hooks/use-students";
import { useClubs } from "@/hooks/use-clubs";
import { useReferences } from "@/hooks/use-references";
import { useGeneratedPosts } from "@/hooks/use-generated-posts";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/format";

function StatCard({
  icon,
  label,
  value,
  href,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  loading: boolean;
}) {
  return (
    <Link href={href} data-testid={`card-stat-${label.toLowerCase()}`}>
      <Card className="group h-full border-border transition-colors hover:border-primary/60">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-12 items-center justify-center rounded-md bg-accent text-accent-foreground">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-bold" data-testid={`text-count-${label.toLowerCase()}`}>
                {value}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { session } = useAuth();
  const students = useStudents();
  const clubs = useClubs();
  const references = useReferences();
  const posts = useGeneratedPosts();
  const [zoomPost, setZoomPost] = useState<GeneratedPost | null>(null);

  const studentName = useMemo(() => {
    const map = new Map((students.data ?? []).map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "Aluno";
  }, [students.data]);

  const firstName = session?.user.name.split(" ")[0] ?? "";
  const loading = students.isLoading || clubs.isLoading || references.isLoading;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Visão geral da sua escolinha e atalhos rápidos."
      />

      {/* CTA principal */}
      <Card className="mb-6 overflow-hidden border-primary/40 bg-gradient-to-br from-accent/60 to-card">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Gere um post com métricas</h2>
              <p className="text-sm text-muted-foreground">
                Escolha o aluno, aplique as cores do clube e compartilhe no WhatsApp.
              </p>
            </div>
          </div>
          <Link href="/gerar" data-testid="link-cta-gerar">
            <Button size="lg" className="w-full sm:w-auto">
              <Sparkles className="size-4" /> Gerar imagem
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="size-6" />}
          label="Alunos"
          value={students.data?.length ?? 0}
          href="/alunos"
          loading={students.isLoading}
        />
        <StatCard
          icon={<Shield className="size-6" />}
          label="Clubes"
          value={clubs.data?.length ?? 0}
          href="/clubes"
          loading={clubs.isLoading}
        />
        <StatCard
          icon={<Images className="size-6" />}
          label="Referências"
          value={references.data?.length ?? 0}
          href="/referencias"
          loading={references.isLoading}
        />
        <StatCard
          icon={<Sparkles className="size-6" />}
          label="Posts gerados"
          value={posts.data?.length ?? 0}
          href="/gerar"
          loading={posts.isLoading}
        />
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Posts recentes</CardTitle>
            <CardDescription>Últimas imagens geradas.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {posts.isError ? (
            <ErrorState onRetry={() => posts.refetch()} />
          ) : posts.isLoading || loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          ) : (posts.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-6" />}
              title="Nenhum post gerado ainda"
              description="Gere sua primeira imagem para vê-la aqui."
              action={
                <Link href="/gerar" data-testid="link-empty-gerar">
                  <Button>
                    <Sparkles className="size-4" /> Gerar imagem
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {posts.data!.slice(0, 8).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setZoomPost(post)}
                  className="group overflow-hidden rounded-lg border border-border bg-muted text-left"
                  data-testid={`card-post-${post.id}`}
                >
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={post.imageUrl}
                      alt="Post gerado"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="p-2">
                    <p className="truncate text-sm font-medium">
                      {studentName(post.studentId)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(post.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ImageLightbox
        src={zoomPost?.imageUrl ?? null}
        onClose={() => setZoomPost(null)}
        footer={
          <GenerationDetailsSection
            details={zoomPost?.details}
            className="mx-auto max-w-xl"
          />
        }
      />
    </div>
  );
}
