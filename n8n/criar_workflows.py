# -*- coding: utf-8 -*-
"""
SAVAN Recupera — cria/atualiza os workflows n8n via API.
Workflows finos que orquestram as Edge Functions do Supabase.

Uso: python n8n/criar_workflows.py
"""
import json
import re
from pathlib import Path
import requests

RAIZ = Path(__file__).resolve().parent.parent


def env(chave):
    for l in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if l.lower().startswith(chave.lower()):
            return l.split(":", 1)[1].strip()
    raise SystemExit(f"{chave} não encontrado no .env")


N8N = env("url n8n").rstrip("/")
SUPA = env("supabase api url").rstrip("/")
N8N_KEY = env("n8n api key")
SRK = env("service_role supabase")
HDR = {"X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json"}
AUTH = f"Bearer {SRK}"
TAG_PRODUTO = "SAVAN"   # todos os workflows ganham esta tag (organização na instância)
_tag_cache = {}


def garantir_tag(nome):
    """Devolve o id da tag, criando-a se necessário (cacheado)."""
    if nome in _tag_cache:
        return _tag_cache[nome]
    lst = requests.get(f"{N8N}/api/v1/tags?limit=100", headers=HDR).json().get("data", [])
    achou = next((t for t in lst if t["name"] == nome), None)
    tid = achou["id"] if achou else \
        requests.post(f"{N8N}/api/v1/tags", headers=HDR, json={"name": nome}).json()["id"]
    _tag_cache[nome] = tid
    return tid


def node(name, ntype, ver, pos, params=None, extra=None):
    n = {"parameters": params or {}, "id": name, "name": name,
         "type": ntype, "typeVersion": ver, "position": pos}
    if extra:
        n.update(extra)
    return n


def http_edge(name, fn, pos, body_expr):
    """HTTP Request para uma Edge Function do Supabase (auth service_role)."""
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST",
        "url": f"{SUPA}/functions/v1/{fn}",
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "Authorization", "value": AUTH},
            {"name": "Content-Type", "value": "application/json"},
        ]},
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": body_expr,
        "options": {"response": {"response": {"neverError": True}}},
    })


def http_chatwoot(name, pos, url_expr, body_expr):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST",
        "url": url_expr,
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "api_access_token", "value": env("token chatwoot")},
            {"name": "Content-Type", "value": "application/json"},
        ]},
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": body_expr,
        "options": {"response": {"response": {"neverError": True}}},
    })


def http_chatwoot_get(name, pos, url_expr):
    """GET no Chatwoot (ex.: ler as labels atuais de uma conversa)."""
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "GET",
        "url": url_expr,
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "api_access_token", "value": env("token chatwoot")},
        ]},
        "options": {"response": {"response": {"neverError": True}}},
    })


def conn(*pairs):
    c = {}
    for src, dst in pairs:
        c.setdefault(src, {}).setdefault("main", [[]])
        c[src]["main"][0].append({"node": dst, "type": "main", "index": 0})
    return c


def upsert(nome, nodes, connections, ativo=False, settings=None):
    """Cria ou atualiza um workflow pelo nome."""
    payload = {
        "name": nome,
        "nodes": nodes,
        "connections": connections,
        "settings": settings or {"executionOrder": "v1"},
    }
    lst = requests.get(f"{N8N}/api/v1/workflows?limit=250", headers=HDR).json().get("data", [])
    existente = next((w for w in lst if w["name"] == nome), None)
    if existente:
        wid = existente["id"]
        r = requests.put(f"{N8N}/api/v1/workflows/{wid}", headers=HDR, json=payload)
        acao = "atualizado"
    else:
        r = requests.post(f"{N8N}/api/v1/workflows", headers=HDR, json=payload)
        acao = "criado"
    if r.status_code not in (200, 201):
        print(f"  ERRO {nome}: {r.status_code} {r.text[:300]}")
        return None
    wid = r.json().get("data", r.json()).get("id")
    # tag de organização (equivalente possível, via API, à pasta "Cobrador Maurelio v2")
    requests.put(f"{N8N}/api/v1/workflows/{wid}/tags", headers=HDR,
                 json=[{"id": garantir_tag(TAG_PRODUTO)}])
    if ativo:
        requests.post(f"{N8N}/api/v1/workflows/{wid}/activate", headers=HDR)
    print(f"  {nome}: {acao} (id {wid})")
    return wid


# ============================ W01 — DISPARADOR ============================
def w01():
    # 5 min: o lote do campanha-lote cobre esse horizonte e é espaçado item a item pela espera
    # ALEATÓRIA abaixo (30–90s, via delay_proximo). Cadência > intervalo p/ o sorteio surtir efeito.
    trig = node("Cada 5 min", "n8n-nodes-base.scheduleTrigger", 1.2, [240, 300],
                {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}})
    lote = http_edge("Buscar lote", "campanha-lote", [460, 300], "={}")
    split = node("Itens", "n8n-nodes-base.splitOut", 1, [680, 300],
                 {"fieldToSplitOut": "itens", "options": {}})
    loop = node("Loop", "n8n-nodes-base.splitInBatches", 3, [900, 300],
                {"batchSize": 1, "options": {}})
    contato = http_edge("Criar contato", "contato-criar", [1120, 360],
        '={ "inbox_id": {{ $json.inbox_id }}, "telefone_e164": "{{ $json.telefone_e164 }}", '
        '"telefone_id": {{ $json.telefone_id }}, "devedor_id": {{ $json.devedor_id }}, '
        '"devedor_nome": {{ JSON.stringify($json.devedor_nome) }}, "processo": {{ JSON.stringify($json.processo) }}, '
        '"valor_divida": {{ $json.valor_divida }} }')
    # IF: número existe no whatsapp?
    cond = node("Tem WhatsApp?", "n8n-nodes-base.if", 2.2, [1340, 360], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $json.exists }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    # envia via Chatwoot (apenas se não for simulação) — controla com IF separado
    sim = node("É simulação?", "n8n-nodes-base.if", 2.2, [1560, 300], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $('Loop').item.json.simulacao }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    envia = http_chatwoot("Enviar msg", [1780, 360],
        f"={env('chatwoot url').rstrip('/')}/api/v1/accounts/1/conversations/{{{{ $json.conversation_id }}}}/messages",
        '={ "content": {{ JSON.stringify($(\'Loop\').item.json.mensagem) }}, "message_type": "outgoing", '
        '"content_attributes": { "zapi_args": { "delayTyping": {{ $(\'Loop\').item.json.delay_typing }} } } }')
    reg_ok = http_edge("Registrar enviado", "campanha-registrar", [2000, 300],
        '={ "fila_id": {{ $(\'Loop\').item.json.fila_id }}, "chip_id": {{ $(\'Loop\').item.json.chip_id }}, '
        '"devedor_id": {{ $(\'Loop\').item.json.devedor_id }}, "telefone_id": {{ $(\'Loop\').item.json.telefone_id }}, '
        '"status": "enviado", "simulacao": {{ $(\'Loop\').item.json.simulacao }}, '
        '"chatwoot_conversation_id": {{ $(\'Criar contato\').item.json.conversation_id }}, '
        '"chatwoot_contact_id": {{ $(\'Criar contato\').item.json.contact_id }} }')
    reg_sem = http_edge("Registrar sem WA", "campanha-registrar", [1560, 480],
        '={ "fila_id": {{ $(\'Loop\').item.json.fila_id }}, "devedor_id": {{ $(\'Loop\').item.json.devedor_id }}, '
        '"telefone_id": {{ $(\'Loop\').item.json.telefone_id }}, "status": "sem_whatsapp" }')
    # espera ALEATÓRIA até o próximo envio (anti-ban): lê delay_proximo (30–90s) sorteado no campanha-lote
    espera = node("Aguardar intervalo", "n8n-nodes-base.wait", 1.1, [2220, 300],
                  {"amount": "={{ $('Loop').item.json.delay_proximo }}", "unit": "seconds"},
                  {"webhookId": "savan-w01-wait"})

    nodes = [trig, lote, split, loop, contato, cond, sim, envia, reg_ok, reg_sem, espera]
    connections = {}
    def add(src, dst, idx=0):
        connections.setdefault(src, {}).setdefault("main", [])
        while len(connections[src]["main"]) <= idx:
            connections[src]["main"].append([])
        connections[src]["main"][idx].append({"node": dst, "type": "main", "index": 0})
    add("Cada 5 min", "Buscar lote")
    add("Buscar lote", "Itens")
    add("Itens", "Loop")
    add("Loop", "Criar contato", 1)      # saída 1 = "loop" (cada item)
    add("Criar contato", "Tem WhatsApp?")
    add("Tem WhatsApp?", "É simulação?", 0)   # true
    add("Tem WhatsApp?", "Registrar sem WA", 1)  # false
    add("É simulação?", "Registrar enviado", 0)  # true -> não envia, só registra
    add("É simulação?", "Enviar msg", 1)         # false -> envia
    add("Enviar msg", "Registrar enviado")
    add("Registrar enviado", "Aguardar intervalo")
    add("Aguardar intervalo", "Loop")
    add("Registrar sem WA", "Loop")
    upsert("SAVAN W01 - Disparador", nodes, connections)


# ============================ W07 — FOLLOW-UP ============================
def w07():
    trig = node("Cada 5 min", "n8n-nodes-base.scheduleTrigger", 1.2, [240, 300],
                {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}})
    fu = http_edge("Processar follow-ups", "campanha-followup", [460, 300], "={}")
    upsert("SAVAN W07 - Follow-up", [trig, fu],
           conn(("Cada 5 min", "Processar follow-ups")))


# ============================ W08 — MONITOR CHIPS ============================
def w08():
    trig = node("Cada 15 min", "n8n-nodes-base.scheduleTrigger", 1.2, [240, 300],
                {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}})
    mon = http_edge("Monitorar chips", "chips-monitor", [460, 300], "={}")
    upsert("SAVAN W08 - Monitor de Chips", [trig, mon],
           conn(("Cada 15 min", "Monitorar chips")))


# ============================ W09 — MÉTRICAS ============================
def w09():
    trig = node("Cada 5 min", "n8n-nodes-base.scheduleTrigger", 1.2, [240, 300],
                {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}})
    syn = http_edge("Sincronizar métricas", "metricas-sync", [460, 300], "={}")
    upsert("SAVAN W09 - Métricas", [trig, syn],
           conn(("Cada 5 min", "Sincronizar métricas")))


# ============================ W02 — BOT (RECEPÇÃO) ============================
def w02():
    wh = node("Webhook Chatwoot", "n8n-nodes-base.webhook", 2.1, [240, 300], {
        "httpMethod": "POST", "path": "savan-bot", "responseMode": "onReceived",
        "options": {}}, {"webhookId": "savan-bot"})
    # filtro: incoming, não-privada, sem agente-off
    filtro = node("Filtrar", "n8n-nodes-base.code", 2, [460, 300], {"jsClass": "", "jsCode": (
        "const b = $json.body || $json;\n"
        "const ev = b.event;\n"
        "const mt = b.message_type;\n"
        "const priv = b.private;\n"
        "const labels = (b.conversation && b.conversation.labels) || b.labels || [];\n"
        "const off = Array.isArray(labels) && labels.includes('agente-off');\n"
        "const conv = (b.conversation && b.conversation.id) || b.conversation_id;\n"
        "const content = b.content;\n"
        "// só processa mensagem recebida do cliente, não-privada, bot ligado\n"
        "if (ev !== 'message_created' || mt !== 'incoming' || priv || off || !content) {\n"
        "  return [];\n"
        "}\n"
        "return [{ json: { chatwoot_conversation_id: conv, mensagem: content } }];"
    )})
    bot = http_edge("Bot responder", "bot-turno", [680, 300],
        '={ "chatwoot_conversation_id": {{ $json.chatwoot_conversation_id }}, '
        '"mensagem": {{ JSON.stringify($json.mensagem) }} }')
    # quebra mensagens e envia
    prep = node("Preparar envios", "n8n-nodes-base.code", 2, [900, 300], {"jsCode": (
        "const r = $json;\n"
        "const conv = $('Filtrar').item.json.chatwoot_conversation_id;\n"
        "const out = [];\n"
        "for (const m of (r.mensagens || [])) {\n"
        "  out.push({ json: { conv, texto: m } });\n"
        "}\n"
        "// a escalada (aviso ao cobrador + nota/label/atribuição no Chatwoot) é feita pelo bot-turno\n"
        "return out;"
    )})
    loop = node("Loop msgs", "n8n-nodes-base.splitInBatches", 3, [1120, 300],
                {"batchSize": 1, "options": {}})
    envia = http_chatwoot("Enviar resposta", [1340, 360],
        f"={env('chatwoot url').rstrip('/')}/api/v1/accounts/1/conversations/{{{{ $json.conv }}}}/messages",
        '={ "content": {{ JSON.stringify($json.texto) }}, "message_type": "outgoing", '
        '"content_attributes": { "zapi_args": { "delayTyping": 8 } } }')
    espera = node("Aguardar", "n8n-nodes-base.wait", 1.1, [1560, 360],
                  {"amount": 3, "unit": "seconds"}, {"webhookId": "savan-w02-wait"})

    # A escalada (aviso ao cobrador via WhatsApp + nota/label/atribuição ao time no Chatwoot)
    # é feita inteiramente pelo bot-turno (Edge Function), usando o cobrador/número da carteira
    # (config_override.equipe). Não há mais ramo de escalada aqui — evita nota/label duplicados.
    nodes = [wh, filtro, bot, prep, loop, envia, espera]
    connections = {}
    def add(src, dst, idx=0):
        connections.setdefault(src, {}).setdefault("main", [])
        while len(connections[src]["main"]) <= idx:
            connections[src]["main"].append([])
        connections[src]["main"][idx].append({"node": dst, "type": "main", "index": 0})
    add("Webhook Chatwoot", "Filtrar")
    add("Filtrar", "Bot responder")
    add("Bot responder", "Preparar envios")
    add("Preparar envios", "Loop msgs")
    add("Loop msgs", "Enviar resposta", 1)
    add("Enviar resposta", "Aguardar")
    add("Aguardar", "Loop msgs")
    upsert("SAVAN W02 - Bot Negociador", nodes, connections)


if __name__ == "__main__":
    print("Criando workflows SAVAN...")
    w01(); w02(); w07(); w08(); w09()
    print("Pronto.")
