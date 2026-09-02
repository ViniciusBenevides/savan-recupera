#!/usr/bin/env python3
"""Gera a versão 8 do fluxo da carteira 11 — tudo esclarecido logo no início.

DECISÃO DO DONO (02/09/2026), tomada com o risco na mesa: a abordagem deixa de pedir licença no
vago e passa a se identificar por completo já na primeira mensagem — quem fala, a cessão, o valor e
o vencimento — perguntando em seguida se é a pessoa certa. Quando ela confirma OU pergunta do que se
trata, sai tudo de uma vez: dados, oferta, endereço e a instrução de tratar com a MC Cred a partir
de agora. Sem "posso te passar os detalhes?" — quanto menos turnos, melhor.

Isso contraria R1/R2 do ADR-0003 (licença antes de identidade; nada da dívida antes do "sim"), que
foram escritas depois do ban da conta oficial (§38). O contraponto foi apresentado e a decisão
mantida: o desenho anterior produzia conversas com cara de golpe — a pessoa perguntava do que se
tratava e recebia um pedido de nome completo, duas vezes seguidas. O que se ganha é credibilidade
verificável no primeiro contato; o que se aceita é que um número reciclado passa a ver o valor e a
data de uma dívida alheia.

O QUE ESTE SCRIPT NÃO FAZ: ativar. Ele insere apenas em `fluxo_versoes`, como rascunho. Nem
`carteiras.roteiro` nem `carteiras.fluxo_versao_ativa_id` são tocados — quem lê o texto de disparo é
`carteiras.roteiro`, então escrever lá mudaria o que 2.634 pessoas recebem no próximo ciclo. Para
ativar, use o botão de restaurar a versão no painel (POST /api/carteiras/11/fluxos/<id>/restaurar),
que faz os três lugares numa transação só.

Uso:
    python scripts/roteiro-v8-tudo-na-frente.py --previa     # imprime os textos, não escreve nada
    python scripts/roteiro-v8-tudo-na-frente.py --gravar     # insere a v8 como rascunho
"""

import argparse
import copy
import io
import json
import re
import sys
import urllib.request

CARTEIRA = 11

# O console do Windows abre em cp1252 e engasga com "→" e acento. O texto do roteiro é todo em
# português, então forçar UTF-8 aqui é o que faz a prévia ser legível.
for fluxo in (sys.stdout, sys.stderr):
    try:
        fluxo.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# ─────────────────────────────────────────────────────────────────────────────────────────────
# PREENCHER ANTES DE GRAVAR. Vai numa mensagem para 2.634 pessoas: endereço errado é pior que
# endereço nenhum, então o script se recusa a gravar enquanto isto for o placeholder.
ENDERECO_MC_CRED = "<<PREENCHER: endereço completo da MC Cred>>"
# ─────────────────────────────────────────────────────────────────────────────────────────────

# Variáveis disponíveis no renderizador do campanha-lote: primeiro_nome, nome, credor, nome_bot,
# saudacao, valor, vencimento, ano. `{a|b}` é spintax — sorteado por envio, para que dois devedores
# nunca recebam o texto idêntico (remédio anti-ban, não enfeite).
TEXTOS_ABORDAGEM = [
    "{Olá|Oi}, {{primeiro_nome}}. Aqui é a {{nome_bot}}, da MC Cred.\n\n"
    "A MC Cred comprou a carteira de contas da {{credor}} — por isso quem fala com você agora somos "
    "nós, e não a loja. Consta aqui uma pendência de {{valor}}, com vencimento em {{vencimento}}, "
    "no nome de {{nome}}.\n\n"
    "Confirma que falo com a pessoa certa? Se este número não for dela, me avisa que eu corrijo. "
    "E se você preferir não tratar disso por aqui, responde “não” que eu não te procuro mais.",

    "{Olá|Oi}, {{primeiro_nome}}! Meu nome é {{nome_bot}} e eu falo pela MC Cred.\n\n"
    "Nós adquirimos a carteira de contas da {{credor}}, então esse assunto passou a ser conosco. "
    "No sistema há uma pendência em nome de {{nome}}: {{valor}}, vencida em {{vencimento}}.\n\n"
    "É com você mesmo que estou falando? Se o número não for da pessoa, me diz que eu tiro do "
    "cadastro. Se não quiser tratar disso comigo, é só responder “não”.",

    "{Olá|Oi}, {{primeiro_nome}}, tudo bem? Sou a {{nome_bot}}, da MC Cred.\n\n"
    "A {{credor}} cedeu a carteira dessas contas para a MC Cred, que hoje é a responsável por elas. "
    "Está registrada uma pendência de {{valor}}, com vencimento em {{vencimento}}, em nome de "
    "{{nome}}.\n\n"
    "Só preciso confirmar: é você? Se este número for de outra pessoa, me avisa. E se não quiser "
    "falar sobre isso, responde “não” que eu encerro aqui.",
]

# A etapa que substitui o vaivém optin → identificar → abrir_assunto → proposta. Uma mensagem só.
INSTRUCAO_APRESENTAR_TUDO = (
    "A pessoa confirmou que é ela OU perguntou do que se trata. Nos dois casos você entrega TUDO "
    "agora, numa única mensagem. Não pergunte se pode explicar, não peça permissão, não fatie em "
    "duas. A instrução “posso te passar os detalhes?” está proibida nesta etapa: ela já foi "
    "respondida pelo simples fato de a pessoa ter perguntado.\n\n"
    "POR QUE ESTA ETAPA EXISTE: no desenho anterior a pessoa perguntava “sobre o que?” e recebia um "
    "pedido de nome completo — duas vezes seguidas, sem nunca ouvir a resposta. Isso é a forma "
    "exata de um golpe e destruía a conversa antes de ela começar.\n\n"
    "A mensagem precisa conter, nesta ordem:\n"
    "1. Quem somos: a MC Cred, e que a carteira de contas da {{credor}} foi cedida a nós — é por "
    "isso que a pessoa não nos reconhece.\n"
    "2. O que consta: pendência de {{valor}}, vencida em {{vencimento}}, em nome de {{nome}}.\n"
    "3. Que o assunto passa a ser tratado com a MC Cred a partir de agora.\n"
    "4. Nosso endereço: " + ENDERECO_MC_CRED + "\n"
    "5. A condição de quitação: chame a ferramenta de proposta e diga o VALOR COM DESCONTO e o que "
    "ele encerra — pagamento único, com termo de quitação. Nunca invente esse número.\n"
    "6. Que é voluntário: a dívida está prescrita, não há consequência se a pessoa não quiser "
    "pagar, e ela pode dizer que não a qualquer momento. Isso é obrigação de honestidade, não "
    "gentileza — enrolar aqui é o que vira Procon.\n\n"
    "Termine oferecendo o próximo passo concreto (o Pix), não uma pergunta aberta. Uma mensagem "
    "longa e completa é melhor que três curtas: cada turno a mais é uma chance de a conversa "
    "descarrilar e um envio a mais no número."
)

CASOS_APRESENTAR_TUDO = [
    {"quando": "aceitou a condição, disse que quer pagar ou pediu o Pix",
     "exemplos": ["Pode mandar o pix", "Quero pagar", "Fechado", "Aceito", "Manda aí"],
     "vai_para": "pagamento"},
    {"quando": "achou o valor alto, pediu desconto maior ou quer parcelar",
     "exemplos": ["Ta caro", "Consegue baixar mais?", "Dá pra parcelar?", "Não tenho tudo isso"],
     "vai_para": "objecao_valor"},
    {"quando": "quer pagar mas não tem condição agora, pediu para deixar para depois",
     "exemplos": ["Agora não dá", "Mês que vem eu vejo", "Estou desempregado"],
     "vai_para": "sem_condicoes"},
    {"quando": "não reconhece a compra, diz que nunca comprou na loja ou pede a origem",
     "exemplos": ["Nunca comprei aí", "Não reconheço", "De onde é isso?", "Que compra?"],
     "vai_para": "esclarecer_origem"},
    {"quando": "afirma que já pagou essa conta",
     "exemplos": ["Já paguei", "Isso foi quitado", "Paguei na loja faz tempo"],
     "vai_para": "ja_pagou"},
    {"quando": "perguntou se prescreveu, se caducou ou se é obrigada a pagar",
     "exemplos": ["Isso não caducou?", "Meu nome está limpo", "Sou obrigado a pagar?"],
     "vai_para": "duvida_prescricao"},
    {"quando": "pediu comprovante, contrato ou nota fiscal",
     "exemplos": ["Manda o comprovante", "Quero ver o contrato", "Tem como provar?"],
     "vai_para": "pedido_documento"},
    {"quando": "perguntou como conseguimos o telefone ou os dados dela",
     "exemplos": ["Como conseguiu meu número?", "Quem passou meus dados?"],
     "vai_para": "origem_do_contato"},
    {"quando": "desconfiou de nós, achou que é golpe ou não conhece a MC Cred",
     "exemplos": ["Isso é golpe?", "Não conheço essa empresa", "Como sei que é verdade?"],
     "vai_para": "esclarecer_quem_somos"},
    {"quando": "recusou de forma simples, sem contestar",
     "exemplos": ["Não", "Não tenho interesse", "Deixa pra lá", "Agora não"],
     "vai_para": "encerrar_sem_acordo"},
    {"quando": "pediu para não receber mais mensagens ou para tirar do cadastro",
     "exemplos": ["Não me manda mais nada", "Tira meu número", "Para de me mandar mensagem"],
     "vai_para": "encerrar_nao_perturbe"},
    {"quando": "citou advogado, Procon, justiça, delegacia ou disse que vai denunciar",
     "exemplos": ["Vou no Procon", "Meu advogado vai ver isso", "Vou denunciar"],
     "vai_para": "escalar_juridico"},
    {"quando": "ficou hostil, xingou ou ameaçou",
     "exemplos": ["Vai se ferrar", "Bando de ladrão", "Some daqui"],
     "vai_para": "escalar_hostil"},
    {"quando": "pediu para falar com uma pessoa de verdade",
     "exemplos": ["Quero falar com um atendente", "Tem gente aí?", "Me passa pra um humano"],
     "vai_para": "escalar"},
]

# A pessoa não é a titular, mas sabe de quem é o número certo. Pedido explícito do dono.
INSTRUCAO_TERCEIRO = (
    "Este número não é da pessoa procurada, mas quem respondeu sabe quem ela é ou se ofereceu para "
    "avisar. Agradeça, e peça de forma objetiva o número de contato correto — uma pergunta só.\n\n"
    "NÃO revele valor, vencimento, CPF nem qualquer detalhe da pendência a esta pessoa: ela é um "
    "terceiro. Diga apenas que é um assunto financeiro em nome de {{nome}} e que precisa falar "
    "diretamente com a pessoa.\n\n"
    "Se ela passar o número, agradeça, confirme que vai registrar e encerre. Se ela preferir apenas "
    "avisar a pessoa, agradeça, deixe claro que a MC Cred é quem trata o assunto e encerre. Se ela "
    "não quiser ajudar, agradeça e encerre sem insistir."
)


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


def sql(env, query):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{env['SUPABASE_PROJECT_ID']}/database/query",
        data=json.dumps({"query": query}).encode("utf-8"),
        headers={"Authorization": f"Bearer {env['SUPABASE_ACCESS_TOKEN']}",
                 "Content-Type": "application/json",
                 # Sem User-Agent explícito a Management API devolve 403 para o urllib.
                 "User-Agent": "savan-recupera/roteiro-v8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def literal(texto):
    """Literal SQL seguro: aspas dobradas, nada de concatenação de entrada externa."""
    return "'" + str(texto).replace("'", "''") + "'"


def transformar(roteiro):
    novo = copy.deepcopy(roteiro)
    etapas = novo.get("etapas", [])
    por_id = {e.get("id"): e for e in etapas}
    mudancas = []

    # 1) A abordagem passa a se identificar por completo, e a entrada do fluxo vira `identificar`.
    disparo = next((e for e in etapas if e.get("tipo") == "disparo"), None)
    if disparo is None:
        raise SystemExit("erro: o roteiro não tem bloco de disparo")
    disparo["textos"] = TEXTOS_ABORDAGEM
    disparo["casos"] = [{"quando": "a pessoa responder", "vai_para": "identificar"}]
    mudancas.append("abordagem: 3 textos novos (identificação completa) e entrada → identificar")

    # 2) `identificar` deixa de ser um pedágio. Quem pergunta do que se trata recebe a resposta —
    #    era esse o impasse: a pessoa não confirmava sem saber, e o robô não dizia sem confirmar.
    ident = por_id.get("identificar")
    if ident is None:
        raise SystemExit("erro: o roteiro não tem a etapa identificar")
    ident["instrucao"] = (
        "A primeira mensagem já disse quem somos, de onde vem a pendência, o valor e o vencimento, "
        "e perguntou se é a pessoa certa. Aqui você só resolve QUEM é.\n\n"
        "Se a pessoa confirmar, ou se ela perguntar qualquer coisa sobre o assunto, siga para "
        "apresentar tudo. NUNCA responda a uma pergunta sobre o assunto com outro pedido de "
        "confirmação: foi isso que travou as conversas reais, com a pessoa perguntando “sobre o "
        "que?” e recebendo “confirma seu nome?” duas vezes seguidas.\n\n"
        "Não repita o valor nem o vencimento enquanto não souber que é a pessoa — eles já foram "
        "ditos uma vez e repetir para quem talvez não seja a titular só aumenta a exposição."
    )
    casos_ident = [
        {"quando": "confirmou que é a pessoa procurada",
         "exemplos": ["Sou eu", "Sim", "É comigo mesmo", "Isso", "Pode falar"],
         "vai_para": "apresentar_tudo"},
        {"quando": "perguntou do que se trata, pediu mais detalhes ou disse que não confirma sem saber",
         "exemplos": ["Sobre o que?", "É sobre o que? não confirmo nada sem saber",
                      "Que dívida?", "Explica melhor", "De que se trata?"],
         "vai_para": "apresentar_tudo"},
    ]
    # Preserva as saídas que já existiam (pessoa errada, falecimento, jurídico, não perturbe…),
    # menos as duas que acabamos de reescrever e a que criava o beco sem saída.
    descartar = {"apresentar_tudo", "abrir_assunto", "encerrar_identidade_nao_confirmada"}
    for c in ident.get("casos", []):
        if c.get("vai_para") in descartar:
            continue
        if re.search(r"confirmou que é a pessoa", str(c.get("quando", "")), re.I):
            continue
        casos_ident.append(c)
    ident["casos"] = casos_ident
    mudancas.append("identificar: pergunta sobre o assunto passa a ser respondida, não repelida")

    # 3) A etapa nova — a mensagem única com tudo.
    apresentar = {
        "id": "apresentar_tudo",
        "tipo": "conversa",
        "titulo": "Apresentar tudo de uma vez",
        "instrucao": INSTRUCAO_APRESENTAR_TUDO,
        "casos": CASOS_APRESENTAR_TUDO,
    }
    if "apresentar_tudo" in por_id:
        etapas[etapas.index(por_id["apresentar_tudo"])] = apresentar
    else:
        etapas.insert(etapas.index(ident) + 1, apresentar)
    mudancas.append("apresentar_tudo: etapa nova, uma mensagem com dados + oferta + endereço")

    # 4) Número de terceiro: pedir o contato certo, sem vazar a dívida para quem atendeu.
    terceiro = por_id.get("terceiro_indica_contato")
    if terceiro is not None:
        terceiro["instrucao"] = INSTRUCAO_TERCEIRO
        mudancas.append("terceiro_indica_contato: pede o número certo e não revela a pendência")

    # 5) O portão de licença sai do caminho. A etapa fica no roteiro (nada é apagado), mas nenhuma
    #    outra aponta para ela — a identificação completa na abordagem ocupou o lugar dela.
    if "optin" in por_id:
        for e in etapas:
            for c in e.get("casos", []):
                if c.get("vai_para") == "optin":
                    c["vai_para"] = "identificar"
        mudancas.append("optin: deixa de ser a entrada (etapa preservada, sem ninguém apontando)")

    return novo, mudancas


def validar(roteiro):
    """Checagens da skill `fluxo-do-robo` que dá para automatizar."""
    etapas = roteiro.get("etapas", [])
    ids = {e.get("id") for e in etapas}
    problemas = []

    for e in etapas:
        for c in e.get("casos", []):
            destino = c.get("vai_para")
            if destino and destino not in ids:
                problemas.append(f"{e.get('id')}: vai_para aponta para etapa inexistente ({destino})")

    # Só o bloco de disparo passa pelo renderizador do `campanha-lote`. As mensagens de
    # pós-pagamento são montadas em outro lugar, com outro conjunto de variáveis — checá-las com
    # esta lista acusaria erro em texto que funciona.
    variaveis_ok = {"primeiro_nome", "nome", "credor", "nome_bot", "saudacao",
                    "valor", "vencimento", "ano"}
    for e in etapas:
        if e.get("tipo") != "disparo":
            continue
        for t in e.get("textos", []) or []:
            for v in re.findall(r"\{\{\s*([a-z_]+)\s*\}\}", t):
                if v not in variaveis_ok:
                    problemas.append(f"{e.get('id')}: variável {{{{{v}}}}} não existe no campanha-lote")

    alcancaveis = {d for e in etapas for c in e.get("casos", []) if (d := c.get("vai_para"))}
    for saida in ("encerrar_nao_perturbe", "escalar", "escalar_juridico"):
        if saida in ids and saida not in alcancaveis:
            problemas.append(f"{saida} existe mas nenhuma etapa leva até lá")

    if "<<PREENCHER" in json.dumps(roteiro, ensure_ascii=False):
        problemas.append("o endereço da MC Cred continua com o placeholder")

    return problemas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true", help="insere a v8 como rascunho")
    ap.add_argument("--previa", action="store_true", help="só imprime o que mudaria")
    args = ap.parse_args()
    if not args.gravar and not args.previa:
        ap.error("escolha --previa ou --gravar")

    env = carregar_env()
    r = sql(env, f"select roteiro from carteiras where id = {CARTEIRA};")
    if not r:
        raise SystemExit("erro: carteira não encontrada")
    atual = r[0]["roteiro"]

    novo, mudancas = transformar(atual)
    problemas = validar(novo)

    print("MUDANÇAS")
    for m in mudancas:
        print(f"  · {m}")
    print(f"\netapas: {len(atual.get('etapas', []))} → {len(novo.get('etapas', []))}")

    print("\nPRIMEIRA MENSAGEM (variação 1, spintax por resolver)")
    print("  " + TEXTOS_ABORDAGEM[0].replace("\n", "\n  "))

    if problemas:
        print("\nPROBLEMAS")
        for p in problemas:
            print(f"  ! {p}")

    if args.previa:
        print("\n(prévia — nada foi gravado)")
        return 0

    if problemas:
        print("\nNão gravei: resolva os problemas acima primeiro.", file=sys.stderr)
        return 1

    prox = sql(env, f"select coalesce(max(versao), 0) + 1 as v from fluxo_versoes where carteira_id = {CARTEIRA};")
    versao = prox[0]["v"]
    sql(env, (
        "insert into fluxo_versoes (carteira_id, versao, nome, roteiro) values ("
        f"{CARTEIRA}, {versao}, "
        f"{literal(f'Versão {versao} · tudo esclarecido na abertura (rascunho, não ativada)')}, "
        f"{literal(json.dumps(novo, ensure_ascii=False))}::jsonb);"
    ))
    print(f"\nv{versao} inserida como RASCUNHO. Nada foi ativado — "
          f"`carteiras.roteiro` e `fluxo_versao_ativa_id` continuam na versão antiga.")
    print("Para ativar: abra a carteira no painel, leia a versão e use restaurar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
