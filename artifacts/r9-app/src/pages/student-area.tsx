import { useQuery } from "@tanstack/react-query";
import { GraduationCap, ImageOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { Badge } from "@workspace/iasport/components/ui/badge";
import { Spinner } from "@workspace/iasport/components/ui/spinner";
import { PageHeader } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer } from "@/lib/data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Área do aluno aprovado (somente visualização):
 * perfil (registro de aluno vinculado, se houver) + posts gerados sobre ele.
 */
export default function StudentAreaPage() {
  const { session } = useAuth();
  const user = session?.user;
  const studentRecordId = user?.studentRecordId;

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
              {student.position && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Posição</dt>
                  <dd className="font-medium">{student.position}</dd>
                </div>
              )}
              {student.heightCm != null && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Altura</dt>
                  <dd className="font-medium">{student.heightCm} cm</dd>
                </div>
              )}
              {student.weightKg != null && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Peso</dt>
                  <dd className="font-medium">{student.weightKg} kg</dd>
                </div>
              )}
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
                vinculado à sua conta na escola. Fale com sua escolinha para que
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
        ) : !postsQuery.data || postsQuery.data.length === 0 ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ImageOff className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum post gerado sobre você ainda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {postsQuery.data.map((post) => (
              <Card key={post.id} className="overflow-hidden border-border">
                <img
                  src={post.imageUrl}
                  alt="Post gerado"
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <CardContent className="py-2">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(post.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
