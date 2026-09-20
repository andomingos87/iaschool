#!/usr/bin/env bash
# on-change.sh — gatilho do hook PostToolUse (ver .claude/settings.json).
#
# Recebe no stdin o JSON da ferramenta que acabou de rodar. Se o arquivo tocado
# foi a fonte do deck, roda o build e regenera HTML mobile + os dois PDFs.
# Se foi um arquivo GERADO, avisa que a edição vai ser perdida.
#
# Sempre sai com 0: o build do deck nunca deve travar o trabalho do agente.
set -uo pipefail

payload=$(cat)
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Edição em arquivo gerado — avisa e não faz nada.
case "$payload" in
  *apresentacao-iaschool-mobile.html*)
    echo "AVISO: docs/apresentacao-iaschool-mobile.html é gerado por scripts/deck/build.mjs." >&2
    echo "Edite docs/apresentacao-iaschool.html (conteúdo) ou scripts/deck/mobile.css (layout 9:16)." >&2
    exit 0
    ;;
esac

# Só reage à fonte do deck.
case "$payload" in
  *docs/apresentacao-iaschool.html*) ;;
  *) exit 0 ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "AVISO: node não encontrado — deck não foi reconstruído." >&2
  exit 0
fi

out=$(node "$root/scripts/deck/build.mjs" 2>&1)
status=$?
if [ $status -eq 0 ]; then
  echo "Deck reconstruído (HTML mobile + PDF desktop + PDF mobile)." >&2
else
  echo "AVISO: build do deck falhou — os PDFs estão desatualizados." >&2
  echo "$out" >&2
  echo "Rode manualmente: node scripts/deck/build.mjs" >&2
fi
exit 0
