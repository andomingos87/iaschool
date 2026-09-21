// Throttle leading + trailing: a primeira chamada passa na hora, as seguintes
// dentro da janela são agrupadas em uma só no fim dela. Usado para não refazer
// a listagem de 2.000 fotos a cada UPDATE de `batch_jobs` (o worker emite
// dezenas por segundo).

export interface Throttled {
  (): void;
  /** Dispara agora o que estiver pendente e zera a janela. */
  flush(): void;
  cancel(): void;
}

export function createThrottle(fn: () => void, ms: number): Throttled {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  function run(): void {
    last = Date.now();
    pending = false;
    fn();
  }

  const throttled = (() => {
    const elapsed = Date.now() - last;
    if (elapsed >= ms && !timer) {
      run();
      return;
    }
    pending = true;
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        if (pending) run();
      }, Math.max(0, ms - elapsed));
    }
  }) as Throttled;

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) run();
  };
  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = false;
  };
  return throttled;
}
