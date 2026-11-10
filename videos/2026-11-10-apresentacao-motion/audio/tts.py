"""Gera narração com o TTS da OpenAI (gpt-4o-mini-tts).

Lê OPENAI_API_KEY do .env.local na raiz do repositório, sem imprimir.
Uso: python3 -I tts.py --voice marin --out saida.wav --text "frase"
"""
import argparse
import json
import os
import sys
import urllib.request

ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".env.local")
INSTRUCOES = (
    "Português do Brasil, sotaque neutro. Tom acolhedor e seguro, de alguém que trabalha "
    "em escola explicando para um colega. Ritmo calmo, frases claras, pausas curtas entre "
    "as frases. Sem tom de locutor de comercial, sem exagero, sem sorriso forçado."
)


def chave():
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    with open(ENV, encoding="utf-8") as f:
        for linha in f:
            if linha.startswith("OPENAI_API_KEY="):
                return linha.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("OPENAI_API_KEY não encontrada")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--voice", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--instructions", default=INSTRUCOES)
    a = p.parse_args()
    corpo = json.dumps(
        {
            "model": "gpt-4o-mini-tts",
            "voice": a.voice,
            "input": a.text,
            "instructions": a.instructions,
            "response_format": "wav",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=corpo,
        headers={"Authorization": "Bearer " + chave(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            dados = r.read()
    except urllib.error.HTTPError as e:
        sys.exit("erro %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))
    with open(a.out, "wb") as f:
        f.write(dados)
    print("ok", a.out, len(dados))


if __name__ == "__main__":
    main()
