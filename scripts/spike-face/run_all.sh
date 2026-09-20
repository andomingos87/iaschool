#!/usr/bin/env bash
# Roda o spike inteiro. Requer o LFW já extraído em $DATA/lfw.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA="${SPIKE_DATA:-$HERE/data}"
OUT="${SPIKE_OUT:-$HERE/results}"
PY="${SPIKE_PYTHON:-python3}"

mkdir -p "$OUT"
"$PY" "$HERE/src/bench_speed.py" --lfw "$DATA/lfw" --out "$OUT/speed.json"
# Uma varredura por det_size: é a comparação que decide o parâmetro (§5.1 do
# relatório), não um número solto.
for ds in 640 1024 1600; do
  "$PY" "$HERE/src/bench_scale.py" --lfw "$DATA/lfw" --out "$OUT/scale_$ds.json" --det-size "$ds"
done
"$PY" "$HERE/src/bench_throughput.py" --lfw "$DATA/lfw" --out "$OUT/throughput.json"
"$PY" "$HERE/src/bench_accuracy.py" --lfw "$DATA/lfw" --out "$OUT/accuracy.json"
"$PY" "$HERE/src/report.py"         --results "$OUT"
