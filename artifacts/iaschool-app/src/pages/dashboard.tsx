import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Users,
  School,
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
} from "@workspace/iaschool-ui/components/ui/card";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Skeleton } from "@workspace/iaschool-ui/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { GenerationDetailsSection } from "@/components/generation-details";
import type { GeneratedPost } from "@/lib/data";
import { useStudents } from "@/hooks/use-students";
import { useSchoolBrands } from "@/hooks/use-school-brands";
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
  const schoolBrands = useSchoolBrands();
  const references = useReferences();
  const posts = useGeneratedPosts();
  const [zoomPost, setZoomPost] = useState<GeneratedPost | null>(null);

  const studentName = useMemo(() => {
    const map = new Map((students.data ?? []).map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "Aluno";
  }, [students.data]);

  const firstName = session?.user.name.split(" ")[0] ?? "";
  const loading = students.isLoading || schoolBrands.isLoading || references.isLoading;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Visão geral da sua escola e atalhos rápidos."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="size-6" />}
          label="Alunos"
          value={students.data?.length ?? 0}
          href="/alunos"
          loading={students.isLoading}
        />
        <StatCard
          icon={<School className="size-6" />}
          label="Escolas"
          value={schoolBrands.data?.length ?? 0}
          href="/escolas"
          loading={schoolBrands.isLoading}
        />
        <StatCard
          icon={<Images className="size-6" />}
          label="Modelos de arte"
          value={references.data?.length ?? 0}
          href="/referencias"
          loading={references.isLoading}
        />
        <StatCard
          icon={<Sparkles className="size-6" />}
          label="Artes geradas"
          value={posts.data?.length ?? 0}
          href="/galeria"
          loading={posts.isLoading}
        />
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Artes recentes</CardTitle>
            <CardDescription>Últimas artes geradas.</CardDescription>
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
              title="Nenhuma arte gerada ainda"
              description="Crie sua primeira arte para vê-la aqui."
              action={
                <Link href="/gerar" data-testid="link-empty-gerar">
                  <Button>
                    <Sparkles className="size-4" /> Criar arte
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
