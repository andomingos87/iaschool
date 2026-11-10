"""Prepara as falas da narração para a composição.

Corta o silêncio das pontas, encurta pausas internas longas (sempre cortando dentro
do silêncio), comprime de leve, aplica um ganho único a todas as falas com limitador
e grava WAV 48 kHz mono em motion/assets/narracao/.

Uso (dentro de audio/): python3 -I prepara_narracao.py cedar
"""
import json
import os
import re
import subprocess
import sys

VOZ = sys.argv[1] if len(sys.argv) > 1 else "cedar"
FALAS = ["c1", "c2", "c4", "c5", "c6", "c7", "c8"]
PAUSA_MAX = {"c1": 0.25, "c2": 0.30}  # demais: 0.35 s
ALVO_LUFS = -17.0  # mono; vira cerca de −14 LUFS no MP4 estéreo
LIMITE_DB = -2.0  # alimiter não mede true peak; folga de 0,5 dB sobre −1,5 dBTP
COMP = "acompressor=threshold=-22dB:ratio=3:attack=5:release=120:knee=4"
SAIDA = "../motion/assets/narracao"


def silencios(arq):
    log = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", arq, "-af", "silencedetect=n=-45dB:d=0.1", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    ini = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", log)]
    fim = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", log)]
    return list(zip(ini, fim))


def duracao(arq):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq],
        capture_output=True, text=True,
    ).stdout)


def trechos(arq, pausa_max):
    """Trechos [ini, fim] a manter."""
    total = duracao(arq)
    sil = silencios(arq)
    ini_fala = 0.0
    if sil and sil[0][0] < 0.01:
        ini_fala = sil[0][1]
        sil = sil[1:]
    fim_fala = total
    if sil and sil[-1][1] >= total - 0.01:
        fim_fala = sil[-1][0]
        sil = sil[:-1]
    partes, cur = [], max(0.0, ini_fala - 0.03)
    for a, b in sil:
        if b - a > pausa_max:
            meio = pausa_max / 2
            partes.append((cur, a + meio))
            cur = b - meio
    partes.append((cur, min(total, fim_fala + 0.12)))
    return partes


def loudness(arq):
    log = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", arq, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    j = json.loads(log[log.rindex("{"):log.rindex("}") + 1])
    return float(j["input_i"]), float(j["input_tp"])


def main():
    os.makedirs(SAIDA, exist_ok=True)
    tmp = []
    for c in FALAS:
        src = f"falas/{VOZ}/{c}.wav"
        partes = trechos(src, PAUSA_MAX.get(c, 0.35))
        fc = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[p{i}];" for i, (a, b) in enumerate(partes))
        fc += "".join(f"[p{i}]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=0:a=1,{COMP}[o]"
        out = f"{SAIDA}/{c}.tmp.wav"
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
                        "-filter_complex", fc, "-map", "[o]", "-ar", "48000", "-ac", "1", out], check=True)
        tmp.append((c, out))
    # ganho único, medido sobre todas as falas juntas
    lista = f"{SAIDA}/lista.txt"
    with open(lista, "w") as f:
        for _, out in tmp:
            f.write(f"file '{os.path.basename(out)}'\n")
    junto = f"{SAIDA}/junto.tmp.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                    "-i", lista, "-c", "copy", junto], check=True)
    i, tp = loudness(junto)
    ganho = ALVO_LUFS - i
    lim = 10 ** (LIMITE_DB / 20)
    for c, out in tmp:
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", out,
                        "-af", f"volume={ganho:.2f}dB,alimiter=limit={lim:.3f}:attack=1:release=60:level=false", "-c:a", "pcm_s16le", f"{SAIDA}/{c}.wav"], check=True)
        os.remove(out)
        print(c, f"{duracao(f'{SAIDA}/{c}.wav'):.2f}s")
    with open(lista, "w") as f:
        for c in FALAS:
            f.write(f"file '{c}.wav'\n")
    subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                    "-i", lista, "-c", "copy", junto], check=True)
    i2, tp2 = loudness(junto)
    os.remove(lista)
    os.remove(junto)
    print(f"antes {i:.1f} LUFS / {tp:.1f} dBTP; ganho {ganho:+.1f} dB; depois {i2:.1f} LUFS / {tp2:.1f} dBTP")


if __name__ == "__main__":
    main()
