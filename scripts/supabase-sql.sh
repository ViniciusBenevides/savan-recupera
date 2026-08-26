#!/usr/bin/env bash
# Aplica um arquivo .sql no banco de produção pela Management API do Supabase.
#
# Uso:  bash scripts/supabase-sql.sh supabase/migrations/<arquivo>.sql
#       bash scripts/supabase-sql.sh --sql "select 1"
#
# Por que existe: a política do projeto (CLAUDE.md) proíbe MCP para operar serviços externos,
# então SQL em produção vai pela Management API com o token do .env. Este script existe para que
# a operação seja UMA linha auditável em vez de um curl montado na hora — e para poder receber uma
# regra de permissão específica, em vez de liberar curl para qualquer destino.
#
# SEGURANÇA — duas decisões deliberadas:
#
#  1. O .env NUNCA é carregado com `source`. Sourcing executa o conteúdo como shell: um valor de
#     token que contenha `|`, `$`, backtick ou espaço vira comando, quebra o script E IMPRIME O
#     SEGREDO na mensagem de erro. Aconteceu de verdade com COOLIFY_API_KEY. Aqui o arquivo é
#     lido e parseado como texto, nunca executado.
#  2. O token não vai na linha de comando do curl (ficaria visível na lista de processos). Vai
#     num arquivo de config temporário, com permissão restrita, apagado no fim.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

[ -f .env ] || { echo "erro: .env não encontrado na raiz do projeto" >&2; exit 1; }

TMPDIR_LOCAL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT
chmod 700 "$TMPDIR_LOCAL"

PAYLOAD="$TMPDIR_LOCAL/payload.json"
CURLCFG="$TMPDIR_LOCAL/curl.cfg"
RESPOSTA="$TMPDIR_LOCAL/resposta.txt"

# Origem do SQL
if [ "${1:-}" = "--sql" ]; then
  [ -n "${2:-}" ] || { echo "erro: --sql exige um comando" >&2; exit 1; }
  SQL_ORIGEM="(inline)"
  SQL_MODO="inline"
  SQL_VALOR="$2"
else
  SQL_VALOR="${1:?erro: informe o caminho de um arquivo .sql}"
  [ -f "$SQL_VALOR" ] || { echo "erro: arquivo não encontrado: $SQL_VALOR" >&2; exit 1; }
  SQL_ORIGEM="$SQL_VALOR"
  SQL_MODO="arquivo"
fi

# Parse do .env + montagem do payload e da config do curl, tudo em Python: nada é executado.
python - "$SQL_MODO" "$SQL_VALOR" "$PAYLOAD" "$CURLCFG" <<'PYEOF'
import io, json, os, re, sys

modo, valor, caminho_payload, caminho_cfg = sys.argv[1:5]

env = {}
padrao = re.compile(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
for linha in io.open('.env', encoding='utf-8', errors='replace'):
    if linha.lstrip().startswith('#'):
        continue
    m = padrao.match(linha.rstrip('\n'))
    if m:
        v = m.group(2)
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
            v = v[1:-1]
        env[m.group(1)] = v

faltando = [k for k in ('SUPABASE_PROJECT_ID', 'SUPABASE_ACCESS_TOKEN') if not env.get(k)]
if faltando:
    sys.stderr.write('erro: ausente(s) no .env: %s\n' % ', '.join(faltando))
    sys.exit(1)

sql = valor if modo == 'inline' else io.open(valor, encoding='utf-8').read()
io.open(caminho_payload, 'w', encoding='utf-8').write(json.dumps({'query': sql}))

# Token fora do argv: vai na config do curl.
cfg = (
    'url = "https://api.supabase.com/v1/projects/%s/database/query"\n'
    'header = "Authorization: Bearer %s"\n'
    'header = "Content-Type: application/json"\n'
) % (env['SUPABASE_PROJECT_ID'], env['SUPABASE_ACCESS_TOKEN'])
fd = os.open(caminho_cfg, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write(cfg)
PYEOF

echo "-> aplicando: $SQL_ORIGEM"

HTTP_CODE=$(curl -sS -K "$CURLCFG" -X POST \
  --data-binary "@$PAYLOAD" \
  -o "$RESPOSTA" -w "%{http_code}")

RESP="$(head -c 2000 "$RESPOSTA" || true)"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "   OK (HTTP $HTTP_CODE)"
  [ -n "$RESP" ] && echo "   $RESP"
  exit 0
fi

echo "   FALHOU (HTTP $HTTP_CODE)" >&2
echo "   $RESP" >&2
exit 1
