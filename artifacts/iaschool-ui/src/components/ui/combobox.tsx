import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "../../lib/utils"
import {
  comboboxMatches,
  comboboxShowsSearch,
} from "../../lib/combobox-filter"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface ComboboxOption {
  value: string
  label: string
  /** Continua visível mesmo quando a busca não encontra o texto. */
  pinned?: boolean
  disabled?: boolean
}

export interface ComboboxProps {
  value?: string
  onValueChange: (value: string) => void
  options: readonly ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  id?: string
  "data-testid"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  function Combobox(
    {
      value,
      onValueChange,
      options,
      placeholder = "Selecione",
      searchPlaceholder = "Buscar",
      emptyText = "Nenhum resultado",
      disabled,
      className,
      id,
      "data-testid": testId,
      "aria-invalid": ariaInvalid,
      "aria-describedby": ariaDescribedBy,
    },
    ref,
  ) {
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const [active, setActive] = React.useState(0)
    const listId = React.useId()
    const showSearch = comboboxShowsSearch(options.length)
    const selected = options.find((option) => option.value === value)
    const visible = options.filter((option) =>
      comboboxMatches(option.label, query, !!option.pinned),
    )
    const activeIndex = Math.min(active, Math.max(visible.length - 1, 0))

    function choose(option: ComboboxOption) {
      if (option.disabled) return
      onValueChange(option.value)
      setOpen(false)
      setQuery("")
    }

    function onListKeyDown(event: React.KeyboardEvent) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActive((index) => Math.min(index + 1, visible.length - 1))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActive((index) => Math.max(index - 1, 0))
      } else if (event.key === "Home") {
        event.preventDefault()
        setActive(0)
      } else if (event.key === "End") {
        event.preventDefault()
        setActive(Math.max(visible.length - 1, 0))
      } else if (event.key === "Enter") {
        event.preventDefault()
        const option = visible[activeIndex]
        if (option) choose(option)
      }
    }

    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery("")
          else setActive(0)
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={ref}
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            disabled={disabled}
            data-testid={testId}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                setOpen(true)
              }
            }}
            className={cn(
              "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <span className="line-clamp-1 text-left">
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
          onKeyDown={onListKeyDown}
        >
          {showSearch && (
            <div className="border-b px-3">
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                placeholder={searchPlaceholder}
                className="flex h-10 w-full bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground"
                data-testid={testId ? `${testId}-search` : undefined}
              />
            </div>
          )}
          <div
            id={listId}
            role="listbox"
            className="max-h-[300px] overflow-y-auto p-1"
          >
            {visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : (
              visible.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50",
                    index === activeIndex && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
