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
} from "@workspace/iaschool-ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/iaschool-ui/components/ui/form";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { MultiUpload } from "@/components/multi-upload";
import { ColorPicker } from "@/components/color-picker";
import { useUpdateSchoolBrand } from "@/hooks/use-school-brands";
import type { SchoolBrand, StoredImage } from "@/lib/data";
import { BUCKETS } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da escola"),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Escola a editar. A escola nasce na aprovação do cadastro (M1); aqui não se cria. */
  brand: SchoolBrand | null;
  /** Chamado com a escola atualizada após salvar com sucesso. */
  onSaved?: (brand: SchoolBrand) => void;
}

export function SchoolBrandFormDialog({
  open,
  onOpenChange,
  brand,
  onSaved,
}: Props) {
  const update = useUpdateSchoolBrand();
  const [logo, setLogo] = useState<StoredImage[]>([]);
  const [colors, setColors] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (!open) return;
    if (brand) {
      form.reset({ name: brand.name });
      setLogo(brand.logo ? [brand.logo] : []);
      setColors(brand.colors ?? []);
    } else {
      form.reset({ name: "" });
      setLogo([]);
      setColors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand]);

  const saving = update.isPending;

  async function onSubmit(values: FormValues) {
    if (!brand) return;
    const payload: Omit<SchoolBrand, "id" | "createdAt" | "updatedAt"> = {
      name: values.name.trim(),
      logo: logo[0],
      colors: colors.slice(0, 3),
    };
    try {
      const saved = await update.mutateAsync({ id: brand.id, patch: payload });
      toast({ title: "Escola atualizada", description: values.name });
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
          <DialogTitle>Editar escola</DialogTitle>
          <DialogDescription>
            Defina o nome, o logo e até 3 cores usadas nas artes da escola.
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
                    <Input
                      placeholder="Ex.: Escola Horizonte"
                      data-testid="input-school-brand-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Logo da escola (uma imagem)</Label>
              <MultiUpload
                bucket={BUCKETS.schoolBrands}
                value={logo}
                onChange={setLogo}
                single
                label="Arraste o logo aqui ou clique para selecionar"
                data-testid="upload-school-brand-logo"
              />
            </div>

            <div className="space-y-2">
              <Label>Cores da escola (até 3)</Label>
              <ColorPicker value={colors} onChange={setColors} max={3} />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-school-brand"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                data-testid="button-save-school-brand"
              >
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
