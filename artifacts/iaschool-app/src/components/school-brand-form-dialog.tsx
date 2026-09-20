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
import { Separator } from "@workspace/iaschool-ui/components/ui/separator";
import { MultiUpload } from "@/components/multi-upload";
import { ColorPicker } from "@/components/color-picker";
import { useUpdateSchoolBrand } from "@/hooks/use-school-brands";
import type { SchoolBrand, StoredImage } from "@/lib/data";
import { BUCKETS } from "@/lib/constants";
import {
  isValidCnpj,
  isValidWhatsapp,
  maskCnpj,
  maskWhatsapp,
  maskZip,
  onlyDigits,
  storedToMasked,
  whatsappToStored,
} from "@/lib/format";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da escola"),
  // CNPJ e contato são opcionais: a escola nasce na aprovação do cadastro, com
  // nome apenas. Quando preenchidos, precisam ser válidos.
  cnpj: z.string().refine(isValidCnpj, "CNPJ inválido"),
  zip: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z
    .string()
    .refine(
      (v) => v.trim() === "" || isValidWhatsapp(v),
      "Telefone inválido — use (11) 99999-9999",
    ),
  email: z
    .string()
    .refine(
      (v) => v.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "E-mail inválido",
    ),
  responsible: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  cnpj: "",
  zip: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  phone: "",
  email: "",
  responsible: "",
};

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
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (brand) {
      form.reset({
        name: brand.name,
        cnpj: brand.cnpj ? maskCnpj(brand.cnpj) : "",
        zip: brand.address?.zip ? maskZip(brand.address.zip) : "",
        street: brand.address?.street ?? "",
        number: brand.address?.number ?? "",
        complement: brand.address?.complement ?? "",
        district: brand.address?.district ?? "",
        city: brand.address?.city ?? "",
        state: brand.address?.state ?? "",
        phone: brand.contact?.phone ? storedToMasked(brand.contact.phone) : "",
        email: brand.contact?.email ?? "",
        responsible: brand.contact?.responsible ?? "",
      });
      setLogo(brand.logo ? [brand.logo] : []);
      setColors(brand.colors ?? []);
    } else {
      form.reset(EMPTY_VALUES);
      setLogo([]);
      setColors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand]);

  const saving = update.isPending;

  async function onSubmit(values: FormValues) {
    if (!brand) return;
    const trimmed = (v?: string) => v?.trim() || undefined;
    const payload: Omit<SchoolBrand, "id" | "createdAt" | "updatedAt"> = {
      name: values.name.trim(),
      logo: logo[0],
      colors: colors.slice(0, 3),
      cnpj: onlyDigits(values.cnpj) || undefined,
      address: {
        zip: onlyDigits(values.zip ?? "") || undefined,
        street: trimmed(values.street),
        number: trimmed(values.number),
        complement: trimmed(values.complement),
        district: trimmed(values.district),
        city: trimmed(values.city),
        state: trimmed(values.state)?.toUpperCase(),
      },
      contact: {
        phone: values.phone.trim() ? whatsappToStored(values.phone) : undefined,
        email: trimmed(values.email),
        responsible: trimmed(values.responsible),
      },
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
            Dados de cadastro da escola e a identidade visual usada nas artes.
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

            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      data-testid="input-school-cnpj"
                      value={field.value}
                      onChange={(e) => field.onChange(maskCnpj(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <p className="text-sm font-medium">Endereço</p>
            <div className="grid gap-4 sm:grid-cols-6">
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="00000-000"
                        data-testid="input-school-zip"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(maskZip(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="street"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Rua, avenida…"
                        data-testid="input-school-street"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl>
                      <Input data-testid="input-school-number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="complement"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Complemento</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Bloco, sala…"
                        data-testid="input-school-complement"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Bairro</FormLabel>
                    <FormControl>
                      <Input data-testid="input-school-district" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="sm:col-span-4">
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input data-testid="input-school-city" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>UF</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={2}
                        placeholder="SP"
                        data-testid="input-school-state"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase(),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <p className="text-sm font-medium">Contato</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="(11) 99999-9999"
                        data-testid="input-school-phone"
                        value={field.value}
                        onChange={(e) => field.onChange(maskWhatsapp(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="secretaria@escola.com.br"
                        data-testid="input-school-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsible"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Responsável pela conta</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Direção, coordenação, secretaria…"
                        data-testid="input-school-responsible"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
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
