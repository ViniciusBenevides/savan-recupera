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
    for linha in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        nome, valor = linha.split("=", 1)
        if nome.strip() == chave:
            return valor.strip().strip('"').strip("'")
    raise SystemExit(f"{chave} não encontrado no .env")


N8N = env("N8N_URL").rstrip("/")
# SUPABASE_API_URL aponta para a API REST e termina em /rest/v1. As Edge Functions ficam em
# /functions/v1 na RAIZ do projeto: concatenar direto gerava .../rest/v1/functions/v1/..., que dá 404
# em toda chamada. O W01 no ar tinha a URL certa e o script, a errada — regerar por cima teria
# quebrado os cinco nós de Edge Function de uma vez, sem erro nenhum aparecer até a campanha rodar.
SUPA = re.sub(r"/rest/v\d+/?$", "", env("SUPABASE_API_URL").rstrip("/"))
N8N_KEY = env("N8N_API_KEY")
SRK = env("SUPABASE_SERVICE_ROLE_KEY")
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
            {"name": "api_access_token", "value": env("CHATWOOT_TOKEN")},
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
            {"name": "api_access_token", "value": env("CHATWOOT_TOKEN")},
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
    # 1 min: granularidade suficiente para o relogio persistente do chip alternar ciclos de
    # 2 e 3 min quando o ritmo e 25/h. Dentro de lotes, delay_proximo mantem a espera aleatoria.
    trig = node("Cada 1 min", "n8n-nodes-base.scheduleTrigger", 1.2, [240, 300],
                {"rule": {"interval": [{"field": "minutes", "minutesInterval": 1}]}})
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
    contato_ok = node("Contato criado?", "n8n-nodes-base.if", 2.2, [1340, 300], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $json.ok }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    # IF: número existe no whatsapp?
    cond = node("Tem WhatsApp?", "n8n-nodes-base.if", 2.2, [1560, 360], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $json.exists }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    # envia via Chatwoot (apenas se não for simulação) — controla com IF separado
    sim = node("É simulação?", "n8n-nodes-base.if", 2.2, [1780, 300], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $('Loop').item.json.simulacao }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    # O caminho de saida depende do conector do chip, e o campanha-lote ja diz qual em `canal`.
    canal = node("Canal Baileys?", "n8n-nodes-base.if", 2.2, [2000, 360], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $('Loop').item.json.canal }}", "rightValue": "baileys",
             "operator": {"type": "string", "operation": "equals"}}]}})
    # BAILEYS (ADR-0002): sai pela Edge Function, NAO pelo Chatwoot. E ela que aplica presenca e
    # "digitando..." — os sinais comportamentais pelos quais o WhatsApp separa humano de robo. Num
    # canal nao oficial o juiz e comportamental, entao esse controle nao pode ficar de fora.
    envia_bai = http_edge("Enviar pelo Baileys", "enviar-mensagem", [2220, 200],
        '={ "chip_id": {{ $(\'Loop\').item.json.chip_id }}, '
        '"numero_e164": {{ JSON.stringify($(\'Loop\').item.json.telefone_e164) }}, '
        '"texto": {{ JSON.stringify($(\'Loop\').item.json.mensagem) }}, '
        '"simulacao": {{ $(\'Loop\').item.json.simulacao }} }')
    # META CLOUD (§32): a 1a mensagem abre a conversa, entao esta fora da janela de 24h e a Cloud
    # API so aceita modelo aprovado. O campanha-lote ja manda o descritor pronto em `template`.
    envia = http_chatwoot("Enviar msg", [2220, 460],
        f"={env('CHATWOOT_URL').rstrip('/')}/api/v1/accounts/1/conversations/{{{{ $('Criar contato').item.json.conversation_id }}}}/messages",
        '={ "content": {{ JSON.stringify($(\'Loop\').item.json.mensagem) }}, "message_type": "outgoing", '
        '"template_params": {{ JSON.stringify($(\'Loop\').item.json.template) }} }')
    # Um no de veredicto para os dois caminhos, porque a resposta tem formato diferente em cada um:
    # o Chatwoot devolve a mensagem criada (tem `id`), a `enviar-mensagem` devolve `ok: true`.
    envio_ok = node("Mensagem aceita?", "n8n-nodes-base.if", 2.2, [2440, 360], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ !!$json.id || $json.ok === true }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    reg_ok = http_edge("Registrar enviado", "campanha-registrar", [2660, 300],
        '={ "fila_id": {{ $(\'Loop\').item.json.fila_id }}, "chip_id": {{ $(\'Loop\').item.json.chip_id }}, '
        '"carteira_id": {{ $(\'Loop\').item.json.carteira_id }}, "devedor_id": {{ $(\'Loop\').item.json.devedor_id }}, '
        '"telefone_id": {{ $(\'Loop\').item.json.telefone_id }}, "mensagem": {{ JSON.stringify($(\'Loop\').item.json.mensagem) }}, '
        '"status": "enviado", "simulacao": {{ $(\'Loop\').item.json.simulacao }}, '
        '"chatwoot_message_id": {{ $json.id || null }}, '
        '"chatwoot_conversation_id": {{ $(\'Criar contato\').item.json.conversation_id }}, '
        # A inbox do chip que disparou. Sem ela o painel não sabe se o ponteiro do Chatwoot ainda
        # vale, e uma conversa herdada de número banido parece atendível (§38).
        '"inbox_id": {{ $(\'Loop\').item.json.inbox_id }}, '
        '"chatwoot_contact_id": {{ $(\'Criar contato\').item.json.contact_id }} }')
    reg_sem = http_edge("Registrar sem WA", "campanha-registrar", [1780, 520],
        '={ "fila_id": {{ $(\'Loop\').item.json.fila_id }}, "devedor_id": {{ $(\'Loop\').item.json.devedor_id }}, '
        '"telefone_id": {{ $(\'Loop\').item.json.telefone_id }}, "status": "sem_whatsapp" }')
    reg_falha_contato = http_edge("Registrar falha de contato", "campanha-registrar", [1560, 600],
        '={ "fila_id": {{ $(\'Loop\').item.json.fila_id }}, "devedor_id": {{ $(\'Loop\').item.json.devedor_id }}, '
        '"telefone_id": {{ $(\'Loop\').item.json.telefone_id }}, "status": "falha", '
        '"erro": {{ JSON.stringify($json.erro || "contato_criar_falhou") }} }')
    reg_falha_envio = http_edge("Registrar falha de envio", "campanha-registrar", [2660, 520],
        '={ "fila_id": {{ $(\'Loop\').item.json.fila_id }}, "devedor_id": {{ $(\'Loop\').item.json.devedor_id }}, '
        '"telefone_id": {{ $(\'Loop\').item.json.telefone_id }}, "status": "falha", '
        '"erro": {{ JSON.stringify($json.error || $json.message || $json.resultado || "resposta_sem_id") }} }')
    # espera ALEATORIA ate o proximo envio (anti-ban): le delay_proximo sorteado no campanha-lote
    espera = node("Aguardar intervalo", "n8n-nodes-base.wait", 1.1, [2880, 300],
                  {"resume": "timeInterval", "amount": "={{ $('Loop').item.json.delay_proximo }}", "unit": "seconds"},
                  {"webhookId": "savan-w01-wait"})

    nodes = [trig, lote, split, loop, contato, contato_ok, cond, sim, canal, envia_bai, envia, envio_ok,
             reg_ok, reg_sem, reg_falha_contato, reg_falha_envio, espera]
    connections = {}
    def add(src, dst, idx=0):
        connections.setdefault(src, {}).setdefault("main", [])
        while len(connections[src]["main"]) <= idx:
            connections[src]["main"].append([])
        connections[src]["main"][idx].append({"node": dst, "type": "main", "index": 0})
    add("Cada 1 min", "Buscar lote")
    add("Buscar lote", "Itens")
    add("Itens", "Loop")
    add("Loop", "Criar contato", 1)      # saída 1 = "loop" (cada item)
    add("Criar contato", "Contato criado?")
    add("Contato criado?", "Tem WhatsApp?", 0)
    add("Contato criado?", "Registrar falha de contato", 1)
    add("Tem WhatsApp?", "É simulação?", 0)   # true
    add("Tem WhatsApp?", "Registrar sem WA", 1)  # false
    add("É simulação?", "Registrar enviado", 0)  # true -> não envia, só registra
    add("É simulação?", "Canal Baileys?", 1)     # false -> escolhe o caminho de saida
    add("Canal Baileys?", "Enviar pelo Baileys", 0)  # true  -> Evolution, com ritmo de digitacao
    add("Canal Baileys?", "Enviar msg", 1)           # false -> Chatwoot com modelo aprovado
    add("Enviar pelo Baileys", "Mensagem aceita?")
    add("Enviar msg", "Mensagem aceita?")
    add("Mensagem aceita?", "Registrar enviado", 0)
    add("Mensagem aceita?", "Registrar falha de envio", 1)
    add("Registrar enviado", "Aguardar intervalo")
    add("Registrar falha de contato", "Aguardar intervalo")
    add("Registrar falha de envio", "Aguardar intervalo")
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
    normalizar = node("Normalizar evento", "n8n-nodes-base.code", 2, [460, 300], {"jsClass": "", "jsCode": (
        "const b = $json.body || $json;\n"
        "const evento = String(b.event || '');\n"
        "if (!['message_created', 'conversation_created', 'message_updated'].includes(evento)) return [];\n"
        "const conv = Number((b.conversation && b.conversation.id) || b.conversation_id || (evento === 'conversation_created' ? b.id : 0));\n"
        # `message_updated` traz o recibo do provedor (sent/delivered/read/failed) e é endereçado
        # pelo id da MENSAGEM: o chatwoot-sync só precisa disso. Exigir conversa aqui descartaria
        # justamente o evento que revela entrega falhada — o sinal que faltava no §38.
        "if (!conv && evento !== 'message_updated') return [];\n"
        "const labels = (b.conversation && b.conversation.labels) || b.labels || [];\n"
        "return [{ json: {\n"
        "  evento, chatwoot_conversation_id: conv, chatwoot_message_id: b.id || null,\n"
        "  message_type: b.message_type || null, private: b.private === true,\n"
        "  mensagem: b.content || '', content_type: b.content_type || null,\n"
        "  status: b.status || null,\n"
        "  created_at: b.created_at || null, sender_type: (b.sender && b.sender.type) || null, labels\n"
        "} }];"
    )})
    sync = http_edge("Espelhar no painel", "chatwoot-sync", [680, 300], "={{ $json }}")
    sync_ok = node("Sincronizacao ok?", "n8n-nodes-base.if", 2.2, [900, 300], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ $json.ok }}", "rightValue": True,
             "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}})
    # O espelhamento aceita entrada e saída. Somente entrada pública com o bot ligado segue para a IA.
    filtro = node("Filtrar bot", "n8n-nodes-base.code", 2, [1120, 300], {"jsClass": "", "jsCode": (
        "const b = $('Normalizar evento').item.json;\n"
        "const off = Array.isArray(b.labels) && b.labels.includes('agente-off');\n"
        "if (b.evento !== 'message_created' || b.message_type !== 'incoming' || b.private || off || !b.mensagem) return [];\n"
        "return [{ json: b }];"
    )})
    # Debounce: aguarda a pessoa terminar de enviar mensagens curtas em sequencia.
    # A Edge Function confirma qual message_id e o mais recente e descarta as execucoes antigas.
    debounce = node("Aguardar mensagens encavaladas", "n8n-nodes-base.wait", 1.1, [1340, 300],
                    {"resume": "timeInterval", "amount": 20, "unit": "seconds"},
                    {"webhookId": "savan-w02-debounce"})
    bot = http_edge("Bot responder", "bot-turno", [1560, 300],
        '={ "chatwoot_conversation_id": {{ $(\'Filtrar bot\').first().json.chatwoot_conversation_id }}, '
        '"chatwoot_message_id": {{ $(\'Filtrar bot\').first().json.chatwoot_message_id }}, '
        '"mensagem": {{ JSON.stringify($(\'Filtrar bot\').first().json.mensagem) }} }')
    retry = node("Conversa ocupada?", "n8n-nodes-base.if", 2.2, [1780, 300], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
                       "combinator": "and", "conditions": [
            {"leftValue": "={{ Number($json.repetir_em_segundos || 0) }}", "rightValue": 0,
             "operator": {"type": "number", "operation": "gt"}}]}})
    retry_wait = node("Aguardar conversa livre", "n8n-nodes-base.wait", 1.1, [2000, 240],
                      {"resume": "timeInterval", "amount": "={{ $json.repetir_em_segundos || 5 }}", "unit": "seconds"},
                      {"webhookId": "savan-w02-lock-wait"})
    # quebra mensagens e envia
    prep = node("Preparar envios", "n8n-nodes-base.code", 2, [2000, 360], {"jsCode": (
        "const r = $json;\n"
        "const conv = $('Filtrar bot').first().json.chatwoot_conversation_id;\n"
        "const out = [];\n"
        "for (const m of (r.mensagens || [])) {\n"
        "  out.push({ json: { conv, texto: m } });\n"
        "}\n"
        "// a escalada (aviso ao cobrador + nota/label/atribuição no Chatwoot) é feita pelo bot-turno\n"
        "return out;"
    )})
    loop = node("Loop msgs", "n8n-nodes-base.splitInBatches", 3, [2220, 360],
                {"batchSize": 1, "options": {}})
    envia = http_chatwoot("Enviar resposta", [2440, 420],
        f"={env('CHATWOOT_URL').rstrip('/')}/api/v1/accounts/1/conversations/{{{{ $json.conv }}}}/messages",
        '={ "content": {{ JSON.stringify($json.texto) }}, "message_type": "outgoing" }')
    espera = node("Aguardar", "n8n-nodes-base.wait", 1.1, [2660, 420],
                  {"resume": "timeInterval", "amount": 3, "unit": "seconds"}, {"webhookId": "savan-w02-wait"})

    # A escalada (aviso ao cobrador via WhatsApp + nota/label/atribuição ao time no Chatwoot)
    # é feita inteiramente pelo bot-turno (Edge Function), usando o cobrador/número da carteira
    # (config_override.equipe). Não há mais ramo de escalada aqui — evita nota/label duplicados.
    nodes = [wh, normalizar, sync, sync_ok, filtro, debounce, bot, retry, retry_wait, prep, loop, envia, espera]
    connections = {}
    def add(src, dst, idx=0):
        connections.setdefault(src, {}).setdefault("main", [])
        while len(connections[src]["main"]) <= idx:
            connections[src]["main"].append([])
        connections[src]["main"][idx].append({"node": dst, "type": "main", "index": 0})
    add("Webhook Chatwoot", "Normalizar evento")
    add("Normalizar evento", "Espelhar no painel")
    add("Espelhar no painel", "Sincronizacao ok?")
    add("Sincronizacao ok?", "Filtrar bot", 0)
    add("Filtrar bot", "Aguardar mensagens encavaladas")
    add("Aguardar mensagens encavaladas", "Bot responder")
    add("Bot responder", "Conversa ocupada?")
    add("Conversa ocupada?", "Aguardar conversa livre", 0)
    add("Aguardar conversa livre", "Bot responder")
    add("Conversa ocupada?", "Preparar envios", 1)
    add("Preparar envios", "Loop msgs")
    add("Loop msgs", "Enviar resposta", 1)
    add("Enviar resposta", "Aguardar")
    add("Aguardar", "Loop msgs")
    upsert("SAVAN W02 - Bot Negociador", nodes, connections)


if __name__ == "__main__":
    import sys

    # Sem argumento, regenera os cinco (o comportamento de sempre). Com argumento, só os pedidos:
    # `python n8n/criar_workflows.py w02`. Existe para que corrigir UM workflow não sobrescreva os
    # outros quatro que estão no ar — regerar por cima já quebrou os cinco nós de Edge Function de
    # uma vez, sem erro aparecer até a campanha rodar (ver o comentário do SUPA lá em cima).
    TODOS = {"w01": w01, "w02": w02, "w07": w07, "w08": w08, "w09": w09}
    pedidos = [a.lower() for a in sys.argv[1:]] or list(TODOS)
    desconhecidos = [p for p in pedidos if p not in TODOS]
    if desconhecidos:
        raise SystemExit(f"workflow desconhecido: {', '.join(desconhecidos)}. Use: {', '.join(TODOS)}")

    print(f"Criando workflows SAVAN: {', '.join(pedidos)}...")
    for nome in pedidos:
        TODOS[nome]()
    print("Pronto.")
