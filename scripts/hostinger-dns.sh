#!/usr/bin/env bash
# Opera DNS da Hostinger pela API oficial, com a credencial do .env.
#
# Uso:
#   bash scripts/hostinger-dns.sh zona <dominio>
#   bash scripts/hostinger-dns.sh add-a <dominio> <nome> <ip> [<ttl=3600>]
#   bash scripts/hostinger-dns.sh add-cname <dominio> <nome> <destino> [<ttl=3600>]
#
# Por que existe: "Guias Operacionais/Hostinger — Guia Operacional.md" §7.4 é enfático — o PUT de
# zona tem um `overwrite` que, em `true`, SUBSTITUI a zona inteira (apaga MX, TXT, tudo que não
# estiver no payload — site e e-mail caem juntos). Não existe snapshot sob demanda pela API. Este
# script existe para que a única operação de escrita possível seja um merge aditivo — nunca dá
# para apagar nada por aqui.
#
# SEGURANÇA:
#  - `overwrite` é SEMPRE `false` no corpo enviado. Não é parâmetro, não tem como o chamador virar
#    isso `true`. Uma zona inteira só é destruída por quem editar este arquivo de propósito.
#  - o .env NUNCA é carregado com `source` (mesma razão dos outros scripts deste projeto: um
#    valor com `|`, `$` ou crase vira comando e vaza no erro).
#  - o token não vai na linha de comando: fica em arquivo de config do curl, permissão 600,
#    apagado no fim.
#  - curl, não urllib/Invoke-RestMethod: developers.hostinger.com está atrás de Cloudflare e
#    recusa a assinatura de user-agent de bibliotecas HTTP puras (mesmo motivo do evolution.sh).
#
# Cada chamada só ACRESCENTA um registro. Para editar/remover um registro existente, ou fazer
# qualquer coisa fora dessas duas receitas, leia o guia inteiro primeiro e trate como o que é:
# uma operação capaz de derrubar site e e-mail do domínio.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

[ -f .env ] || { echo "erro: .env não encontrado na raiz do projeto" >&2; exit 1; }
[ $# -ge 1 ] || { echo "erro: informe um comando. Veja o cabeçalho do script." >&2; exit 1; }

TMPDIR_LOCAL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT
chmod 700 "$TMPDIR_LOCAL"

CFG="$TMPDIR_LOCAL/host.cfg"
BODY="$TMPDIR_LOCAL/body.json"
RESP="$TMPDIR_LOCAL/resp.json"

python - "$CFG" <<'PYEOF'
import io, os, re, sys
caminho_cfg = sys.argv[1]
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

if not env.get('HOSTINGER_API_KEY'):
    sys.stderr.write('erro: ausente no .env: HOSTINGER_API_KEY\n')
    sys.exit(1)

fd = os.open(caminho_cfg, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write('header = "Authorization: Bearer %s"\n' % env['HOSTINGER_API_KEY'])
    f.write('header = "Content-Type: application/json"\n')
    f.write('header = "Accept: application/json"\n')
PYEOF

BASE="https://developers.hostinger.com/api/dns/v1"
cmd="$1"

chamar() {
  local metodo="$1" caminho="$2" corpo="${3:-}"
  if [ -n "$corpo" ]; then
    curl -sS -K "$CFG" -X "$metodo" "$BASE/$caminho" --data-binary "@$corpo" -o "$RESP" -w "%{http_code}"
  else
    curl -sS -K "$CFG" -X "$metodo" "$BASE/$caminho" -o "$RESP" -w "%{http_code}"
  fi
}

case "$cmd" in
  zona)
    dominio="${2:?erro: informe o domínio}"
    codigo=$(chamar GET "zones/$dominio")
    if [ "$codigo" = "200" ]; then
      cat "$RESP"
    else
      echo "FALHOU (HTTP $codigo)" >&2
      cat "$RESP" >&2
      exit 1
    fi
    ;;

  add-a|add-cname)
    dominio="${2:?erro: informe o domínio}"
    nome="${3:?erro: informe o nome do registro (ex.: baileys-api-xyz)}"
    destino="${4:?erro: informe o IP (add-a) ou destino (add-cname)}"
    ttl="${5:-3600}"
    tipo="A"; [ "$cmd" = "add-cname" ] && tipo="CNAME"

    python - "$BODY" "$nome" "$tipo" "$ttl" "$destino" <<'PYEOF'
import io, json, sys
caminho, nome, tipo, ttl, destino = sys.argv[1:6]
payload = {
    "overwrite": False,  # travado: este script nunca manda true
    "zone": [{"name": nome, "type": tipo, "ttl": int(ttl), "records": [{"content": destino}]}],
}
io.open(caminho, 'w', encoding='utf-8').write(json.dumps(payload))
PYEOF

    echo "-> acrescentando (merge, nada é apagado): $nome $tipo -> $destino (ttl $ttl) em $dominio"
    codigo=$(chamar PUT "zones/$dominio" "$BODY")
    if [ "$codigo" = "200" ] || [ "$codigo" = "201" ] || [ "$codigo" = "204" ]; then
      echo "   OK (HTTP $codigo)"
      [ -s "$RESP" ] && head -c 500 "$RESP" && echo
    else
      echo "   FALHOU (HTTP $codigo)" >&2
      cat "$RESP" >&2
      exit 1
    fi
    ;;

  *)
    echo "erro: comando desconhecido: $cmd. Veja o cabeçalho do script." >&2
    exit 1
    ;;
esac
