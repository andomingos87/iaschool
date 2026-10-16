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
  selectionGroups,
  selectionLimitMessage,
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
  const selectedIds = new Set(selected);
  const groups = classes.map((c) => classSelection(c, students, eligible));
  const chosen = selectionGroups(selection, classes, students, eligible);
  const limit = selectionLimitMessage(selected.length);
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
      <div className="space-y-2" aria-label="Turmas">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma turma nesta escola. Dá para buscar alunos pelo nome.
          </p>
        ) : (
          groups.map((group) => {
            const picked = group.eligibleIds.filter((id) =>
              selectedIds.has(id),
            ).length;
            const outside = group.total - group.eligibleIds.length;
            const pressed = selection.classIds.includes(group.id);
            return (
              <button
                key={group.id}
                type="button"
                aria-pressed={pressed}
                disabled={disabled || group.eligibleIds.length === 0}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left focus-visible:ring-2 focus-visible:ring-ring ${pressed ? "border-primary bg-accent" : "bg-background"}`}
                onClick={() =>
                  onChange(toggleGenerationClass(selection, group.id, eligible))
                }
              >
                <span className="font-medium">{group.label}</span>
                <span className="text-sm text-muted-foreground">
                  {picked} de {group.total}
                  {outside > 0
                    ? ` · ${outside} fora, sem foto ou sem autorização.`
                    : ""}
                </span>
              </button>
            );
          })
        )}
      </div>
      {chosen.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum aluno ainda. Escolha uma turma ou busque pelo nome.
        </p>
      ) : (
        <div className="space-y-4" aria-label="Alunos selecionados">
          {chosen.map((group) => (
            <section key={group.classId ?? "sem-turma"} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {group.label}
                <span className="ml-2 font-normal text-muted-foreground">
                  {group.selectedCount} de {group.totalCount}
                </span>
              </h3>
              {group.ineligibleCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {group.ineligibleCount} fora, sem foto ou sem autorização.
                </p>
              )}
              <ul className="divide-y rounded-lg border">
                {group.students.map((student) => (
                  <li
                    key={student.id}
                    className="flex min-h-11 items-center justify-between gap-2 px-3"
                  >
                    <span className="break-words">{student.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      className="size-11 shrink-0"
                      aria-label={`Remover ${student.name} da seleção`}
                      onClick={() => toggle(student.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {limit && (
        <p className="text-sm text-destructive" role="status">
          {limit}
        </p>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {selected.length}{" "}
        {selected.length === 1 ? "aluno selecionado" : "alunos selecionados"}.
      </p>
    </div>
  );
}
