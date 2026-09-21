import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "./throttle";

describe("throttle leading + trailing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("25 chamadas em 1 s viram 1 imediata + 1 no fim da janela", () => {
    let runs = 0;
    const t = createThrottle(() => runs++, 3_000);
    for (let i = 0; i < 25; i++) {
      t();
      vi.advanceTimersByTime(40);
    }
    expect(runs).toBe(1);
    vi.advanceTimersByTime(3_000);
    expect(runs).toBe(2);
  });

  it("depois de uma janela quieta, a próxima chamada passa na hora", () => {
    let runs = 0;
    const t = createThrottle(() => runs++, 1_000);
    t();
    vi.advanceTimersByTime(1_500);
    t();
    expect(runs).toBe(2);
  });

  it("flush dispara o pendente agora; cancel descarta", () => {
    let runs = 0;
    const t = createThrottle(() => runs++, 1_000);
    t();
    t();
    expect(runs).toBe(1);
    t.flush();
    expect(runs).toBe(2);
    vi.advanceTimersByTime(2_000);
    expect(runs).toBe(2);

    t();
    t();
    t.cancel();
    vi.advanceTimersByTime(2_000);
    expect(runs).toBe(3);
  });
});
