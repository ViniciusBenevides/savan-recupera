#!/usr/bin/env python3
"""Gera a versão 16 do fluxo da carteira 11 — a primeira mensagem passa a seguir o modelo "QUERO PAGAR".

DECISÃO DO DONO (24/09/2026): a abordagem deixa o texto institucional da v8/v9 (cessão, CPF final,
protocolo, CNPJ e "confirma que falo com a titular?") e passa a ser uma oferta direta:

    Olá, Miqueias Silva Gomes! Tudo bem?
    Aqui é da MC CRED, responsável pelas negociações da SAVAN Calçados.
    Identificamos um acordo em aberto no valor de R$ 165,00 e conseguimos liberar uma condição
    especial para quitação por apenas R$ 77,00.
    Com a regularização, você encerra essa pendência e poderá voltar a ter relacionamento
    comercial com a SAVAN, conforme as políticas da loja.
    Se quiser aproveitar essa condição, responda apenas “QUERO PAGAR” e envio as orientações
    para pagamento.

O QUE MUDA, ETAPA POR ETAPA:
  · abordagem — o texto acima, com {{nome}}, {{valor}} e {{valor_quitacao}}. A frase do desconto vai
    em `[[...]]`: quem cai no piso do Pix (134 de 1.942 na fila em 24/09) recebe a mensagem sem ela,
    em vez de "por apenas " com o valor vazio. Duas trocas de spintax ({Olá|Oi}, {Identificamos|
    Localizamos}) para duas pessoas não receberem o texto idêntico, que é sinal de robô.
  · identificar — a abordagem deixou de perguntar se é a pessoa certa. A instrução dizia o contrário
    e o modelo ia perguntar de novo. Entra o caso "QUERO PAGAR → pagamento" na frente.
  · pagamento — quem chega direto do "QUERO PAGAR" pula `apresentar_tudo`, que é onde a prescrição e
    o "é voluntário" eram ditos (decisão do dono de 03/09/2026: dizer por inteiro assim que a pessoa
    responde). A mensagem do Pix passa a levar essa frase nesse caso.

PENDENTE NO CÓDIGO (contexto-projeto.md §46): com o `bot-turno` de hoje, a barreira de identidade
responde "QUERO PAGAR" com "falo com Fulano?", e só depois do "sim" a conversa anda — funciona, com
duas mensagens a mais. Tratar "QUERO PAGAR" como confirmação de identidade libera CPF e origem da
dívida a quem estiver com o número, então é decisão do dono, não deste script.

O QUE ESTE SCRIPT NÃO FAZ: ativar. Insere apenas em `fluxo_versoes`, como rascunho — quem lê o texto
de disparo é `carteiras.roteiro`, e trocar o que está lá muda o que 1.942 pessoas recebem no próximo
ciclo. A ativação é pelo painel (Fluxo do robô → versões).

Uso:
    python scripts/roteiro-v16-quero-pagar.py --previa     # imprime os textos, não escreve
    python scripts/roteiro-v16-quero-pagar.py --gravar     # insere a v16 como rascunho
"""

import argparse
import copy
import importlib.util
import json
import pathlib
import re
import sys

CARTEIRA = 11

for fluxo in (sys.stdout, sys.stderr):
    try:
        fluxo.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# Conexão, literal SQL e as checagens da skill `fluxo-do-robo` vêm da v9. A lista de variáveis que
# existem no `campanha-lote` mora lá; duplicá-la aqui faria as duas divergirem na próxima variável.
_spec = importlib.util.spec_from_file_location(
    "roteiro_v9", pathlib.Path(__file__).with_name("roteiro-v9-oferta-na-abordagem.py"))
v9 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v9)

ABORDAGEM = (
    "{Olá|Oi}, {{nome}}! Tudo bem?\n\n"
    "Aqui é da MC CRED, responsável pelas negociações da SAVAN Calçados.\n\n"
    "{Identificamos|Localizamos} um acordo em aberto no valor de {{valor}}"
    "[[ e conseguimos liberar uma condição especial para quitação por apenas {{valor_quitacao}}]].\n\n"
    "Com a regularização, você encerra essa pendência e poderá voltar a ter relacionamento comercial "
    "com a SAVAN, conforme as políticas da loja.\n\n"
    "Se quiser aproveitar essa condição, responda apenas “QUERO PAGAR” e envio as orientações para pagamento."
)

IDENTIFICAR_OBJETIVO = "2. Resposta à primeira mensagem"

IDENTIFICAR_INSTRUCAO = (
    "A primeira mensagem já disse quem somos (MC Cred, que negocia as contas da SAVAN Calçados), o "
    "valor em aberto e, quando havia desconto, o valor para quitar — e pediu que a pessoa responda "
    "“QUERO PAGAR” se quiser seguir. Ela NÃO perguntou se é a pessoa certa. Aqui você lê a resposta "
    "e segue o caso certo.\n\n"
    "Quem respondeu “QUERO PAGAR”, ou disse de outro jeito que quer pagar, vai direto para o "
    "pagamento. Não peça nome, não peça confirmação, não repita a proposta e não pergunte de novo se "
    "quer: a pessoa respondeu exatamente o que a mensagem pediu.\n\n"
    "Se a pessoa perguntar qualquer coisa sobre o assunto, siga para apresentar tudo. NUNCA responda a "
    "uma pergunta sobre o assunto com um pedido de confirmação: foi isso que travou as conversas "
    "reais, com a pessoa perguntando “sobre o que?” e recebendo “confirma seu nome?” duas vezes "
    "seguidas.\n\n"
    "Não repita o valor enquanto não souber que é a pessoa — ele já foi dito uma vez, e repetir para "
    "quem talvez não seja a titular só aumenta a exposição."
)

# Sem a palavra "sim" (nem "assim"): o bot-turno acha o destino do "sim" pelo primeiro caso cujo
# texto casa com /confirmou|e a pessoa|sim/, e este caso não pode ser confundido com aquele.
CASO_QUERO_PAGAR = {
    "quando": "respondeu “QUERO PAGAR”, disse de outro jeito que quer pagar ou pediu o Pix",
    "vai_para": "pagamento",
}

REFORCO_PAGAMENTO = (
    "\n\nQUEM VEIO DIRETO DA PRIMEIRA MENSAGEM (respondeu “QUERO PAGAR”) ainda não ouviu que o "
    "pagamento é voluntário. Nesse caso, a mensagem do Pix leva UMA frase curta dizendo que é uma "
    "conta antiga, já prescrita, e que pagar é voluntário, sem nenhuma consequência para quem preferir "
    "não pagar. Sem discurso e sem segurar o Pix: gere no mesmo turno. Quem passou por apresentar "
    "tudo já ouviu isso — não repita."
)


def transformar(roteiro):
    novo = copy.deepcopy(roteiro)
    etapas = novo.get("etapas", [])
    por_id = {e.get("id"): e for e in etapas}
    mudancas = []

    disparo = next((e for e in etapas if e.get("tipo") == "disparo"), None)
    if disparo is None:
        raise SystemExit("erro: o roteiro não tem bloco de disparo")
    disparo["textos"] = [ABORDAGEM]
    disparo["objetivo"] = "Primeira mensagem — oferta com “QUERO PAGAR”"
    mudancas.append("abordagem: texto trocado pelo modelo “QUERO PAGAR” (1 variação, com spintax)")
    # `textos_recontato` fica como está: só vale para o balde recontato_continuidade, que tem 0
    # pessoas na fila hoje, e o modelo novo é de primeiro contato.

    for id_ in ("identificar", "pagamento"):
        if id_ not in por_id:
            raise SystemExit(f"erro: a etapa {id_} não existe no roteiro que está no ar")
    if any(c.get("vai_para") == "identificar" for c in disparo.get("casos", [])) is False:
        raise SystemExit("erro: a abordagem não leva mais a `identificar` — revise antes de rodar")

    identificar = por_id["identificar"]
    identificar["objetivo"] = IDENTIFICAR_OBJETIVO
    identificar["instrucao"] = IDENTIFICAR_INSTRUCAO
    casos = identificar.get("casos", [])
    if not any(c.get("vai_para") == "pagamento" for c in casos):
        identificar["casos"] = [dict(CASO_QUERO_PAGAR)] + casos
    mudancas.append("identificar: instrução reescrita (a abordagem não pergunta mais quem é) + caso QUERO PAGAR → pagamento")

    pagamento = por_id["pagamento"]
    if "QUEM VEIO DIRETO DA PRIMEIRA MENSAGEM" not in str(pagamento.get("instrucao", "")):
        pagamento["instrucao"] = str(pagamento.get("instrucao", "")) + REFORCO_PAGAMENTO
        mudancas.append("pagamento: frase de pagamento voluntário para quem pulou apresentar_tudo")

    return novo, mudancas


def validar(roteiro):
    problemas = v9.validar(roteiro)
    identificar = next(e for e in roteiro["etapas"] if e.get("id") == "identificar")
    primeiro_sim = next((c for c in identificar.get("casos", [])
                         if re.search(r"confirmou|e a pessoa|sim", str(c.get("quando", "")), re.I)), None)
    if primeiro_sim is None or primeiro_sim.get("vai_para") == "pagamento":
        problemas.append("identificar: o bot-turno leria o caso do QUERO PAGAR como o destino do “sim”")
    return problemas


def exemplo(texto, com_oferta):
    """Renderiza como o campanha-lote faria, com a primeira opção de cada spintax."""
    t = re.sub(r"\{([^{}]*\|[^{}]*)\}", lambda m: m.group(1).split("|")[0], texto)
    if com_oferta:
        t = t.replace("[[", "").replace("]]", "")
    else:
        t = re.sub(r"\[\[[\s\S]*?\]\]", "", t)
    valores = {"nome": "Miqueias Silva Gomes", "valor": "R$ 165,00", "valor_quitacao": "R$ 77,00"}
    return re.sub(r"\{\{\s*([a-z_]+)\s*\}\}", lambda m: valores.get(m.group(1), ""), t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true", help="insere a v16 como rascunho")
    ap.add_argument("--previa", action="store_true", help="só imprime o que mudaria")
    args = ap.parse_args()
    if not args.gravar and not args.previa:
        ap.error("escolha --previa ou --gravar")

    env = v9.carregar_env()
    r = v9.sql(env, f"select roteiro from carteiras where id = {CARTEIRA};")
    if not r:
        raise SystemExit("erro: carteira não encontrada")
    atual = r[0]["roteiro"]

    novo, mudancas = transformar(atual)
    problemas = validar(novo)

    print("MUDANÇAS")
    for m in mudancas:
        print(f"  · {m}")
    print(f"\netapas: {len(atual.get('etapas', []))} → {len(novo.get('etapas', []))}")

    def bloco(titulo, texto):
        print(f"\n{titulo}")
        print("  " + texto.replace("\n", "\n  "))

    antes = next(e for e in atual["etapas"] if e.get("tipo") == "disparo")["textos"][0]
    bloco("HOJE (como está no ar)", antes)
    bloco("V16 — COM DESCONTO", exemplo(ABORDAGEM, True))
    bloco("V16 — NO PISO DO PIX (a frase do desconto some)", exemplo(ABORDAGEM, False))

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

    prox = v9.sql(env, f"select coalesce(max(versao), 0) + 1 as v from fluxo_versoes where carteira_id = {CARTEIRA};")
    versao = prox[0]["v"]
    v9.sql(env, (
        "insert into fluxo_versoes (carteira_id, versao, nome, roteiro) values ("
        f"{CARTEIRA}, {versao}, "
        f"{v9.literal(f'Versão {versao} · primeira mensagem QUERO PAGAR (rascunho, não ativada)')}, "
        f"{v9.literal(json.dumps(novo, ensure_ascii=False))}::jsonb);"
    ))
    print(f"\nv{versao} inserida como RASCUNHO. Nada foi ativado — "
          f"`carteiras.roteiro` e `fluxo_versao_ativa_id` continuam na versão antiga.")
    print("Antes de ativar: leia o §46 do contexto-projeto.md (o QUERO PAGAR passa pela confirmação de identidade).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
