import { useEffect, useRef, useState } from "react";
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
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { Separator } from "@workspace/iaschool-ui/components/ui/separator";
import { useUpdateSchoolBrand } from "@/hooks/use-school-brands";
import type { SchoolBrand } from "@/lib/data";
import {
  addressFromSaved,
  emptyAddress,
  fetchViaCep,
  reduceAddress,
  type AddressField,
  type CepAction,
  type LookupRequest,
} from "@/lib/cep-address";
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
  phone: "",
  email: "",
  responsible: "",
};

export type SchoolBrandFocus = "cnpj" | "city" | "phone" | "responsible";

const FOCUS_TESTID: Record<SchoolBrandFocus, string> = {
  cnpj: "input-school-cnpj",
  city: "input-school-city",
  phone: "input-school-phone",
  responsible: "input-school-responsible",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Escola a editar. A escola nasce na aprovação do cadastro (M1); aqui não se cria. */
  brand: SchoolBrand | null;
  /** Campo que a pendência da ficha quer em foco. */
  focusField?: SchoolBrandFocus | null;
  /** Chamado com a escola atualizada após salvar com sucesso. */
  onSaved?: (brand: SchoolBrand) => void;
}

export function SchoolBrandFormDialog({
  open,
  onOpenChange,
  brand,
  focusField,
  onSaved,
}: Props) {
  const update = useUpdateSchoolBrand();
  const addressRef = useRef(emptyAddress());
  const [address, setAddress] = useState(addressRef.current);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  });

  function applyAddress(action: CepAction): LookupRequest | null {
    const next = reduceAddress(addressRef.current, action);
    addressRef.current = next.state;
    setAddress(next.state);
    return next.lookup;
  }

  async function runLookup(lookup: LookupRequest) {
    const result = await fetchViaCep(lookup.cep);
    applyAddress({
      type: "lookup-finished",
      lookupId: lookup.lookupId,
      cep: lookup.cep,
      result,
    });
  }

  function changeAddress(field: AddressField, value: string) {
    const lookup = applyAddress({ type: "edit", field, value });
    if (lookup) void runLookup(lookup);
  }

  useEffect(() => {
    if (!open) return;
    const loaded = addressFromSaved(brand?.address);
    addressRef.current = loaded;
    setAddress(loaded);
    if (brand) {
      form.reset({
        name: brand.name,
        cnpj: brand.cnpj ? maskCnpj(brand.cnpj) : "",
        phone: brand.contact?.phone ? storedToMasked(brand.contact.phone) : "",
        email: brand.contact?.email ?? "",
        responsible: brand.contact?.responsible ?? "",
      });
    } else {
      form.reset(EMPTY_VALUES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand]);

  useEffect(() => {
    if (!open || !focusField) return;
    const testId = FOCUS_TESTID[focusField];
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open, focusField]);

  const saving = update.isPending;

  async function onSubmit(values: FormValues) {
    if (!brand) return;
    const trimmed = (v?: string) => v?.trim() || undefined;
    const current = addressRef.current;
    // Logo e cores ficam como estão no banco. Este formulário não os grava.
    const payload: Omit<SchoolBrand, "id" | "createdAt" | "updatedAt" | "logo" | "colors"> = {
      name: values.name.trim(),
      cnpj: onlyDigits(values.cnpj) || undefined,
      address: {
        zip: current.zip || undefined,
        street: trimmed(current.street),
        number: trimmed(current.number),
        complement: trimmed(current.complement),
        district: trimmed(current.district),
        city: trimmed(current.city),
        state: trimmed(current.state)?.toUpperCase(),
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
            Nome, identificação, endereço e contato da escola.
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
                      autoComplete="organization"
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
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="school-zip" className="text-sm font-medium">
                  CEP
                </label>
                <Input
                  id="school-zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  data-testid="input-school-zip"
                  aria-describedby="school-zip-status"
                  value={maskZip(address.zip)}
                  onChange={(e) => changeAddress("zip", e.target.value)}
                />
                <p
                  id="school-zip-status"
                  role="status"
                  aria-live="polite"
                  className="mt-1 min-h-4 text-xs text-muted-foreground"
                  data-testid="text-school-zip-status"
                >
                  {address.message}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-3">
                <label htmlFor="school-street" className="text-sm font-medium">
                  Logradouro
                </label>
                <Input
                  id="school-street"
                  autoComplete="address-line1"
                  placeholder="Rua, avenida…"
                  data-testid="input-school-street"
                  value={address.street}
                  onChange={(e) => changeAddress("street", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="school-number" className="text-sm font-medium">
                  Número
                </label>
                <Input
                  id="school-number"
                  data-testid="input-school-number"
                  value={address.number}
                  onChange={(e) => changeAddress("number", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <label htmlFor="school-complement" className="text-sm font-medium">
                  Complemento
                </label>
                <Input
                  id="school-complement"
                  autoComplete="address-line2"
                  placeholder="Bloco, sala…"
                  data-testid="input-school-complement"
                  value={address.complement}
                  onChange={(e) => changeAddress("complement", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <label htmlFor="school-district" className="text-sm font-medium">
                  Bairro
                </label>
                <Input
                  id="school-district"
                  data-testid="input-school-district"
                  value={address.district}
                  onChange={(e) => changeAddress("district", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-4">
                <label htmlFor="school-city" className="text-sm font-medium">
                  Cidade
                </label>
                <Input
                  id="school-city"
                  autoComplete="address-level2"
                  data-testid="input-school-city"
                  value={address.city}
                  onChange={(e) => changeAddress("city", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="school-state" className="text-sm font-medium">
                  UF
                </label>
                <Input
                  id="school-state"
                  autoComplete="address-level1"
                  maxLength={2}
                  placeholder="SP"
                  data-testid="input-school-state"
                  value={address.state}
                  onChange={(e) =>
                    changeAddress("state", e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())
                  }
                />
              </div>
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
                        inputMode="tel"
                        autoComplete="tel"
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
                        autoComplete="email"
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
