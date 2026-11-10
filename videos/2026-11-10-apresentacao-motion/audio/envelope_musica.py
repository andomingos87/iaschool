"""Escreve no index.html a curva de volume da música (data-automation do #music).

Lê os tempos das falas nos <audio id="voN"> do index.html: a música fica a 0 dB sem voz e
abaixa DUCK_DB sob a voz, com rampa de 0,3 s antes e 0,45 s depois de cada fala.
Uso (dentro de audio/): python3 -I envelope_musica.py
"""
import json
import re

HTML = "../motion/index.html"
DUCK_DB = -9.0
ANTES, DEPOIS, PASSO = 0.3, 0.45, 0.05

s = open(HTML, encoding="utf-8").read()
voz = [(float(a), float(a) + float(d)) for a, d in
       re.findall(r'<audio id="vo\d+"[^>]*data-start="([0-9.]+)" data-duration="([0-9.]+)"', s)]
m = re.search(r'<audio id="music"[^>]*data-start="([0-9.]+)" data-duration="([0-9.]+)"', s)
ini, dur = float(m.group(1)), float(m.group(2))


def ganho(t):
    v = 0.0
    for a, b in voz:
        if a <= t <= b:
            e = DUCK_DB
        elif a - ANTES < t < a:
            e = DUCK_DB * (t - (a - ANTES)) / ANTES
        elif b < t < b + DEPOIS:
            e = DUCK_DB * (1 - (t - b) / DEPOIS)
        else:
            e = 0.0
        v = min(v, e)
    return v


ts = [round(i * PASSO, 2) for i in range(int(dur / PASSO) + 1)]
pts = [(t, ganho(ini + t)) for t in ts]
res = [pts[0]]
for i in range(1, len(pts) - 1):
    (t0, v0), (t1, v1), (t2, v2) = res[-1], pts[i], pts[i + 1]
    if abs(v0 + (v2 - v0) * (t1 - t0) / (t2 - t0) - v1) > 0.05:
        res.append(pts[i])
res.append(pts[-1])
lane = {"version": 1, "lanes": [{"target": "volume",
        "points": [{"t": t, "v": round(10 ** (db / 20), 4)} for t, db in res]}]}
attr = json.dumps(lane, separators=(",", ":")).replace('"', "&quot;")
s2, n = re.subn(r'(<audio id="music"[^>]*?)data-automation="[^"]*"', r'\1data-automation="' + attr.replace("\\", "\\\\") + '"', s)
assert n == 1, "faltou data-automation no #music"
open(HTML, "w", encoding="utf-8").write(s2)
print(len(voz), "falas;", len(res), "pontos na curva")
