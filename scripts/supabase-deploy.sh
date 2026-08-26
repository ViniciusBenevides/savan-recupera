#!/usr/bin/env bash
# Deploya uma Edge Function do projeto via CLI oficial do Supabase.
#
# Uso:  bash scripts/supabase-deploy.sh <nome-da-funcao> [<nome-da-funcao> ...]
#
# Por que a CLI e não a Management API: as funções importam de `../_shared/*.ts`. A API v1 aceita
# um único arquivo no corpo e não resolveria esses imports; a CLI empacota a função com suas
# dependências. É o mesmo caminho que o resto do projeto já usa.
#
# SEGURANÇA — mesmas duas decisões do supabase-sql.sh:
#  1. O .env NUNCA é carregado com `source` (um valor com `|`, `$` ou backtick viraria comando e
#     vazaria o segredo na mensagem de erro — aconteceu com COOLIFY_API_KEY).
#  2. O token não aparece na linha de comando: entra no ambiente do processo filho da CLI, que é
#     como a própria CLI espera recebê-lo (SUPABASE_ACCESS_TOKEN).

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

[ $# -ge 1 ] || { echo "erro: informe ao menos uma função. Ex.: bash scripts/supabase-deploy.sh enviar-mensagem" >&2; exit 1; }
[ -f .env ] || { echo "erro: .env não encontrado na raiz do projeto" >&2; exit 1; }

for f in "$@"; do
  [ -f "supabase/functions/$f/index.ts" ] || {
    echo "erro: supabase/functions/$f/index.ts não existe" >&2; exit 1; }
done

# Lê o .env como texto (nunca executa) e exporta só o que a CLI precisa.
eval "$(python - <<'PYEOF'
import io, re, shlex, sys

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

# shlex.quote garante que qualquer caractere no valor seja tratado como dado, nunca como sintaxe.
print('export SUPABASE_ACCESS_TOKEN=%s' % shlex.quote(env['SUPABASE_ACCESS_TOKEN']))
print('export REF_PROJETO=%s' % shlex.quote(env['SUPABASE_PROJECT_ID']))
PYEOF
)"

for f in "$@"; do
  echo "-> deployando: $f"
  npx -y supabase@latest functions deploy "$f" --project-ref "$REF_PROJETO"
done

echo "OK: ${*} deployada(s)."
