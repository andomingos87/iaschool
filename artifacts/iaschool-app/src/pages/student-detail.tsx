import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArchiveRestore,
  ArrowLeft,
  Calendar,
  GalleryVerticalEnd,
  Images,
  Maximize2,
  Pencil,
  Phone,
  School,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/iaschool-ui/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/iaschool-ui/components/ui/alert-dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/iaschool-ui/components/ui/radio-group";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/iaschool-ui/components/ui/tabs";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { useClassLabels } from "@/hooks/use-classes";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { StudentFormDialog } from "@/components/student-form-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import { GuardianVerifyDialog } from "@/components/guardian-verify-dialog";
import { StudentAuthorizationsCard } from "@/components/student-authorizations-card";
import { StudentReferenceFaces } from "@/components/student-reference-faces";
import {
  useStudent,
  useMoveStudentsToTrash,
  useRestoreStudents,
  useDeleteStudentsPermanently,
} from "@/hooks/use-students";
import { useSchoolBrands } from "@/hooks/use-school-brands";
import { useGeneratedPosts } from "@/hooks/use-generated-posts";
import { useAuth } from "@/hooks/use-auth";
import { TRASH_RETENTION_DAYS, isPlatformAdmin } from "@/lib/data";
import { requiresGuardianConsent } from "@/lib/eca";
import {
  ageFromIso,
  formatDateTime,
  initials,
  isoToBrDate,
  storedToMasked,
} from "@/lib/format";

type DeleteMode = "trash" | "permanent";

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? null;
  const [, navigate] = useLocation();
  const { session } = useAuth();
  const isAdmin = isPlatformAdmin(session?.user.role);

  const student = useStudent(id);
  const classLabels = useClassLabels();
  const schoolBrands = useSchoolBrands();
  const posts = useGeneratedPosts();
  const moveToTrash = useMoveStudentsToTrash();
  const restore = useRestoreStudents();
  const deletePermanently = useDeleteStudentsPermanently();

  const [editOpen, setEditOpen] = useState(false);
  const [guardianDialogOpen, setGuardianDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("trash");
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const s = student.data;
  // A escola do aluno é o tenant dele (M1); a identidade visual é a mesma linha.
  const schoolBrand = useMemo(
    () => schoolBrands.data?.find((b) => b.id === s?.schoolId),
    [schoolBrands.data, s?.schoolId],
  );
  const studentPosts = useMemo(
    () => (posts.data ?? []).filter((p) => p.studentId === id),
    [posts.data, id],
  );

  const busy = moveToTrash.isPending || restore.isPending || deletePermanently.isPending;
  const isInTrash = !!s?.deletedAt;

  async function confirmDelete() {
    if (!s) return;
    setConfirmOpen(false);
    try {
      if (deleteMode === "permanent") {
        await deletePermanently.mutateAsync([s.id]);
        toast({
          title: "Aluno excluído definitivamente",
          description: s.name,
        });
      } else {
        await moveToTrash.mutateAsync([s.id]);
        toast({
          title: "Movido para a lixeira",
          description: `"${s.name}" fica na lixeira por ${TRASH_RETENTION_DAYS} dias. Você pode restaurar na tela Alunos.`,
        });
      }
      navigate("/alunos");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    }
  }

  const permanentWarning =
    "Esta ação não pode ser desfeita: o registro e as fotos do aluno serão removidos para sempre.";

  if (student.isError) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Aluno" />
        <ErrorState onRetry={() => student.refetch()} />
      </div>
    );
  }

  if (student.isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Aluno" description="Carregando dados..." />
        <CardsSkeleton count={3} />
      </div>
    );
  }

  if (!s) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Aluno" />
        <EmptyState
          icon={<Users className="size-6" />}
          title="Aluno não encontrado"
          description="Este aluno pode ter sido excluído."
          action={
            <Link href="/alunos" data-testid="link-back-to-students">
              <Button variant="outline">
                <ArrowLeft className="size-4" /> Voltar para Alunos
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const age = ageFromIso(s.birthDate);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link href="/alunos" data-testid="link-back-to-students">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" /> Alunos
          </Button>
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {s.photos?.[0] && (
              <AvatarImage
                src={s.photos[0].url}
                alt={s.name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-muted text-lg">
              {initials(s.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1
              className="text-2xl font-bold"
              data-testid="text-student-detail-name"
            >
              {s.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {age !== null && (
                <span className="text-sm text-muted-foreground">
                  {age} anos
                </span>
              )}
              {s.deletedAt && (
                <Badge variant="destructive" data-testid="badge-in-trash">
                  Na lixeira
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isInTrash ? (
            // Aluno na lixeira: apenas restaurar e (se admin) excluir definitivamente.
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRestoreConfirm(true)}
                data-testid="button-restore-student-detail"
              >
                <ArchiveRestore className="size-4" /> Restaurar
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => {
                    setDeleteMode("permanent");
                    setConfirmOpen(true);
                  }}
                  data-testid="button-delete-student-detail"
                >
                  <Trash2 className="size-4" /> Excluir definitivamente
                </Button>
              )}
            </>
          ) : (
            // Aluno ativo: ações completas.
            <>
              <Link
                href={`/gerar?aluno=${s.id}`}
                data-testid="button-generate-for-student"
              >
                <Button>
                  <Sparkles className="size-4" /> Gerar post
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                data-testid="button-edit-student-detail"
              >
                <Pencil className="size-4" /> Editar
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setDeleteMode("trash");
                  setConfirmOpen(true);
                }}
                data-testid="button-delete-student-detail"
              >
                <Trash2 className="size-4" /> Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Dados do aluno e autorizações */}
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Dados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4" />
                <span
                  className="text-foreground"
                  data-testid="text-student-whatsapp"
                >
                  {storedToMasked(s.whatsapp)}
                </span>
              </p>
              {s.birthDate && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-4" />
                  <span className="text-foreground">
                    {isoToBrDate(s.birthDate)}
                    {age !== null ? ` (${age} anos)` : ""}
                  </span>
                </p>
              )}
              <div className="border-t border-border pt-3">
                <p className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <School className="size-4" /> Escola
                </p>
                <p data-testid="text-student-school-brand">
                  {schoolBrand?.name ?? (
                    <span className="text-muted-foreground">Sem escola</span>
                  )}
                </p>
              </div>
              {/* Responsável legal — exigido para menores de 18 anos
                  (Lei nº 15.211/2025, arts. 7º, § 2º e 24). */}
              {requiresGuardianConsent(s.birthDate) && (
                <div
                  className="border-t border-border pt-3"
                  data-testid="section-detail-guardian"
                >
                  <p className="mb-1 flex items-center gap-2 text-muted-foreground">
                    <ShieldCheck className="size-4" /> Responsável legal
                  </p>
                  {s.guardian?.name ? (
                    <div className="space-y-1">
                      <p data-testid="text-guardian-name">
                        {s.guardian.name}
                        {s.guardian.relationship && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({s.guardian.relationship})
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {storedToMasked(s.guardian.whatsapp)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge
                          variant={s.guardian.consentAt ? "secondary" : "destructive"}
                          data-testid="badge-guardian-consent"
                        >
                          {s.guardian.consentAt
                            ? "Autorização registrada"
                            : "Sem autorização"}
                        </Badge>
                        <Badge
                          variant={
                            s.guardian.whatsappVerifiedAt ? "secondary" : "destructive"
                          }
                          data-testid="badge-guardian-verified"
                        >
                          {s.guardian.whatsappVerifiedAt
                            ? "WhatsApp verificado"
                            : "WhatsApp não verificado"}
                        </Badge>
                      </div>
                      {!s.guardian.whatsappVerifiedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => setGuardianDialogOpen(true)}
                          data-testid="button-verify-guardian"
                        >
                          <ShieldCheck className="size-4" /> Verificar WhatsApp
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-destructive">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                      <span className="text-xs">
                        Aluno menor de 18 anos sem responsável cadastrado. A
                        geração de imagens está bloqueada até que o cadastro seja
                        completado.
                      </span>
                    </p>
                  )}
                </div>
              )}
              <div className="border-t border-border pt-3">
                <p className="mb-1 text-muted-foreground">Turma</p>
                <p data-testid="text-student-class">
                  {(s.classId && classLabels.get(s.classId)) || (
                    <span className="text-muted-foreground">Sem turma</span>
                  )}
                </p>
              </div>
              {s.enrollmentNumber && (
                <div className="border-t border-border pt-3">
                  <p className="mb-1 text-muted-foreground">Matrícula</p>
                  <p data-testid="text-student-enrollment">{s.enrollmentNumber}</p>
                </div>
              )}
              {s.notes && (
                <div className="border-t border-border pt-3">
                  <p className="mb-1 text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap">{s.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Consentimento por escopo (M4): grava em `authorizations`, uma
              linha por escopo, com a evidência de quem registrou. */}
          {!isInTrash && <StudentAuthorizationsCard student={s} />}
        </div>

        {/* Galerias e rosto de referência */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="gallery">
            <TabsList className="mb-4">
              <TabsTrigger value="gallery" data-testid="tab-student-gallery">
                <Images className="size-4" /> Fotos e artes
              </TabsTrigger>
              <TabsTrigger value="reference" data-testid="tab-student-reference">
                <ScanFace className="size-4" /> Rosto de referência
              </TabsTrigger>
            </TabsList>
            <TabsContent value="gallery" className="space-y-6">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Images className="size-4 text-primary" /> Fotos cadastradas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {s.photos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma foto cadastrada. Edite o aluno para adicionar fotos.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {s.photos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setZoom(p.url)}
                          className="group relative size-24 overflow-hidden rounded-md border border-border"
                          data-testid={`photo-student-${p.id}`}
                        >
                          <img
                            src={p.url}
                            alt={`Foto de ${s.name}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                            <Maximize2 className="size-4" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GalleryVerticalEnd className="size-4 text-primary" /> Imagens
                    geradas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {posts.isError ? (
                    <ErrorState onRetry={() => posts.refetch()} />
                  ) : posts.isLoading ? (
                    <CardsSkeleton count={2} />
                  ) : studentPosts.length === 0 ? (
                    <div className="flex flex-col items-start gap-3">
                      <p className="text-sm text-muted-foreground">
                        Nenhuma arte gerada para este aluno.
                      </p>
                      {!isInTrash && (
                        <Link href={`/gerar?aluno=${s.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="button-generate-first-post"
                          >
                            <Sparkles className="size-4" /> Gerar o primeiro post
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {studentPosts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setZoom(post.imageUrl)}
                          className="group overflow-hidden rounded-lg border border-border bg-muted text-left"
                          data-testid={`card-student-post-${post.id}`}
                        >
                          <div className="aspect-square overflow-hidden">
                            <img
                              src={post.imageUrl}
                              alt={`Post de ${s.name}`}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                          <p className="p-2 text-xs text-muted-foreground">
                            {formatDateTime(post.createdAt)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="reference">
              <StudentReferenceFaces student={s} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <StudentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={s}
      />

      <GuardianVerifyDialog
        open={guardianDialogOpen}
        onOpenChange={setGuardianDialogOpen}
        student={s}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{s.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {isAdmin
                ? "Escolha como deseja excluir este aluno."
                : `O aluno vai para a lixeira e será excluído definitivamente após ${TRASH_RETENTION_DAYS} dias. Até lá, você pode restaurá-lo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isAdmin && (
            <RadioGroup
              value={deleteMode}
              onValueChange={(v) => setDeleteMode(v as DeleteMode)}
              className="gap-3"
            >
              <div className="flex items-start gap-3 rounded-md border border-border p-3">
                <RadioGroupItem
                  value="trash"
                  id="detail-delete-mode-trash"
                  data-testid="radio-delete-trash"
                />
                <Label
                  htmlFor="detail-delete-mode-trash"
                  className="cursor-pointer font-normal"
                >
                  <span className="block font-medium">
                    Excluir (lixeira {TRASH_RETENTION_DAYS} dias)
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Pode ser restaurado dentro do prazo.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-destructive/40 p-3">
                <RadioGroupItem
                  value="permanent"
                  id="detail-delete-mode-permanent"
                  data-testid="radio-delete-permanent"
                />
                <Label
                  htmlFor="detail-delete-mode-permanent"
                  className="cursor-pointer font-normal"
                >
                  <span className="block font-medium text-destructive">
                    Excluir definitivamente
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {permanentWarning}
                  </span>
                </Label>
              </div>
            </RadioGroup>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMode === "permanent"
                ? "Excluir definitivamente"
                : "Mover para a lixeira"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de restauração */}
      <AlertDialog open={restoreConfirm} onOpenChange={setRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar "{s.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O aluno volta para a lista ativa e deixa de ter prazo de exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setRestoreConfirm(false);
                try {
                  await restore.mutateAsync([s.id]);
                  toast({
                    title: "Aluno restaurado",
                    description: `"${s.name}" está de volta na lista de alunos.`,
                  });
                  navigate("/alunos");
                } catch (err) {
                  toast({
                    variant: "destructive",
                    title: "Não foi possível restaurar",
                    description:
                      err instanceof Error
                        ? err.message
                        : "Tente novamente em instantes.",
                  });
                }
              }}
              disabled={busy}
              data-testid="button-confirm-restore"
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
