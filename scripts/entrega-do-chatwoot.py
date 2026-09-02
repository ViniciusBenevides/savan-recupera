#!/usr/bin/env python3
"""Lê o status de entrega de cada mensagem no Chatwoot e gera o SQL que preenche
`mensagens.status_entrega`.

Por que existe: até 02/09/2026 ninguém gravava recibo. Com a coluna sempre nula, "entregue" e
"recusado pelo provedor" ficavam idênticos na tela — foi assim que 193 abordagens falharam na inbox
da WABA banida (§38) sem que nada aparecesse no painel. O caminho ao vivo é o `message_updated` no
`chatwoot-sync`; este script é o retroativo, e também a rede de segurança quando o webhook perde
evento.

Uso:
    python scripts/entrega-do-chatwoot.py                 # todas as inboxes conhecidas
    python scripts/entrega-do-chatwoot.py --inbox 8       # só uma
    python scripts/entrega-do-chatwoot.py --saida x.sql   # onde gravar (padrão: entrega.sql no TEMP)

Depois:
    bash scripts/supabase-sql.sh <arquivo gerado>

Segurança: o `.env` é lido como TEXTO, nunca com `source` — sourcing executa o conteúdo e já vazou
um token pela mensagem de erro neste projeto (§41). O script só faz GET: não envia mensagem, não
altera nada no Chatwoot, e não escreve no banco (só gera o SQL para revisão).
"""

import argparse
import io
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request

# Escala de `mensagens.status_entrega` (ver migration 20260902120000).
STATUS = {"failed": 0, "sent": 1, "delivered": 2, "read": 3}
# `progress` é mensagem ainda em voo: sem recibo ainda, e nulo diz isso melhor que qualquer número.
IGNORADOS = {"progress", None, ""}


def carregar_env(caminho=".env"):
    env = {}
    padrao = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")
    for linha in io.open(caminho, encoding="utf-8", errors="replace"):
        if linha.lstrip().startswith("#"):
            continue
        m = padrao.match(linha.rstrip("\n"))
        if not m:
            continue
        v = m.group(2)
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("\"", "'"):
            v = v[1:-1]
        env[m.group(1)] = v
    return env


class Chatwoot:
    def __init__(self, url, token, conta):
        self.base = url.rstrip("/")
        self.token = token
        self.conta = conta

    def get(self, caminho):
        req = urllib.request.Request(
            f"{self.base}/api/v1/accounts/{self.conta}{caminho}",
            headers={"api_access_token": self.token, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)

    def conversas_da_inbox(self, inbox_id):
        vistos = []
        conhecidos = set()
        for pagina in range(1, 200):
            d = self.get(f"/conversations?inbox_id={inbox_id}&status=all&page={pagina}")
            lote = (d.get("data") or {}).get("payload") or []
            novos = [c["id"] for c in lote if c.get("id") and c["id"] not in conhecidos]
            if not novos:
                break
            conhecidos.update(novos)
            vistos.extend(novos)
        return vistos

    def mensagens(self, conv_id):
        todas, conhecidos, antes = [], set(), None
        for _ in range(100):
            sufixo = f"?before={antes}" if antes else ""
            d = self.get(f"/conversations/{conv_id}/messages{sufixo}")
            lote = d.get("payload") if isinstance(d, dict) else d
            lote = lote or []
            novos = [m for m in lote if m.get("id") and m["id"] not in conhecidos]
            if not novos:
                break
            conhecidos.update(m["id"] for m in novos)
            todas.extend(novos)
            if len(lote) < 20:
                break
            antes = min(m["id"] for m in lote if m.get("id"))
        return todas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inbox", type=int, action="append", help="inbox a varrer (repetível)")
    ap.add_argument("--saida", help="arquivo .sql a gerar")
    args = ap.parse_args()

    env = carregar_env()
    url = env.get("CHATWOOT_URL", "")
    token = env.get("CHATWOOT_TOKEN") or env.get("CHATWOOT_API_TOKEN")
    conta = env.get("CHATWOOT_ACCOUNT_ID", "1")
    if not url or not token:
        sys.stderr.write("erro: CHATWOOT_URL/CHATWOOT_TOKEN ausentes no .env\n")
        return 1

    cw = Chatwoot(url, token, conta)

    inboxes = args.inbox
    if not inboxes:
        payload = cw.get("/inboxes").get("payload") or []
        inboxes = [i["id"] for i in payload if str(i.get("channel_type", "")).lower()
                   in ("channel::whatsapp", "channel::api")]
    print(f"inboxes: {inboxes}", file=sys.stderr)

    porStatus = {v: [] for v in STATUS.values()}
    total, sem_status = 0, 0

    for inbox in inboxes:
        convs = cw.conversas_da_inbox(inbox)
        print(f"inbox {inbox}: {len(convs)} conversas", file=sys.stderr)
        for i, conv_id in enumerate(convs, 1):
            try:
                msgs = cw.mensagens(conv_id)
            except urllib.error.HTTPError as e:
                print(f"  conversa {conv_id}: HTTP {e.code}, pulada", file=sys.stderr)
                continue
            for m in msgs:
                # Só saída tem recibo: mensagem que CHEGOU não passou pelo nosso transporte.
                if m.get("message_type") not in (1, 3, "outgoing", "template"):
                    continue
                total += 1
                bruto = m.get("status")
                if bruto in IGNORADOS or bruto not in STATUS:
                    sem_status += 1
                    continue
                porStatus[STATUS[bruto]].append(int(m["id"]))
            if i % 50 == 0:
                print(f"  ...{i}/{len(convs)}", file=sys.stderr)

    destino = args.saida or os.path.join(tempfile.gettempdir(), "entrega.sql")
    with io.open(destino, "w", encoding="utf-8") as f:
        f.write("-- Gerado por scripts/entrega-do-chatwoot.py — recibo de entrega retroativo.\n")
        f.write("-- `entregue_em` fica nulo de propósito: o Chatwoot não guarda o instante da\n")
        f.write("-- entrega, e inventar um carimbo seria precisão falsa. O caminho ao vivo\n")
        f.write("-- (chatwoot-sync, message_updated) preenche com a hora do recibo.\n\n")
        for status, ids in sorted(porStatus.items()):
            if not ids:
                continue
            for inicio in range(0, len(ids), 500):
                fatia = ids[inicio:inicio + 500]
                f.write(
                    f"update mensagens set status_entrega = {status} "
                    f"where chatwoot_message_id in ({','.join(str(i) for i in fatia)}) "
                    f"and status_entrega is distinct from {status};\n"
                )

    resumo = {k: len(v) for k, v in sorted(porStatus.items())}
    print(f"saídas lidas: {total} · sem status: {sem_status} · por status: {resumo}", file=sys.stderr)
    print(destino)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
