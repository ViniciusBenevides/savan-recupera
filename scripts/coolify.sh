#!/usr/bin/env bash
# Opera o Coolify pela API oficial, com a credencial do .env.
#
# Uso:
#   bash scripts/coolify.sh info
#   bash scripts/coolify.sh criar-projeto "<nome>" ["<descricao>"]
#   bash scripts/coolify.sh criar-evolution <project_uuid> [<nome-do-servico>]
#   bash scripts/coolify.sh envs <service_uuid>
#   bash scripts/coolify.sh servico <service_uuid>
#
# Por que existe: o Coolify é o único serviço da matriz de credenciais SEM guia operacional local
# (ver "Guias Operacionais/Credenciais — Política para Agentes.md"). Este script concentra as
# operações numa linha auditável, em vez de curl montado na hora, e permite regra de permissão
# específica em vez de liberar rede para qualquer destino.
#
# SEGURANÇA: o .env NUNCA é carregado com `source` — é lido como texto. Sourcing executa o
# conteúdo como shell, e o valor do COOLIFY_API_KEY contém caractere que o shell interpreta:
# nesta mesma sessão isso quebrou um script E imprimiu parte do token no erro.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

[ -f .env ] || { echo "erro: .env não encontrado na raiz do projeto" >&2; exit 1; }
[ $# -ge 1 ] || { echo "erro: informe um comando. Veja o cabeçalho do script." >&2; exit 1; }

python - "$@" <<'PYEOF'
import io, json, re, sys, urllib.error, urllib.request

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

faltando = [k for k in ('COOLIFY_URL', 'COOLIFY_API_KEY') if not env.get(k)]
if faltando:
    sys.stderr.write('erro: ausente(s) no .env: %s\n' % ', '.join(faltando))
    sys.exit(1)

BASE = env['COOLIFY_URL'].rstrip('/')
KEY = env['COOLIFY_API_KEY']


def call(metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(
        f'{BASE}/api/v1/{caminho}', data=dados, method=metodo,
        headers={'Authorization': f'Bearer {KEY}', 'Accept': 'application/json',
                 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto.strip() else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]
    except Exception as e:
        return 0, f'{type(e).__name__}: {e}'


def exigir_ok(status, corpo, oquе):
    if status not in (200, 201):
        sys.stderr.write(f'FALHOU {oquе}: HTTP {status}\n{corpo}\n')
        sys.exit(1)
    return corpo


args = sys.argv[1:]
cmd = args[0]

if cmd == 'info':
    st, srv = call('GET', 'servers')
    print('SERVIDORES:')
    for s in (srv if isinstance(srv, list) else []):
        alcancavel = (s.get('settings') or {}).get('is_reachable')
        curinga = (s.get('settings') or {}).get('wildcard_domain') or '(nenhum)'
        print(f"  {s.get('name')}  uuid={s.get('uuid')}  alcancavel={alcancavel}  curinga={curinga}")

    st, proj = call('GET', 'projects')
    print('\nPROJETOS:')
    for p in (proj if isinstance(proj, list) else []):
        print(f"  {p.get('name')}  uuid={p.get('uuid')}")

    st, svc = call('GET', 'services')
    print('\nSERVICOS:')
    for s in (svc if isinstance(svc, list) else []):
        print(f"  {s.get('name')}  uuid={s.get('uuid')}  status={s.get('status')}  fqdn={s.get('fqdn')}")

elif cmd == 'criar-projeto':
    nome = args[1]
    desc = args[2] if len(args) > 2 else ''
    st, r = call('POST', 'projects', {'name': nome, 'description': desc})
    print(exigir_ok(st, r, 'criar projeto'))

elif cmd == 'criar-evolution':
    projeto = args[1]
    nome = args[2] if len(args) > 2 else 'evolution-savan'
    st, srv = call('GET', 'servers')
    servidor = next((s['uuid'] for s in srv if (s.get('settings') or {}).get('is_reachable')), None)
    if not servidor:
        sys.stderr.write('erro: nenhum servidor alcancavel\n'); sys.exit(1)
    corpo = {
        'type': 'evolution-api',
        'name': nome,
        'project_uuid': projeto,
        'server_uuid': servidor,
        'environment_name': 'production',
        # instant_deploy FALSO de proposito: nada sobe antes de conferirmos as variaveis
        # (a chave de API que a Evolution gera precisa ir para o .env) e o dominio.
        'instant_deploy': False,
    }
    st, r = call('POST', 'services', corpo)
    print(exigir_ok(st, r, 'criar servico evolution-api'))

elif cmd == 'envs':
    st, r = call('GET', f'services/{args[1]}/envs')
    if st != 200:
        sys.stderr.write(f'HTTP {st}: {r}\n'); sys.exit(1)
    for e in (r if isinstance(r, list) else []):
        chave = e.get('key', '')
        valor = e.get('value') or ''
        # segredo nunca aparece inteiro
        sensivel = any(t in chave.upper() for t in ('KEY', 'TOKEN', 'PASSWORD', 'SECRET', 'URI', 'URL'))
        mostrado = f'<{len(valor)} chars>' if (sensivel and valor) else valor
        print(f'  {chave} = {mostrado}')

elif cmd == 'servico':
    st, r = call('GET', f'services/{args[1]}')
    print(json.dumps(r, indent=2, ensure_ascii=False)[:2500] if st == 200 else f'HTTP {st}: {r}')

elif cmd == 'deploy':
    st, r = call('GET', f'services/{args[1]}/start')
    print(exigir_ok(st, r, 'iniciar servico'))

elif cmd == 'status':
    st, r = call('GET', f'services/{args[1]}')
    if st == 200 and isinstance(r, dict):
        print(f"nome={r.get('name')}  status={r.get('status')}")
    else:
        print(f'HTTP {st}: {r}')

elif cmd == 'sincronizar-env':
    # Copia a URL publica e a chave gerada pelo Coolify para o .env do projeto.
    # NUNCA imprime o valor da chave — so confirma o tamanho.
    servico = args[1]
    st, envs = call('GET', f'services/{servico}/envs')
    if st != 200:
        sys.stderr.write(f'HTTP {st}: {envs}\n'); sys.exit(1)

    mapa = {e.get('key'): (e.get('value') or '') for e in (envs if isinstance(envs, list) else [])}

    def resolver(valor, profundidade=0):
        """O Coolify guarda `${OUTRA_VAR}` como valor literal — resolve ate o valor real.

        Sem isto, copiavamos a string '${SERVICE_PASSWORD_AUTHENTICATIONAPIKEY}' (40 chars) como se
        fosse a chave e a Evolution respondia 401. Aconteceu.
        """
        if profundidade > 5:
            return valor
        m = re.fullmatch(r'\$\{([A-Za-z_][A-Za-z0-9_]*)\}', (valor or '').strip())
        return resolver(mapa.get(m.group(1), ''), profundidade + 1) if m else valor

    chave = resolver(mapa.get('AUTHENTICATION_API_KEY', ''))
    if not chave:
        sys.stderr.write('erro: AUTHENTICATION_API_KEY vazia ou nao resolvida\n'); sys.exit(1)
    if '${' in chave:
        sys.stderr.write(f'erro: chave nao resolvida (ainda contem interpolacao)\n'); sys.exit(1)

    st, svc = call('GET', f'services/{servico}')
    url = ''
    if st == 200 and isinstance(svc, dict):
        url = (svc.get('fqdn') or '').split(',')[0].strip()
    if not url:
        url = mapa.get('SERVICE_URL_EVO', '') or mapa.get('SERVER_URL', '')
    url = url.rstrip('/')
    if not url:
        sys.stderr.write('erro: nao consegui determinar a URL publica do servico\n'); sys.exit(1)

    linhas = io.open('.env', encoding='utf-8', errors='replace').read().splitlines()
    novas, vistos = [], set()
    for l in linhas:
        m = padrao.match(l)
        if m and m.group(1) in ('EVOLUTION_URL', 'EVOLUTION_API_KEY'):
            vistos.add(m.group(1))
            novas.append(f"{m.group(1)}={url if m.group(1) == 'EVOLUTION_URL' else chave}")
        else:
            novas.append(l)
    if 'EVOLUTION_URL' not in vistos:
        novas += ['', '# --- Evolution API (canal WhatsApp / Baileys) ---', f'EVOLUTION_URL={url}']
    if 'EVOLUTION_API_KEY' not in vistos:
        novas.append(f'EVOLUTION_API_KEY={chave}')

    io.open('.env', 'w', encoding='utf-8').write('\n'.join(novas) + '\n')
    print(f'.env atualizado: EVOLUTION_URL={url}  EVOLUTION_API_KEY=<{len(chave)} chars>')

else:
    sys.stderr.write(f'comando desconhecido: {cmd}\n'); sys.exit(1)
PYEOF
