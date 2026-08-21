import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/iasport/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iasport/components/ui/form";
import { Input } from "@workspace/iasport/components/ui/input";
import { Button } from "@workspace/iasport/components/ui/button";
import { Label } from "@workspace/iasport/components/ui/label";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { MultiUpload } from "@/components/multi-upload";
import { ColorPicker } from "@/components/color-picker";
import { useCreateClub, useUpdateClub } from "@/hooks/use-clubs";
import type { Club, StoredImage } from "@/lib/data";
import { BUCKETS } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da escola"),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  club: Club | null;
  /** Chamado com o clube criado/atualizado após salvar com sucesso. */
  onSaved?: (club: Club) => void;
}

export function ClubFormDialog({ open, onOpenChange, club, onSaved }: Props) {
  const create = useCreateClub();
  const update = useUpdateClub();
  const [logo, setLogo] = useState<StoredImage[]>([]);
  const [uniforms, setUniforms] = useState<StoredImage[]>([]);
  const [colors, setColors] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (!open) return;
    if (club) {
      form.reset({ name: club.name });
      setLogo(club.logo ? [club.logo] : []);
      setUniforms(club.uniforms ?? []);
      setColors(club.colors ?? []);
    } else {
      form.reset({ name: "" });
      setLogo([]);
      setUniforms([]);
      setColors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, club]);

  const saving = create.isPending || update.isPending;

  async function onSubmit(values: FormValues) {
    const payload: Omit<Club, "id" | "createdAt" | "updatedAt"> = {
      name: values.name.trim(),
      logo: logo[0],
      uniforms,
      colors: colors.slice(0, 3),
    };
    try {
      let saved: Club;
      if (club) {
        saved = await update.mutateAsync({ id: club.id, patch: payload });
        toast({ title: "Escola atualizada", description: values.name });
      } else {
        saved = await create.mutateAsync(payload);
        toast({ title: "Escola cadastrada", description: values.name });
      }
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{club ? "Editar escola" : "Nova escola"}</DialogTitle>
          <DialogDescription>
            Defina nome, logo, uniformes e até 3 cores da marca.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
              <FormLabel>Nome da escola *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Escola Horizonte" data-testid="input-club-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Logo da escola (uma imagem)</Label>
              <MultiUpload
                bucket={BUCKETS.clubs}
                value={logo}
                onChange={setLogo}
                single
                label="Arraste o logo aqui ou clique para selecionar"
                data-testid="upload-club-logo"
              />
            </div>

            <div className="space-y-2">
              <Label>Uniformes (uma ou mais imagens)</Label>
              <MultiUpload
                bucket={BUCKETS.clubs}
                value={uniforms}
                onChange={setUniforms}
                label="Arraste os uniformes aqui ou clique para selecionar"
                data-testid="upload-club-uniforms"
              />
            </div>

            <div className="space-y-2">
              <Label>Cores da marca (até 3)</Label>
              <ColorPicker value={colors} onChange={setColors} max={3} />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-club"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="button-save-club">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
