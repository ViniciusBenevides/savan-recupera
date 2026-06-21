# -*- coding: utf-8 -*-
"""
SAVAN Recupera — organiza os workflows do produto na instância n8n.

A API pública do n8n NÃO permite mover workflows para PASTAS (o recurso de pastas
fica no app web e exige licença; os endpoints /folders e /projects não respondem à
API key). O que a API permite é TAG. Este script garante que todos os workflows do
produto (nome começa com "SAVAN") fiquem com a tag única "SAVAN", para você filtrar
por ela no n8n. Depois, no app web, basta arrastar os 5 workflows para a pasta
"Cobrador Maurelio v2" uma única vez (a tag continua, então fica fácil achá-los).

Uso: python n8n/organizar_tags.py
"""
import json
from pathlib import Path
import requests

RAIZ = Path(__file__).resolve().parent.parent
TAG = "SAVAN"
PREFIXO = "SAVAN"  # todos os workflows do produto começam com isso


def env(chave):
    for l in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if l.lower().startswith(chave.lower()):
            return l.split(":", 1)[1].strip()
    raise SystemExit(f"{chave} não encontrado no .env")


N8N = env("url n8n").rstrip("/")
HDR = {"X-N8N-API-KEY": env("n8n api key"), "Content-Type": "application/json"}


def tag_id(nome):
    """Garante que a tag existe e devolve o id."""
    r = requests.get(f"{N8N}/api/v1/tags?limit=100", headers=HDR, timeout=30)
    for t in r.json().get("data", []):
        if t["name"] == nome:
            return t["id"]
    r = requests.post(f"{N8N}/api/v1/tags", headers=HDR, json={"name": nome}, timeout=30)
    return r.json()["id"]


def main():
    tid = tag_id(TAG)
    wfs = requests.get(f"{N8N}/api/v1/workflows?limit=250", headers=HDR, timeout=30).json().get("data", [])
    alvos = [w for w in wfs if w["name"].startswith(PREFIXO)]
    print(f"Tag '{TAG}' (id {tid}) — {len(alvos)} workflow(s) do produto:")
    for w in alvos:
        atuais = {t["id"] for t in (w.get("tags") or [])}
        if tid in atuais:
            print(f"  = {w['name']}: já marcado")
            continue
        # PUT substitui o conjunto de tags — preserva as existentes + adiciona a nossa
        ids = sorted(atuais | {tid})
        r = requests.put(f"{N8N}/api/v1/workflows/{w['id']}/tags", headers=HDR,
                         json=[{"id": i} for i in ids], timeout=30)
        ok = r.status_code in (200, 201)
        print(f"  {'+' if ok else '!'} {w['name']}: {'marcado' if ok else r.status_code}")


if __name__ == "__main__":
    main()
