import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "../../lib/utils"
import { Input } from "./input"

export type PasswordInputProps = Omit<
  React.ComponentProps<"input">,
  "type"
> & {
  "data-testid"?: string
  /** Classe do wrapper que posiciona o botão de revelar. */
  containerClassName?: string
  /** Rótulo acessível do botão quando a senha está oculta. */
  showLabel?: string
  /** Rótulo acessível do botão quando a senha está visível. */
  hideLabel?: string
}

/**
 * Campo de senha com botão de revelar (olho).
 *
 * Compatível com `<FormControl>`: os props que o Slot injeta (`id`,
 * `aria-describedby`, `aria-invalid`) e o `ref` do react-hook-form são
 * repassados ao `<input>` interno, não ao wrapper — o `<FormLabel>` continua
 * apontando para o campo certo.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      containerClassName,
      showLabel = "Mostrar senha",
      hideLabel = "Ocultar senha",
      disabled,
      "data-testid": testId,
      ...props
    },
    ref,
  ) => {
    const [revealed, setRevealed] = React.useState(false)
    const Icon = revealed ? EyeOff : Eye

    return (
      <div className={cn("relative", containerClassName)}>
        <Input
          type={revealed ? "text" : "password"}
          // O Edge/IE desenham o próprio botão de revelar; escondemos para não
          // duplicar com o nosso.
          className={cn("pr-9 [&::-ms-reveal]:hidden", className)}
          disabled={disabled}
          data-testid={testId}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          onClick={() => setRevealed((value) => !value)}
          disabled={disabled}
          aria-label={revealed ? hideLabel : showLabel}
          aria-pressed={revealed}
          data-testid={testId ? `${testId}-toggle` : undefined}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
