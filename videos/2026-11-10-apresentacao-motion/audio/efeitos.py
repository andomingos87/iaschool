"""Sintetiza os efeitos sonoros e monta a faixa motion/assets/efeitos/efeitos.wav.

Os sons são gerados aqui (senoides e ruído), sem arquivo de terceiro nem licença.
Os tempos vêm de efeitos_tempos.json, copiado de window.__sfx (scene.js) no preview do
HyperFrames: se a linha do tempo mudar, copie a lista de novo e rode este script.
Uso (dentro de audio/): python3 -I efeitos.py
"""
import array
import json
import math
import random
import wave

SR = 48000
DUR = 34.0
SAIDA = "../motion/assets/efeitos/efeitos.wav"
PICO = 10 ** (-6 / 20)  # o evento mais alto fica em −6 dBFS; o nível no vídeo vem do data-volume


def env(t, tau, ataque=0.0015):
    a = min(1.0, t / ataque) if ataque > 0 else 1.0
    return a * math.exp(-t / tau)


def clique():
    """Clique de mouse: estalo curto e o soltar do botão 45 ms depois."""
    rnd = random.Random(1)
    n = int(SR * 0.08)
    out = [0.0] * n
    for k, (t0, g) in enumerate(((0.0, 1.0), (0.045, 0.45))):
        prev = 0.0
        for i in range(int(SR * 0.03)):
            t = i / SR
            ruido = rnd.uniform(-1, 1)
            hp = ruido - prev  # passa-alta simples: tira o grave do ruído
            prev = ruido
            v = 0.55 * hp * env(t, 0.0025, 0.0003)
            v += 0.28 * math.sin(2 * math.pi * 2800 * t) * env(t, 0.006, 0.0005)
            v += 0.16 * math.sin(2 * math.pi * 1250 * t) * env(t, 0.01, 0.0008)
            j = int(t0 * SR) + i
            if j < n:
                out[j] += g * v
    return out


def toque():
    """Toque na tela do celular: "toc" grave e macio."""
    rnd = random.Random(2)
    n = int(SR * 0.09)
    out, fase = [], 0.0
    for i in range(n):
        t = i / SR
        f = 480 + 160 * math.exp(-t / 0.012)
        fase += 2 * math.pi * f / SR
        v = 0.6 * math.sin(fase) * env(t, 0.018, 0.001)
        v += 0.12 * rnd.uniform(-1, 1) * env(t, 0.002, 0.0002)
        out.append(v)
    return out


def tic():
    """Troca de selo: "tic" agudo e curto."""
    n = int(SR * 0.2)
    return [
        0.45 * math.sin(2 * math.pi * 1760 * t) * env(t, 0.045, 0.002)
        + 0.18 * math.sin(2 * math.pi * 3520 * t) * env(t, 0.02, 0.001)
        for t in (i / SR for i in range(n))
    ]


def nota(f, t, tau):
    return (math.sin(2 * math.pi * f * t) + 0.25 * math.sin(2 * math.pi * 2 * f * t)
            + 0.08 * math.sin(2 * math.pi * 2.76 * f * t)) * env(t, tau, 0.003)


def mensagem():
    """Mensagem chegando: duas notas subindo (dó e sol), timbre de marimba. Genérico."""
    n = int(SR * 0.8)
    out = [0.0] * n
    for t0, f in ((0.0, 1046.5), (0.085, 1568.0)):
        for i in range(n - int(t0 * SR)):
            out[int(t0 * SR) + i] += 0.36 * nota(f, i / SR, 0.18)
    return out


def faisca():
    """Pouso da Faísca: batidinha, um "ding" e um brilho de parciais agudas."""
    rnd = random.Random(3)
    n = int(SR * 1.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        out[i] += 0.22 * math.sin(2 * math.pi * 300 * t) * env(t, 0.03, 0.001)
        out[i] += 0.3 * math.sin(2 * math.pi * 2093 * t) * env(t, 0.35, 0.002)
    for f in (2637, 3136, 3951, 4699, 5274, 6272):
        t0 = rnd.uniform(0, 0.09)
        tau = rnd.uniform(0.25, 0.4)
        for i in range(n - int(t0 * SR)):
            t = i / SR
            out[int(t0 * SR) + i] += 0.1 * math.sin(2 * math.pi * f * t) * env(t, tau, 0.004)
    return out


SONS = {"clique": (clique, 0.85), "toque": (toque, 0.75), "tic": (tic, 0.95),
        "mensagem": (mensagem, 0.7), "faisca": (faisca, 0.8)}


def main():
    eventos = json.load(open("efeitos_tempos.json", encoding="utf-8"))
    cache = {k: f() for k, (f, _) in SONS.items()}
    buf = array.array("d", bytes(8 * int(SR * DUR)))
    for k, t in eventos:
        som, g = cache[k], SONS[k][1]
        i0 = int(round(t * SR))
        for i, v in enumerate(som):
            if i0 + i < len(buf):
                buf[i0 + i] += g * v
    pico = max(abs(v) for v in buf)
    escala = PICO / pico
    pcm = array.array("h", (int(max(-1.0, min(1.0, v * escala)) * 32767) for v in buf))
    import os
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with wave.open(SAIDA, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(len(eventos), "eventos;", ", ".join(f"{k} {sum(1 for e in eventos if e[0] == k)}" for k in SONS), f"; escala {escala:.3f}")


if __name__ == "__main__":
    main()
