import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, GraduationCap, ImageOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer } from "@/lib/data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Baixa a imagem do post (funciona com URLs assinadas e data URLs). */
async function downloadImage(url: string, fileName: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível baixar a imagem.");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Área do aluno aprovado (somente visualização):
 * perfil (registro de aluno vinculado, se houver) + posts gerados sobre ele.
 */
export default function StudentAreaPage() {
  const { session } = useAuth();
  const user = session?.user;
  const studentRecordId = user?.studentRecordId;
  const [zoom, setZoom] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(post: { id: string; imageUrl: string; createdAt: string }) {
    setDownloading(post.id);
    try {
      await downloadImage(
        post.imageUrl,
        `post-${post.createdAt.slice(0, 10)}-${post.id.slice(0, 8)}.png`,
      );
    } catch {
      toast({
        title: "Falha ao baixar",
        description: "Não foi possível baixar a imagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  }

  const studentQuery = useQuery({
    queryKey: ["student-record", studentRecordId],
    queryFn: () => getDataLayer().students.get(studentRecordId!),
    enabled: Boolean(studentRecordId),
  });

  const postsQuery = useQuery({
    queryKey: ["student-posts", studentRecordId],
    queryFn: async () => {
      const posts = await getDataLayer().generatedPosts.list();
      // No Supabase a RLS já filtra; no mock filtramos aqui.
      return posts.filter((p) => p.studentId === studentRecordId);
    },
    enabled: Boolean(studentRecordId),
  });

  const student = studentQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${user?.name ?? "aluno"}!`}
        description="Seu perfil e os posts gerados sobre você."
      />

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-5 text-primary" />
            Meu perfil
          </CardTitle>
        </CardHeader>
        <CardContent>
          {studentRecordId && studentQuery.isLoading ? (
            <Spinner className="size-6 text-primary" />
          ) : student ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Nome</dt>
                <dd className="font-medium" data-testid="text-student-name">{student.name}</dd>
              </div>
              {student.birthDate && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Nascimento</dt>
                  <dd className="font-medium">{student.birthDate}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground" data-testid="text-no-student-record">
              <p className="font-medium text-foreground">{user?.name}</p>
              <p className="mt-1">
                Seu cadastro foi aprovado, mas ainda não há um registro de aluno
                vinculado à sua conta na escola. Fale com a secretaria para que
                seus dados e posts apareçam aqui.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Meus posts</h2>
          {postsQuery.data && (
            <Badge variant="secondary">{postsQuery.data.length}</Badge>
          )}
        </div>
        {!studentRecordId ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ImageOff className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Assim que sua conta for vinculada ao registro da escola, os
                posts gerados sobre você aparecerão aqui.
              </p>
            </CardContent>
          </Card>
        ) : postsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-8 text-primary" />
          </div>
        ) : postsQuery.isError ? (
          <ErrorState
            message="Não foi possível carregar seus posts."
            onRetry={() => void postsQuery.refetch()}
          />
        ) : !postsQuery.data || postsQuery.data.length === 0 ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ImageOff className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhuma arte gerada sobre você ainda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {postsQuery.data.map((post) => (
              <Card key={post.id} className="overflow-hidden border-border">
                <button
                  type="button"
                  onClick={() => setZoom(post.imageUrl)}
                  className="block w-full cursor-zoom-in"
                  data-testid={`button-zoom-post-${post.id}`}
                >
                  <img
                    src={post.imageUrl}
                    alt="Post gerado"
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </button>
                <CardContent className="flex items-center justify-between py-2">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(post.createdAt)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => void handleDownload(post)}
                    disabled={downloading === post.id}
                    aria-label="Baixar imagem"
                    data-testid={`button-download-post-${post.id}`}
                  >
                    {downloading === post.id ? (
                      <Spinner className="size-4" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
