#!/usr/bin/env python3
"""Gera a versão 18 do fluxo da carteira 11 — promessa com data e pagamento sem Pix.

POR QUE (conversa real de 29/09/2026, fluxo v15):
  · "Eu quero pagar mais recebo dia 6" — `apresentar_tudo` não tinha saída para promessa com data.
    A frase cabia em "quer pagar" e em "sem condições", nenhuma das duas era a certa, e a etapa
    `agendar_retorno`, que existe exatamente para isso, não era alcançável dali.
  · "Eu não tenho pix" — nenhuma etapa tratava. O robô improvisou e disse que no escritório a pessoa
    "recebe o termo de quitação na hora". Isso não está no fluxo nem na base de Conhecimento (a
    entrada #2 diz só que existe atendimento presencial no endereço da bio).

O QUE MUDA:
  · apresentar_tudo — duas saídas novas, na frente das que as engoliam: "quer pagar, mas numa data
    que indicou" → agendar_retorno; "não tem Pix / quer pagar pessoalmente ou na loja" →
    quer_pagar_na_loja. A saída "pagamento" fica explicitamente para quem quer pagar agora.
  · pagamento — a mesma saída "não tem Pix", para quem diz isso depois de o Pix ser gerado.
  · quer_pagar_na_loja — passa a cobrir também quem não tem Pix ou quer pagar pessoalmente. Só
    oferece o que existe (Pix ou presencial na MC Cred), e diz o que o robô NÃO sabe e não pode
    prometer: horário do escritório, como o termo é entregue no presencial, qualquer prazo. Quem não
    pode ir e não tem Pix vai para uma pessoa da equipe (`escalar`).

Nenhuma etapa nova, nenhum id renomeado, a primeira mensagem não muda. Conversas que já começaram
continuam na versão em que começaram (§35); a v18 vale para as que começarem depois de ativada.

Uso:
    python scripts/roteiro-v18-formas-de-pagamento.py --previa [--saida arquivo.json]
    python scripts/roteiro-v18-formas-de-pagamento.py --gravar     # rascunho, sem ativar
    python scripts/roteiro-v18-formas-de-pagamento.py --ativar     # insere E ativa, numa instrução só
"""

import argparse
import copy
import importlib.util
import json
import pathlib
import sys

CARTEIRA = 11
NOME_VERSAO = "promessa com data e pagamento sem Pix"

for fluxo in (sys.stdout, sys.stderr):
    try:
        fluxo.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

_spec = importlib.util.spec_from_file_location(
    "roteiro_v9", pathlib.Path(__file__).with_name("roteiro-v9-oferta-na-abordagem.py"))
v9 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v9)

ENDERECO = ("Ed Central Sector, Condomínio Edifício Parthenon Center — R. 4, 515, sala 1619, "
            "Setor Central, Goiânia - GO, 74020-045")

CASO_DATA = {
    "quando": "quer pagar, mas só numa data que ela mesma indicou (quando receber, dia X, semana que vem)",
    "vai_para": "agendar_retorno",
    "exemplos": ["Eu quero pagar mas só recebo dia 6", "Quando eu receber eu pago",
                 "Dia 10 eu faço o pix", "Só no começo do mês"],
}

CASO_SEM_PIX = {
    "quando": "disse que não tem Pix, não usa Pix, quer pagar pessoalmente ou na loja SAVAN",
    "vai_para": "quer_pagar_na_loja",
    "exemplos": ["Eu não tenho pix", "Não sei usar pix", "Posso pagar pessoalmente?",
                 "Vou pagar na loja"],
}

PAGAR_AGORA = "aceitou a condição, disse que quer pagar agora ou pediu o Pix"

FORMAS_OBJETIVO = "4e. Pagar sem Pix, na loja ou pessoalmente — só as formas que existem"

FORMAS_INSTRUCAO = (
    "Três pedidos caem aqui: pagar na loja SAVAN, pagar pessoalmente, ou não ter / não usar Pix. Nos três, "
    "você só oferece o que existe de verdade: o Pix da MC Cred, ou o atendimento presencial da MC Cred no "
    f"{ENDERECO} — o mesmo endereço da bio deste WhatsApp.\n\n"
    "LOJA SAVAN: isso NÃO é possível e você nunca pode concordar, nem por educação, nem com 'fique à "
    "vontade'. Concordar e corrigir depois já aconteceu e gerou uma sequência de mensagens de correção que "
    "destruiu a confiança. Corrija na PRIMEIRA resposta, sem rodeio e sem soar burocrática: a carteira foi "
    "cedida à MC Cred, que hoje é quem dá a quitação.\n\n"
    "NÃO TEM PIX: acolha sem julgar — muita gente da base não usa. Apresente as duas formas que existem. Se "
    "a pessoa não for de Goiânia, disser que não pode ir ou já tiver contado que está doente, não empurre o "
    "presencial: diga que uma pessoa da equipe combina outra forma de pagamento com ela, e siga para "
    "escalar. Nunca sugira pedir o Pix emprestado, pedir a alguém da família ou dividir com outra pessoa.\n\n"
    "O QUE VOCÊ NÃO SABE, E POR ISSO NÃO DIZ: horário de funcionamento do escritório, como o termo de "
    "quitação é entregue no atendimento presencial, e prazo de qualquer coisa. Em 29/09/2026 o robô disse "
    "que no escritório a pessoa 'recebe o termo de quitação na hora' — isso não está escrito em lugar "
    "nenhum, e promessa inventada é o que vira reclamação. Se perguntarem, diga que a equipe do escritório "
    "orienta tudo no atendimento. O que é certo e pode ser dito: pelo Pix, o termo chega aqui "
    "automaticamente depois que o pagamento é confirmado.\n\n"
    "MODELO (loja SAVAN): \"Ah, importante avisar antes que você se desloque: essa conta não é mais paga na "
    "loja SAVAN. A carteira foi cedida à MC Cred, que é quem emite a quitação hoje. Dá para resolver por Pix "
    "aqui mesmo em um minuto, ou presencialmente na MC Cred, no Ed Central Sector — R. 4, 515, sala 1619, "
    "Setor Central, Goiânia. O endereço também está na bio deste WhatsApp. Quer que eu gere o Pix?\"\n"
    "MODELO (não tem Pix): \"Sem problema, Maria — muita gente não usa. Hoje dá para quitar de duas formas: "
    "pelo Pix, ou pessoalmente na MC Cred, no Ed Central Sector — R. 4, 515, sala 1619, Setor Central, "
    "Goiânia. Se ficar difícil ir até lá, uma pessoa da nossa equipe combina outra forma com você. O que "
    "fica melhor pra você?\""
)

CASO_OUTRA_FORMA = {
    "quando": "não tem Pix e não pode ir ao escritório, pediu outra forma de pagar ou pediu para falar com uma pessoa",
    "vai_para": "escalar",
    "exemplos": ["Não moro em Goiânia", "Não tenho como ir aí", "Tem boleto?", "Quero falar com alguém"],
}

# A etapa não tinha saída para hostilidade nem para quem pede para parar (checklist da skill
# `fluxo-do-robo`). Opt-out explícito e advogado/Procon o código já pega antes da IA; estas são a rede.
CASOS_PROTECAO = [
    {"quando": "ficou hostil, xingou ou ameaçou", "vai_para": "escalar_hostil",
     "exemplos": ["Vocês são uns ladrões", "Vai se ferrar"]},
    {"quando": "pediu para não receber mais mensagens", "vai_para": "encerrar_nao_perturbe",
     "exemplos": ["Não me manda mais nada", "Tira meu número"]},
]


def _inserir_antes(casos, novo, antes_de):
    """Põe `novo` antes do primeiro caso que vai para `antes_de` (ou no fim), sem duplicar."""
    if any(c.get("vai_para") == novo["vai_para"] and c.get("quando") == novo["quando"] for c in casos):
        return casos
    for i, c in enumerate(casos):
        if c.get("vai_para") == antes_de:
            return casos[:i] + [dict(novo)] + casos[i:]
    return casos + [dict(novo)]


def transformar(roteiro):
    novo = copy.deepcopy(roteiro)
    por_id = {e.get("id"): e for e in novo.get("etapas", [])}
    for id_ in ("apresentar_tudo", "pagamento", "quer_pagar_na_loja", "agendar_retorno", "escalar",
                "escalar_hostil", "encerrar_nao_perturbe"):
        if id_ not in por_id:
            raise SystemExit(f"erro: a etapa {id_} não existe no roteiro que está no ar")
    mudancas = []

    apresentar = por_id["apresentar_tudo"]
    casos = apresentar.get("casos", [])
    casos = _inserir_antes(casos, CASO_DATA, "pagamento")
    casos = _inserir_antes(casos, CASO_SEM_PIX, "pagamento")
    for c in casos:
        if c.get("vai_para") == "pagamento":
            c["quando"] = PAGAR_AGORA
    apresentar["casos"] = casos
    mudancas.append("apresentar_tudo: saídas novas para promessa com data e para quem não tem Pix; "
                    "“pagamento” fica para quem quer pagar agora")

    pagamento = por_id["pagamento"]
    pagamento["casos"] = _inserir_antes(pagamento.get("casos", []), CASO_SEM_PIX, "encerrar_promessa")
    mudancas.append("pagamento: saída nova para quem diz, depois do Pix, que não tem Pix")

    formas = por_id["quer_pagar_na_loja"]
    formas["objetivo"] = FORMAS_OBJETIVO
    formas["instrucao"] = FORMAS_INSTRUCAO
    formas["casos"] = _inserir_antes(formas.get("casos", []), CASO_OUTRA_FORMA, "encerrar_sem_acordo")
    for protecao in CASOS_PROTECAO:
        if not any(c.get("vai_para") == protecao["vai_para"] for c in formas["casos"]):
            formas["casos"].append(dict(protecao))
    mudancas.append("quer_pagar_na_loja: cobre também quem não tem Pix; só formas que existem; "
                    "proíbe prometer horário, prazo ou “termo na hora”; sem Pix e sem ir → equipe")
    return novo, mudancas


def validar(roteiro):
    problemas = v9.validar(roteiro)
    por_id = {e.get("id"): e for e in roteiro.get("etapas", [])}
    # a regra do bot-turno: o destino do "sim" em identificar é o 1º caso que casa com esta expressão
    import re
    identificar = por_id.get("identificar", {})
    primeiro_sim = next((c for c in identificar.get("casos", [])
                         if re.search(r"confirmou|e a pessoa|sim", str(c.get("quando", "")), re.I)), None)
    if primeiro_sim is None or primeiro_sim.get("vai_para") == "pagamento":
        problemas.append("identificar: destino do “sim” quebrado")
    texto = json.dumps(roteiro, ensure_ascii=False).lower()
    if "na hora" in FORMAS_INSTRUCAO.lower().replace("'recebe o termo de quitação na hora'", ""):
        problemas.append("a instrução nova promete algo 'na hora'")
    if "<<preencher" in texto:
        problemas.append("placeholder esquecido")
    return problemas


def main():
    ap = argparse.ArgumentParser()
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--previa", action="store_true")
    modo.add_argument("--gravar", action="store_true")
    modo.add_argument("--ativar", action="store_true")
    ap.add_argument("--saida", help="com --previa: grava o roteiro novo inteiro neste arquivo")
    args = ap.parse_args()

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
    antes = {e["id"]: e for e in atual["etapas"]}
    for e in novo["etapas"]:
        if e["id"] in ("apresentar_tudo", "pagamento", "quer_pagar_na_loja") and e != antes.get(e["id"]):
            print(f"\n=== {e['id']} — {e.get('objetivo', '')}")
            if e.get("instrucao") != antes[e["id"]].get("instrucao"):
                print("  INSTRUÇÃO NOVA:\n    " + e["instrucao"].replace("\n", "\n    "))
            print("  SAÍDAS:")
            for c in e.get("casos", []):
                marca = "  " if c in antes[e["id"]].get("casos", []) else "+ "
                print(f"    {marca}{c['vai_para']} :: {c['quando']}")

    if problemas:
        print("\nPROBLEMAS")
        for p in problemas:
            print(f"  ! {p}")

    if args.previa:
        if args.saida:
            pathlib.Path(args.saida).write_text(json.dumps(novo, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"\nroteiro novo gravado em {args.saida}")
        print("\n(prévia — nada foi gravado no banco)")
        return 0
    if problemas:
        print("\nNão gravei: resolva os problemas acima primeiro.", file=sys.stderr)
        return 1

    roteiro_sql = f"{v9.literal(json.dumps(novo, ensure_ascii=False))}::jsonb"
    proxima = f"(select coalesce(max(versao), 0) + 1 from fluxo_versoes where carteira_id = {CARTEIRA})"
    if args.gravar:
        feito = v9.sql(env, (
            "insert into fluxo_versoes (carteira_id, versao, nome, roteiro) "
            f"select {CARTEIRA}, {proxima}, {v9.literal(NOME_VERSAO + ' (rascunho, não ativada)')}, {roteiro_sql} "
            "returning versao;"
        ))
        print(f"\nv{feito[0]['versao']} inserida como RASCUNHO. Nada foi ativado.")
        return 0

    # Os três lugares da skill `fluxo-do-robo` numa instrução só (ver roteiro-v17-quero-pagar.py).
    feito = v9.sql(env, (
        "with ativa as ("
        "  select v.id, v.meta_abordagem_template, v.meta_abordagem_template_candidato"
        "  from carteiras c join fluxo_versoes v on v.id = c.fluxo_versao_ativa_id"
        f"  where c.id = {CARTEIRA}"
        "), nova as ("
        "  insert into fluxo_versoes (carteira_id, versao, nome, roteiro, meta_abordagem_template,"
        "                             meta_abordagem_template_candidato, origem_versao_id)"
        f"  select {CARTEIRA}, {proxima}, {v9.literal(NOME_VERSAO)}, {roteiro_sql},"
        "         ativa.meta_abordagem_template, ativa.meta_abordagem_template_candidato, ativa.id"
        "  from ativa returning id, versao, roteiro"
        ") "
        "update carteiras c set roteiro = nova.roteiro, fluxo_versao_ativa_id = nova.id "
        f"from nova where c.id = {CARTEIRA} returning nova.versao, nova.id;"
    ))
    if not feito:
        raise SystemExit("erro: nada foi ativado")
    conferido = v9.sql(env, (
        "select jsonb_array_length(c.roteiro->'etapas') as no_ar, jsonb_array_length(v.roteiro->'etapas') as na_versao, "
        "(c.roteiro = v.roteiro) as igual "
        f"from carteiras c join fluxo_versoes v on v.id = c.fluxo_versao_ativa_id where c.id = {CARTEIRA};"
    ))[0]
    print(f"\nv{feito[0]['versao']} ATIVA. Etapas no ar: {conferido['no_ar']} · na versão: {conferido['na_versao']} · cópia igual: {conferido['igual']}.")
    return 0 if conferido["igual"] and conferido["no_ar"] == conferido["na_versao"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
