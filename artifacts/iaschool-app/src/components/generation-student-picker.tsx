import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/iaschool-ui/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/iaschool-ui/components/ui/command";
import type { Student, SchoolClass } from "@/lib/data";
import {
  generationSearchMatch,
  classSelection,
  expandGenerationSelection,
  toggleGenerationStudent,
  toggleGenerationClass,
  type GenerationSelection,
} from "@/lib/generation-batches";
export function GenerationStudentPicker({
  students,
  eligible,
  classes,
  selection,
  onChange,
  disabled = false,
}: {
  students: Student[];
  eligible: Student[];
  classes: SchoolClass[];
  selection: GenerationSelection;
  onChange: (selection: GenerationSelection) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = expandGenerationSelection(selection, eligible);
  const groups = classes.map((c) => classSelection(c, students, eligible));
  function toggle(id: string) {
    onChange(toggleGenerationStudent(selection, id, eligible));
  }
  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="min-h-11 w-full justify-between"
          >
            Buscar alunos ou turmas
            <ChevronsUpDown className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command
            filter={(_value, search, keywords) =>
              generationSearchMatch(keywords?.[0] ?? "", search) ? 1 : 0
            }
          >
            <CommandInput
              placeholder="Digite o nome do aluno ou da turma…"
              aria-label="Buscar alunos ou turmas"
            />
            <CommandList>
              <CommandEmpty>
                Nenhum aluno ou turma apta encontrado.
              </CommandEmpty>
              <CommandGroup heading="Alunos">
                {eligible.map((student) => (
                  <CommandItem
                    key={student.id}
                    value={student.id}
                    keywords={[student.name]}
                    onSelect={() => toggle(student.id)}
                  >
                    <Check
                      className={`size-4 ${selected.includes(student.id) ? "opacity-100" : "opacity-0"}`}
                    />
                    {student.name}
                    {selected.includes(student.id) && (
                      <span className="sr-only">Selecionado</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Turmas">
                {groups.map((group) => (
                  <CommandItem
                    key={group.id}
                    value={group.id}
                    keywords={[group.label]}
                    disabled={!group.eligibleIds.length}
                    onSelect={() => {
                      onChange(
                        toggleGenerationClass(selection, group.id, eligible),
                      );
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`size-4 ${selection.classIds.includes(group.id) ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="flex-1">{group.label}</span>
                    {selection.classIds.includes(group.id) && (
                      <span className="sr-only">Selecionada</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {group.eligibleIds.length} de {group.total} aptos
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selection.classIds.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Turmas selecionadas">
          {groups
            .filter((g) => selection.classIds.includes(g.id))
            .map((group) => (
              <span
                key={group.id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent px-3 py-1 text-sm"
              >
                {group.label} · {group.eligibleIds.length} aptos
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="size-7 rounded-full"
                  aria-label={`Remover turma ${group.label}`}
                  onClick={() =>
                    onChange(
                      toggleGenerationClass(selection, group.id, eligible),
                    )
                  }
                >
                  <X className="size-3" />
                </Button>
              </span>
            ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Alunos selecionados">
          {selected.map((id) => {
            const student = eligible.find((s) => s.id === id);
            return student ? (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
              >
                <span className="break-words">{student.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="size-7 shrink-0 rounded-full"
                  aria-label={`Remover ${student.name}`}
                  onClick={() => toggle(id)}
                >
                  <X className="size-3" />
                </Button>
              </span>
            ) : null;
          })}
        </div>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {selected.length}{" "}
        {selected.length === 1 ? "aluno selecionado" : "alunos selecionados"}.
        Só aparecem alunos com foto e autorização ativa.
      </p>
    </div>
  );
}
