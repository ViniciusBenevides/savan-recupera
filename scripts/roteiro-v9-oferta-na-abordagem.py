#!/usr/bin/env python3
"""Gera a versão 9 do fluxo da carteira 11 — a abordagem passa a anunciar a oferta.

DECISÃO DO DONO (03/09/2026): a primeira mensagem, que desde a v8 já se identifica por completo,
passa a dizer também o valor com desconto — "de {{valor}} por {{valor_quitacao}}, {{desconto_pct}}
de desconto". O resto do texto fica exatamente como está.

"Exatamente como está" é literal: este script NÃO carrega um texto pronto. Ele lê o que está no ar
e encaixa a oferta na frase de proposta que já existe, variação por variação. A primeira versão
sobrescrevia com as constantes da v8 e teria desfeito as edições feitas à mão no painel desde
então (o `protocolo {{processo}}` e a redução de três variações para uma).

O QUE MUDA SÓ AQUI (o texto), E O QUE MUDOU NO CÓDIGO JUNTO:
  · `supabase/functions/_shared/oferta.ts` — desconto EFETIVO e o trecho opcional `[[...]]`
  · `supabase/functions/campanha-lote/index.ts` — chama `fn_proposta` por devedor e expõe as duas
    variáveis novas; o render passou a entender `[[...]]`
Sem esse par no ar, este roteiro manda `{{valor_quitacao}}` literal para o devedor. Confira que a
função está deployada antes de ativar a versão.

POR QUE A OFERTA VAI EM `[[...]]`: `fn_proposta` aplica o piso `valor_minimo_pix` DEPOIS do
percentual da faixa. Dívida de R$ 45 com faixa de 60% daria R$ 18, mas o piso sobe para R$ 30 —
33% reais, não 60%. Quando o desconto efetivo não chega a 10 pontos, as duas variáveis vêm vazias e
a frase inteira desaparece; a pessoa recebe só a identificação, e a proposta real é oferecida na
conversa, pela ferramenta, com o número certo. Anunciar um desconto que o Pix não cobra é o que
vira Procon.

O QUE NÃO ENTROU, DE PROPÓSITO:
  · O prazo (`valido_ate` da fn_proposta). Prazo na abordagem é escassez, e escassez é o que faz a
    mensagem ler como golpe — a checklist da skill `fluxo-do-robo` proíbe.
  · A ressalva da prescrição. Decisão do dono em 03/09/2026: "voluntária" segue sendo o único sinal
    na 1ª mensagem, e a prescrição continua sendo dita por inteiro na etapa `apresentar_tudo` assim
    que a pessoa responde.

O QUE ESTE SCRIPT NÃO FAZ: ativar. Insere apenas em `fluxo_versoes`, como rascunho. Nem
`carteiras.roteiro` nem `carteiras.fluxo_versao_ativa_id` são tocados — quem lê o texto de disparo é
`carteiras.roteiro`, então escrever lá mudaria o que 2.634 pessoas recebem no próximo ciclo.

Uso:
    python scripts/roteiro-v9-oferta-na-abordagem.py --previa     # imprime os textos, não escreve
    python scripts/roteiro-v9-oferta-na-abordagem.py --gravar     # insere a v9 como rascunho
"""

import argparse
import copy
import io
import json
import re
import sys
import urllib.request

CARTEIRA = 11

for fluxo in (sys.stdout, sys.stderr):
    try:
        fluxo.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# Idêntico ao da v8 — CNPJ conferido pelos dígitos verificadores em 02/09/2026.
# O texto de abordagem NÃO é escrito aqui, e essa é a correção que mais importa neste arquivo.
#
# A primeira versão deste script carregava as três variações da v8 como constante e sobrescrevia
# `textos`. Entre a v8 e hoje o texto foi editado à mão no painel — `Referência {{processo}}` na
# primeira linha virou `protocolo {{processo}}` no fim do bloco de dados, e as três variações
# viraram uma. Gravar as constantes teria desfeito silenciosamente as duas mudanças.
#
# Então a regra aqui é: o roteiro que está no ar é a verdade. Este script lê os textos atuais,
# sejam quantos forem, e faz UMA emenda cirúrgica em cada um — encaixar a oferta na frase da
# proposta que já existe. O que ele não reconhece, ele recusa em vez de reescrever.

# Onde a emenda entra: logo depois desta expressão, que as três variações da v8 e o texto editado
# à mão têm em comum.
ANCORA_PROPOSTA = "proposta de quitação voluntária"

# A emenda. Inline e entre travessões, para caber na frase que já existe sem refazer a pontuação:
#   com desconto → "…proposta de quitação voluntária — de R$ 1.000,00 por R$ 400,00, 60% de
#                   desconto — disponível para encerrar o registro…"
#   no piso      → "…proposta de quitação voluntária disponível para encerrar o registro…"
# O `[[...]]` é o que faz o trecho sumir inteiro quando as variáveis vêm vazias; sem ele a frase
# sairia quebrada ("de R$ 45,00 por  —  de desconto") para quem cai no piso do Pix.
EMENDA_OFERTA = "[[ — de {{valor}} por {{valor_quitacao}}, {{desconto_pct}} de desconto —]]"

# A abordagem agora anuncia um número. Se a etapa seguinte recalcular e disser outro, a conversa
# perde a credibilidade que a v8 inteira existe para construir — daí esta frase entrar na instrução.
REFORCO_APRESENTAR_TUDO = (
    "\n\nO VALOR JÁ FOI ANUNCIADO: a primeira mensagem pode ter dito o valor com desconto. Chame a "
    "ferramenta de proposta e repita EXATAMENTE o número que ela devolver — é a mesma conta que "
    "gerou o valor da abordagem, então os dois batem. Se a pessoa citar um valor diferente do que "
    "a ferramenta devolve, o certo é o da ferramenta; reconheça a diferença em vez de discutir."
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
                 "User-Agent": "savan-recupera/roteiro-v9"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def literal(texto):
    """Literal SQL seguro: aspas dobradas, nada de concatenação de entrada externa."""
    return "'" + str(texto).replace("'", "''") + "'"


def emendar_oferta(texto):
    """Encaixa a oferta na frase de proposta que o texto já tem. Devolve (novo, motivo_se_pulou)."""
    if "{{valor_quitacao}}" in texto:
        return texto, "já tem a oferta"
    pos = texto.lower().find(ANCORA_PROPOSTA)
    if pos < 0:
        # Recusa em vez de inventar posição: chutar onde a oferta entra num texto que vai para
        # milhares de pessoas é pior do que não mexer e deixar a pessoa editar à mão.
        return texto, f"não achei “{ANCORA_PROPOSTA}” — emende à mão"
    corte = pos + len(ANCORA_PROPOSTA)
    return texto[:corte] + EMENDA_OFERTA + texto[corte:], None


def transformar(roteiro):
    novo = copy.deepcopy(roteiro)
    etapas = novo.get("etapas", [])
    por_id = {e.get("id"): e for e in etapas}
    mudancas = []

    disparo = next((e for e in etapas if e.get("tipo") == "disparo"), None)
    if disparo is None:
        raise SystemExit("erro: o roteiro não tem bloco de disparo")

    textos = disparo.get("textos") or []
    if not textos:
        raise SystemExit("erro: o bloco de disparo não tem nenhum texto")

    novos, pulados = [], []
    for i, t in enumerate(textos, 1):
        emendado, motivo = emendar_oferta(t)
        novos.append(emendado)
        if motivo:
            pulados.append(f"variação {i}: {motivo}")
    if len(novos) == len(pulados):
        raise SystemExit("erro: nenhuma variação pôde receber a oferta:\n  " + "\n  ".join(pulados))

    disparo["textos"] = novos
    mudancas.append(f"abordagem: oferta encaixada em {len(novos) - len(pulados)} de {len(novos)} variação(ões)")
    for p in pulados:
        mudancas.append(f"abordagem: PULADA — {p}")

    # A abordagem passou a citar um número; a etapa que negocia precisa saber disso.
    apresentar = por_id.get("apresentar_tudo")
    if apresentar is None:
        raise SystemExit("erro: a etapa apresentar_tudo não existe — rode a v8 antes desta")
    if "O VALOR JÁ FOI ANUNCIADO" not in str(apresentar.get("instrucao", "")):
        apresentar["instrucao"] = str(apresentar.get("instrucao", "")) + REFORCO_APRESENTAR_TUDO
        mudancas.append("apresentar_tudo: instrução de repetir o valor da ferramenta, não recalcular")

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

    # Espelha `vars` em supabase/functions/campanha-lote/index.ts. Quando uma variável nova entrar
    # lá, ela precisa entrar aqui — é esta lista que impede um {{...}} vazio chegar ao devedor.
    variaveis_ok = {"primeiro_nome", "nome", "credor", "nome_bot", "saudacao",
                    "valor", "vencimento", "ano", "cpf_final", "processo",
                    "valor_quitacao", "desconto_pct"}
    # Estas duas ficam vazias em quem cai no piso do Pix. Fora de um trecho `[[...]]`, isso vira
    # uma frase quebrada na mensagem de 2.634 pessoas — a validação existe para não deixar passar.
    so_em_opcional = {"valor_quitacao", "desconto_pct"}

    for e in etapas:
        if e.get("tipo") != "disparo":
            continue
        for t in e.get("textos", []) or []:
            for v in re.findall(r"\{\{\s*([a-z_]+)\s*\}\}", t):
                if v not in variaveis_ok:
                    problemas.append(f"{e.get('id')}: variável {{{{{v}}}}} não existe no campanha-lote")
            fora = re.sub(r"\[\[[\s\S]*?\]\]", "", t)
            for v in re.findall(r"\{\{\s*([a-z_]+)\s*\}\}", fora):
                if v in so_em_opcional:
                    problemas.append(
                        f"{e.get('id')}: {{{{{v}}}}} está fora de [[...]] — sai vazia em quem cai no piso")
            if t.count("[[") != t.count("]]"):
                problemas.append(f"{e.get('id')}: colchetes de trecho opcional desbalanceados")

    alcancaveis = {d for e in etapas for c in e.get("casos", []) if (d := c.get("vai_para"))}
    for saida in ("encerrar_nao_perturbe", "escalar", "escalar_juridico"):
        if saida in ids and saida not in alcancaveis:
            problemas.append(f"{saida} existe mas nenhuma etapa leva até lá")

    # Escassez: a oferta entrou, e é junto dela que prazo e urgência costumam entrar sem ninguém ver.
    for e in etapas:
        if e.get("tipo") not in ("disparo", "followup"):
            continue
        for t in e.get("textos", []) or []:
            for termo in ("última chance", "ultima chance", "prazo", "expira", "válido até",
                          "valido ate", "só hoje", "so hoje", "urgente"):
                if termo in t.lower():
                    problemas.append(f"{e.get('id')}: escassez no texto (“{termo}”)")

    if "<<PREENCHER" in json.dumps(roteiro, ensure_ascii=False):
        problemas.append("o endereço da MC Cred continua com o placeholder")

    return problemas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true", help="insere a v9 como rascunho")
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

    # Antes/depois lado a lado: é isso que torna a mudança revisável por quem decide o texto.
    disparo_antes = next(e for e in atual["etapas"] if e.get("tipo") == "disparo")
    disparo_depois = next(e for e in novo["etapas"] if e.get("tipo") == "disparo")
    antes = (disparo_antes.get("textos") or [""])[0]
    depois = (disparo_depois.get("textos") or [""])[0]

    def bloco(titulo, texto):
        print(f"\n{titulo}")
        print("  " + texto.replace("\n", "\n  "))

    bloco("HOJE (variação 1, como está no ar)", antes)
    bloco("COM OFERTA (quem tem desconto)", depois.replace("[[", "").replace("]]", ""))
    bloco("NO PISO DO PIX (o trecho da oferta some)",
          re.sub(r"\[\[[\s\S]*?\]\]", "", depois))

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
        f"{literal(f'Versão {versao} · oferta na abordagem (rascunho, não ativada)')}, "
        f"{literal(json.dumps(novo, ensure_ascii=False))}::jsonb);"
    ))
    print(f"\nv{versao} inserida como RASCUNHO. Nada foi ativado — "
          f"`carteiras.roteiro` e `fluxo_versao_ativa_id` continuam na versão antiga.")
    print("Antes de ativar: confirme que o campanha-lote novo está deployado, ou a mensagem sai "
          "com {{valor_quitacao}} literal.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
