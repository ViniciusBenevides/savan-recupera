#!/usr/bin/env bash
# Opera a Evolution API (canal WhatsApp / Baileys) com a credencial do .env.
#
# Uso:
#   bash scripts/evolution.sh info
#   bash scripts/evolution.sh criar-instancia <nome>
#   bash scripts/evolution.sh qr <instancia>
#   bash scripts/evolution.sh estado <instancia>
#   bash scripts/evolution.sh proxy-set <instancia> <url> [<rotulo>]
#   bash scripts/evolution.sh proxy-get <instancia>
#   bash scripts/evolution.sh chatwoot-set <instancia> <nome-da-inbox>
#
# A url do proxy aceita o formato completo:  http://usuario:senha@host:porta
# (protocolos: http, https, socks5)
#
# Contexto obrigatório: "Guias Operacionais/Baileys — Guia Operacional.md" (§8 sinais de ban,
# §10 regras de segurança) e docs/adr/0005-um-proxy-por-numero.md.
#
# SEGURANÇA:
#  - o .env NUNCA é carregado com `source` (ver o cabeçalho de scripts/coolify.sh);
#  - a chave da Evolution e a senha do proxy não aparecem na linha de comando: vão em arquivo de
#    config do curl com permissão 600, apagado no fim;
#  - `proxy-get` mascara a senha.
#
# ⚠️ ESTE SCRIPT NÃO ENVIA MENSAGEM. Envio para pessoa real passa pela Edge Function
#    `enviar-mensagem`, que aplica ritmo de digitação e respeita os gates de chip.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

[ -f .env ] || { echo "erro: .env não encontrado na raiz do projeto" >&2; exit 1; }
[ $# -ge 1 ] || { echo "erro: informe um comando. Veja o cabeçalho do script." >&2; exit 1; }

TMPDIR_LOCAL="$(mktemp -d)"; chmod 700 "$TMPDIR_LOCAL"
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT

python - "$TMPDIR_LOCAL" "$@" <<'PYEOF'
import io, json, os, re, subprocess, sys, urllib.parse

tmp = sys.argv[1]
args = sys.argv[2:]
cmd = args[0]

# ── credenciais: lidas como TEXTO, nunca executadas ──────────────────────────────────────
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

faltando = [k for k in ('EVOLUTION_URL', 'EVOLUTION_API_KEY') if not env.get(k)]
if faltando:
    sys.stderr.write('erro: ausente(s) no .env: %s\n' % ', '.join(faltando))
    sys.exit(1)

BASE = env['EVOLUTION_URL'].rstrip('/')

cfg = os.path.join(tmp, 'evo.cfg')
fd = os.open(cfg, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write('header = "apikey: %s"\n' % env['EVOLUTION_API_KEY'])
    f.write('header = "Content-Type: application/json"\n')


def call(metodo, caminho, corpo=None):
    """curl em vez de urllib: alguns hosts barram o user-agent do urllib (Cloudflare 1010)."""
    cmdline = ['curl', '-sS', '-K', cfg, '-X', metodo, f'{BASE}/{caminho}',
               '-o', os.path.join(tmp, 'resp.json'), '-w', '%{http_code}']
    if corpo is not None:
        p = os.path.join(tmp, 'body.json')
        io.open(p, 'w', encoding='utf-8').write(json.dumps(corpo))
        cmdline += ['--data-binary', '@' + p]
    r = subprocess.run(cmdline, capture_output=True, text=True, timeout=180)
    codigo = (r.stdout or '000').strip()
    try:
        texto = io.open(os.path.join(tmp, 'resp.json'), encoding='utf-8').read()
    except Exception:
        texto = ''
    try:
        return codigo, json.loads(texto) if texto.strip() else {}
    except Exception:
        return codigo, texto[:600]


def ok(codigo, corpo, oque):
    if codigo not in ('200', '201'):
        sys.stderr.write(f'FALHOU {oque}: HTTP {codigo}\n{corpo}\n')
        sys.exit(1)
    return corpo


if cmd == 'info':
    c, r = call('GET', 'instance/fetchInstances')
    ok(c, r, 'listar instancias')
    if not r:
        print('(nenhuma instancia — nenhum numero conectado ainda)')
    for i in (r if isinstance(r, list) else []):
        inst = i.get('instance', i)
        print(f"  {inst.get('instanceName') or inst.get('name')}  estado={inst.get('connectionStatus') or inst.get('state')}  numero={inst.get('owner') or inst.get('number') or '-'}")

elif cmd == 'criar-instancia':
    nome = args[1]
    c, r = call('POST', 'instance/create', {
        'instanceName': nome, 'integration': 'WHATSAPP-BAILEYS', 'qrcode': True})
    ok(c, r, 'criar instancia')
    qr = (r.get('qrcode') or {}) if isinstance(r, dict) else {}
    print(f"instancia criada: {nome}")
    print(f"  pairing code: {qr.get('pairingCode') or '(nenhum)'}")
    print(f"  QR em base64: {'sim (use o comando qr)' if qr.get('base64') else 'nao'}")

elif cmd == 'qr':
    c, r = call('GET', f'instance/connect/{urllib.parse.quote(args[1])}')
    ok(c, r, 'obter QR')
    b64 = (r.get('base64') or '') if isinstance(r, dict) else ''
    if b64:
        dados = b64.split(',', 1)[-1]
        destino = os.path.abspath(f'qr-{args[1]}.png')
        import base64
        io.open(destino, 'wb').write(base64.b64decode(dados))
        print(f'QR salvo em: {destino}')
    print(f"pairing code: {r.get('pairingCode') or '(nenhum)'}" if isinstance(r, dict) else r)

elif cmd == 'estado':
    c, r = call('GET', f'instance/connectionState/{urllib.parse.quote(args[1])}')
    print(f'HTTP {c}: {json.dumps(r, ensure_ascii=False)[:300]}')

elif cmd == 'proxy-set':
    instancia, url = args[1], args[2]
    rotulo = args[3] if len(args) > 3 else ''
    u = urllib.parse.urlparse(url)
    if u.scheme not in ('http', 'https', 'socks5') or not u.hostname or not u.port:
        sys.stderr.write('erro: url do proxy deve ser protocolo://[usuario:senha@]host:porta\n'
                         '      protocolos aceitos: http, https, socks5\n')
        sys.exit(1)
    corpo = {'enabled': True, 'host': u.hostname, 'port': str(u.port), 'protocol': u.scheme}
    if u.username:
        corpo['username'] = urllib.parse.unquote(u.username)
        corpo['password'] = urllib.parse.unquote(u.password or '')
    c, r = call('POST', f'proxy/set/{urllib.parse.quote(instancia)}', corpo)
    ok(c, r, 'definir proxy')
    print(f'proxy aplicado em {instancia}: {u.scheme}://{u.hostname}:{u.port}'
          + (' (com autenticacao)' if u.username else ''))
    if rotulo:
        print(f'rotulo para gravar em chips.proxy_rotulo: {rotulo}')
    print('LEMBRE: grave o rotulo no chip para o painel saber qual proxy trocar quando ele cair.')

elif cmd == 'proxy-get':
    c, r = call('GET', f'proxy/find/{urllib.parse.quote(args[1])}')
    if c != '200':
        print(f'HTTP {c}: {r}'); sys.exit(0)
    d = r if isinstance(r, dict) else {}
    senha = d.get('password')
    print(f"  ativo   : {d.get('enabled')}")
    print(f"  destino : {d.get('protocol')}://{d.get('host')}:{d.get('port')}")
    print(f"  usuario : {d.get('username') or '-'}")
    print(f"  senha   : {'<' + str(len(senha)) + ' chars>' if senha else '-'}")

elif cmd == 'chatwoot-set':
    instancia, inbox = args[1], args[2]
    for k in ('CHATWOOT_URL', 'CHATWOOT_TOKEN'):
        if not env.get(k):
            sys.stderr.write(f'erro: {k} ausente no .env\n'); sys.exit(1)
    corpo = {
        'enabled': True,
        'accountId': env.get('CHATWOOT_ACCOUNT_ID', '1'),
        'token': env['CHATWOOT_TOKEN'],
        'url': env['CHATWOOT_URL'].rstrip('/'),
        'nameInbox': inbox,
        'signMsg': False,            # o robô não assina: quem fala é a persona
        'reopenConversation': True,  # a conversa é do devedor — reabrir, não duplicar (ADR-0001)
        'conversationPending': False,
        'importContacts': False,
        'importMessages': False,
        'mergeBrazilContacts': True, # sem isto o 9º dígito racha o dossiê em dois contatos
    }
    c, r = call('POST', f'chatwoot/set/{urllib.parse.quote(instancia)}', corpo)
    ok(c, r, 'ligar chatwoot')
    print(f'Chatwoot ligado a {instancia} (inbox "{inbox}", mergeBrazilContacts ativo)')

else:
    sys.stderr.write(f'comando desconhecido: {cmd}\n'); sys.exit(1)
PYEOF
