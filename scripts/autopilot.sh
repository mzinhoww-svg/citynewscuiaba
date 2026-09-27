#!/usr/bin/env bash
# Roda o Claude Code em modo não interativo até todas as tarefas de .planning/progress.json fecharem.
# Uso: ./scripts/autopilot.sh   (depois do kickoff respondido)
# Confira as flags na sua versão do Claude Code com `claude --help`.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
MAX_ROUNDS="${MAX_ROUNDS:-400}"
round=0
while node scripts/next-task.mjs --has-open; do
  round=$((round + 1))
  if [ "$round" -gt "$MAX_ROUNDS" ]; then echo "Limite de rodadas atingido"; exit 2; fi
  stamp="$(date +%Y%m%d-%H%M%S)"
  echo "[$stamp] rodada $round · $(node scripts/next-task.mjs | tail -1)"
  claude -p "/citynews-resume" \
    --permission-mode acceptEdits \
    --max-turns "${MAX_TURNS:-150}" \
    --output-format stream-json --verbose \
    > "logs/run-$stamp.jsonl" 2>&1 || echo "rodada $round terminou com erro; o próximo ciclo retoma pelo STATE.md"
  if grep -q "## Decisão do dono necessária" .planning/STATE.md && ! grep -A2 "## Decisão do dono necessária" .planning/STATE.md | grep -q "vazio"; then
    echo "Há decisão do dono pendente em .planning/STATE.md (o trabalho independente continua)."
  fi
  sleep "${SLEEP_BETWEEN:-15}"
done
echo "CityNews: todas as fases concluídas. Veja docs/reports/final.md"
