import { Plus, X } from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import { Input } from "@workspace/iasport/components/ui/input";
import { Label } from "@workspace/iasport/components/ui/label";
import { cn } from "@workspace/iasport/lib/utils";

interface Props {
  /** até 3 cores hex */
  value: string[];
  onChange: (colors: string[]) => void;
  max?: number;
}

function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{6})$/.test(hex);
}

/** Seletor de até 3 cores da marca do clube (hex + preview RGB). */
export function ColorPicker({ value, onChange, max = 3 }: Props) {
  function updateAt(i: number, hex: string) {
    const next = [...value];
    next[i] = hex;
    onChange(next);
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    if (value.length >= max) return;
    onChange([...value, "#39ff14"]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {value.map((color, i) => {
          const valid = isValidHex(color);
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
              data-testid={`color-slot-${i}`}
            >
              <label className="relative cursor-pointer">
                <span
                  className={cn(
                    "block size-9 rounded-md border border-border",
                    !valid && "opacity-40",
                  )}
                  style={{ backgroundColor: valid ? color : "transparent" }}
                />
                <input
                  type="color"
                  value={valid ? color : "#39ff14"}
                  onChange={(e) => updateAt(i, e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  data-testid={`input-color-native-${i}`}
                />
              </label>
              <Input
                value={color}
                onChange={(e) => {
                  let v = e.target.value;
                  if (!v.startsWith("#")) v = "#" + v.replace(/#/g, "");
                  updateAt(i, v.slice(0, 7));
                }}
                className="h-9 w-24 font-mono text-xs uppercase"
                placeholder="#39FF14"
                data-testid={`input-color-hex-${i}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeAt(i)}
                data-testid={`button-remove-color-${i}`}
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
      {value.length < max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          data-testid="button-add-color"
        >
          <Plus className="size-4" /> Adicionar cor
        </Button>
      )}
      {value.length === 0 && (
        <Label className="text-xs text-muted-foreground">
          Nenhuma cor definida (máx. {max}).
        </Label>
      )}
    </div>
  );
}
