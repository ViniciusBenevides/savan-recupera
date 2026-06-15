# -*- coding: utf-8 -*-
"""
SAVAN Recupera — Importação da planilha dividas_savan.xlsx para o Supabase.

Uso:
    python import/importar_planilha.py            # importa tudo
    python import/importar_planilha.py --dry-run  # só analisa e mostra estatísticas

Lê a sheet "ControlDesk", normaliza CPF/datas/telefones e grava em:
  devedores, telefones_devedor, fila_envios
"""
import argparse
import datetime as dt
import re
import sys
import time
from pathlib import Path

import openpyxl
import requests

RAIZ = Path(__file__).resolve().parent.parent
PLANILHA = RAIZ / "dividas_savan.xlsx"

SUPABASE_URL = "https://wmggqsmqvklxlqwsksjs.supabase.co"
SERVICE_KEY = ""  # preenchido via .env

BATCH = 500

DDDs_VALIDOS = set(
    [11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
     41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
     71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]
)


def carregar_service_key():
    global SERVICE_KEY
    env = RAIZ / ".env"
    for linha in env.read_text(encoding="utf-8").splitlines():
        if "service_role supabase" in linha:
            SERVICE_KEY = linha.split(":", 1)[1].strip()
            return
    print("ERRO: service_role não encontrada no .env")
    sys.exit(1)


def normalizar_cpf(valor):
    if valor is None:
        return None
    digitos = re.sub(r"\D", "", str(valor))
    if not digitos:
        return None
    if len(digitos) <= 11:
        return digitos.zfill(11)
    return digitos.zfill(14)


def normalizar_data(valor):
    if valor is None:
        return None
    if isinstance(valor, dt.datetime):
        return valor.date().isoformat()
    if isinstance(valor, dt.date):
        return valor.isoformat()
    s = str(valor).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        d, mes, ano = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return dt.date(ano, mes, d).isoformat()
        except ValueError:
            return None
    return None


def normalizar_telefone(raw, tipo_padrao):
    """Retorna (e164, tipo) ou None. Insere 9º dígito quando celular antigo de 8 dígitos."""
    if raw is None:
        return None
    digitos = re.sub(r"\D", "", str(raw))
    if not digitos:
        return None
    # remove código do país se vier
    if digitos.startswith("55") and len(digitos) in (12, 13):
        digitos = digitos[2:]
    if len(digitos) < 10 or len(digitos) > 11:
        return None
    ddd = int(digitos[:2])
    if ddd not in DDDs_VALIDOS:
        return None
    numero = digitos[2:]
    if len(numero) == 8:
        if numero[0] in "6789":          # celular antigo sem o 9
            numero = "9" + numero
            tipo = "movel"
        elif numero[0] in "2345":        # fixo
            tipo = "fixo"
        else:
            return None
    elif len(numero) == 9:
        if numero[0] != "9":
            return None
        tipo = "movel"
    else:
        return None
    if tipo_padrao == "fixo" and tipo == "movel":
        tipo = "movel"                   # número de celular na coluna de fixo conta como móvel
    return (f"+55{ddd}{numero}", tipo)


def calcular_prioridade(vencimento_iso, saldo):
    """Mais recente e de maior valor primeiro."""
    ano = int(vencimento_iso[:4]) if vencimento_iso else 1990
    return max(0, (ano - 1990)) * 100 + min(99, int((saldo or 0) // 100))


def extrair_emails(*valores):
    vistos, res = set(), []
    for v in valores:
        if not v:
            continue
        for e in re.split(r"[;,\s]+", str(v)):
            e = e.strip().lower()
            if "@" in e and "." in e.split("@")[-1] and e not in vistos:
                vistos.add(e)
                res.append(e)
    return res or None


def parse_planilha():
    print(f"Lendo {PLANILHA.name} ...")
    wb = openpyxl.load_workbook(PLANILHA, read_only=True)
    ws = wb["ControlDesk"]
    linhas = ws.iter_rows(min_row=2, values_only=True)

    devedores, telefones_por_processo = [], {}
    processos_vistos = set()
    stats = dict(total=0, dup_processo=0, sem_cpf=0, com_movel=0, telefones=0,
                 tel_invalidos=0, soma_saldo=0.0)

    for row in linhas:
        if row is None or row[0] is None:
            continue
        stats["total"] += 1
        (processo, saldo, grupo_credor, carteira, cpf, nome, cod_externo, fase,
         negociador, _neg_ant, status_orig, ocorrencia, vencimento, distribuicao,
         email1, email2, emails_ad, fone_fixo, fone_movel) = row[:19]
        uf, cidade, pagamento, tags, motivo = row[29], row[30], row[31], row[32], row[33]

        processo = str(processo).strip()
        if processo in processos_vistos:
            stats["dup_processo"] += 1
            continue
        processos_vistos.add(processo)

        cpf_norm = normalizar_cpf(cpf)
        if not cpf_norm:
            stats["sem_cpf"] += 1
            cpf_norm = "00000000000"

        venc_iso = normalizar_data(vencimento)
        saldo_f = round(float(saldo or 0), 2)
        stats["soma_saldo"] += saldo_f

        # telefones: explode FONE MÓVEL por vírgula + FONE FIXO
        tels, vistos_tel = [], set()
        ordem = 0
        for bruto in re.split(r"[,;/]+", str(fone_movel or "")):
            r = normalizar_telefone(bruto, "movel")
            if r is None:
                if bruto.strip():
                    stats["tel_invalidos"] += 1
                continue
            e164, tipo = r
            if e164 in vistos_tel:
                continue
            vistos_tel.add(e164)
            ordem += 1
            tels.append(dict(telefone_e164=e164, telefone_raw=bruto.strip(),
                             ordem=ordem, tipo=tipo))
        for bruto in re.split(r"[,;/]+", str(fone_fixo or "")):
            r = normalizar_telefone(bruto, "fixo")
            if r is None:
                continue
            e164, tipo = r
            if e164 in vistos_tel:
                continue
            vistos_tel.add(e164)
            ordem += 1
            tels.append(dict(telefone_e164=e164, telefone_raw=bruto.strip(),
                             ordem=ordem, tipo=tipo))

        tem_movel = any(t["tipo"] == "movel" for t in tels)
        if tem_movel:
            stats["com_movel"] += 1
        stats["telefones"] += len(tels)

        devedores.append(dict(
            processo=processo,
            cpf_cnpj=cpf_norm,
            nome=str(nome or "SEM NOME").strip().upper(),
            saldo=saldo_f,
            grupo_credor=grupo_credor and str(grupo_credor).strip(),
            carteira_credor=carteira and str(carteira).strip(),
            cod_externo=cod_externo and str(cod_externo).strip(),
            fase=fase and str(fase).strip(),
            negociador=negociador and str(negociador).strip(),
            status_original=status_orig and str(status_orig).strip(),
            ocorrencia=normalizar_data(ocorrencia) or (ocorrencia and str(ocorrencia).strip()),
            vencimento=venc_iso,
            distribuicao=normalizar_data(distribuicao),
            uf=(str(uf).strip()[:2].upper() if uf else None),
            cidade=cidade and str(cidade).strip(),
            emails=extrair_emails(email1, email2, emails_ad),
            tags=tags and str(tags).strip(),
            motivo_inadimplencia=motivo and str(motivo).strip(),
            status_cobranca="na_fila" if tem_movel else "sem_whatsapp",
            prioridade=calcular_prioridade(venc_iso, saldo_f),
        ))
        telefones_por_processo[processo] = tels

    wb.close()
    return devedores, telefones_por_processo, stats


def post_batches(sessao, tabela, registros, params=None, label=""):
    """Insere em lotes e retorna as representações devolvidas."""
    devolvidos = []
    url = f"{SUPABASE_URL}/rest/v1/{tabela}"
    for i in range(0, len(registros), BATCH):
        lote = registros[i:i + BATCH]
        for tentativa in range(4):
            resp = sessao.post(url, json=lote, params=params or {})
            if resp.status_code in (200, 201):
                if resp.text:
                    devolvidos.extend(resp.json())
                break
            if resp.status_code in (429, 500, 502, 503, 504) and tentativa < 3:
                time.sleep(2 ** tentativa)
                continue
            print(f"\nERRO {tabela} lote {i}: {resp.status_code} {resp.text[:400]}")
            sys.exit(1)
        feito = min(i + BATCH, len(registros))
        print(f"\r  {label or tabela}: {feito}/{len(registros)}", end="", flush=True)
    print()
    return devolvidos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    carregar_service_key()
    devedores, tels_por_proc, stats = parse_planilha()

    print(f"""
=== ANÁLISE DA PLANILHA ===
Linhas lidas:           {stats['total']:>8,}
Processos duplicados:   {stats['dup_processo']:>8,} (ignorados)
Devedores a importar:   {len(devedores):>8,}
Com celular válido:     {stats['com_movel']:>8,} ({stats['com_movel']/max(1,len(devedores))*100:.1f}%)
Telefones válidos:      {stats['telefones']:>8,}
Telefones descartados:  {stats['tel_invalidos']:>8,}
Sem CPF:                {stats['sem_cpf']:>8,}
Soma dos saldos:        R$ {stats['soma_saldo']:>14,.2f}
""".replace(",", "."))

    if args.dry_run:
        print("Dry-run: nada foi gravado.")
        return

    sessao = requests.Session()
    sessao.headers.update({
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })

    t0 = time.time()
    print("Inserindo devedores ...")
    ret = post_batches(sessao, "devedores", devedores,
                       params={"select": "id,processo",
                               "on_conflict": "processo"},
                       label="devedores")
    id_por_processo = {r["processo"]: r["id"] for r in ret}

    print("Inserindo telefones ...")
    telefones = []
    for proc, tels in tels_por_proc.items():
        dev_id = id_por_processo.get(proc)
        if not dev_id:
            continue
        for t in tels:
            telefones.append(dict(devedor_id=dev_id, **t))
    ret_tel = post_batches(sessao, "telefones_devedor", telefones,
                           params={"select": "id,devedor_id,ordem,tipo"},
                           label="telefones")

    print("Montando fila de envios ...")
    primeiro_movel = {}
    for t in sorted(ret_tel, key=lambda x: (x["devedor_id"], x["ordem"])):
        if t["tipo"] == "movel" and t["devedor_id"] not in primeiro_movel:
            primeiro_movel[t["devedor_id"]] = t["id"]

    prioridade_por_id = {id_por_processo[d["processo"]]: d["prioridade"]
                         for d in devedores if d["processo"] in id_por_processo}
    fila = [dict(devedor_id=dev_id, telefone_id=tel_id,
                 prioridade=prioridade_por_id.get(dev_id, 0))
            for dev_id, tel_id in primeiro_movel.items()]
    post_batches(sessao, "fila_envios", fila,
                 params={"select": "id"}, label="fila_envios")

    print(f"""
=== IMPORT CONCLUÍDO em {time.time()-t0:.0f}s ===
Devedores:  {len(id_por_processo):,}
Telefones:  {len(ret_tel):,}
Na fila:    {len(fila):,}
""".replace(",", "."))


if __name__ == "__main__":
    main()
