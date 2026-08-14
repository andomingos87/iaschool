// Editor do template do prompt com destaque visual dos trechos problemáticos.
// Renderiza um <div> "espelho" atrás do <textarea>: o texto do espelho é
// transparente, mas os trechos com aviso ganham fundo/realce que aparece
// através do textarea (que fica com fundo transparente por cima).

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { cn } from "@workspace/iasport/lib/utils";
import type { TemplateWarning } from "@/lib/prompt-template";

export interface TemplateEditorHandle {
  /** Leva o cursor (e a rolagem) até o intervalo indicado. */
  jumpTo: (start: number, end: number) => void;
}

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  warnings: TemplateWarning[];
  placeholder?: string;
  rows?: number;
  "data-testid"?: string;
}

// Classes compartilhadas entre o textarea e o espelho — precisam ter
// exatamente a mesma métrica de texto para o realce alinhar.
const SHARED_TEXT_CLASSES =
  "px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words";

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(
  function TemplateEditor(
    { value, onChange, warnings, placeholder, rows = 14, ...rest },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);

    // Junta e ordena os intervalos a destacar (sem sobreposição).
    const ranges = useMemo(() => {
      const all = warnings
        .flatMap((w) => w.occurrences)
        .filter((r) => r.start < r.end && r.end <= value.length)
        .sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const r of all) {
        const last = merged[merged.length - 1];
        if (last && r.start <= last.end) {
          last.end = Math.max(last.end, r.end);
        } else {
          merged.push({ ...r });
        }
      }
      return merged;
    }, [warnings, value]);

    // Segmentos do espelho: texto transparente + <mark>s nos intervalos.
    const segments = useMemo(() => {
      const out: Array<{ text: string; marked: boolean; key: number }> = [];
      let pos = 0;
      let key = 0;
      for (const r of ranges) {
        if (r.start > pos) out.push({ text: value.slice(pos, r.start), marked: false, key: key++ });
        out.push({ text: value.slice(r.start, r.end), marked: true, key: key++ });
        pos = r.end;
      }
      if (pos < value.length) out.push({ text: value.slice(pos), marked: false, key: key++ });
      return out;
    }, [ranges, value]);

    function syncScroll() {
      const ta = textareaRef.current;
      const mirror = mirrorRef.current;
      if (ta && mirror) {
        mirror.scrollTop = ta.scrollTop;
        mirror.scrollLeft = ta.scrollLeft;
      }
    }

    useImperativeHandle(ref, () => ({
      jumpTo(start: number, end: number) {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(start, end);
        // Rola até a linha do trecho (aproximação por número de linha).
        const lineHeight =
          parseFloat(getComputedStyle(ta).lineHeight) || 18;
        const line = ta.value.slice(0, start).split("\n").length - 1;
        ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 2);
        syncScroll();
      },
    }));

    return (
      <div className="relative">
        {/* Espelho com os realces, atrás do textarea. */}
        <div
          ref={mirrorRef}
          aria-hidden
          className={cn(
            SHARED_TEXT_CLASSES,
            "pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent text-transparent",
          )}
        >
          {segments.map((s) =>
            s.marked ? (
              <mark
                key={s.key}
                className="rounded-sm bg-yellow-500/25 text-transparent underline decoration-yellow-500 decoration-wavy underline-offset-2"
              >
                {s.text}
              </mark>
            ) : (
              <span key={s.key}>{s.text}</span>
            ),
          )}
          {/* Garante altura da última linha vazia. */}
          {"\n"}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          rows={rows}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            SHARED_TEXT_CLASSES,
            "relative flex w-full resize-y rounded-md border border-input bg-transparent shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...rest}
        />
      </div>
    );
  },
);
