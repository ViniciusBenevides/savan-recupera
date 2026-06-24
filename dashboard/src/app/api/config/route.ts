import { NextResponse } from "next/server";
import { exigirEscopoConta } from "@/lib/auth";
import { setConfig, ehConfigPorCobrador } from "@/lib/config";

// Atualiza chaves de `configuracoes` no escopo do ator:
//  - cobrador            → as SUAS chaves (campanha/descontos/ia). Linha por cobrador, cai no global.
//  - admin (global)      → os padrões globais da plataforma (qualquer chave).
//  - admin mirando conta → as chaves por-conta daquele cobrador (body.conta = uuid do cobrador).
export async function POST(req: Request) {
  const body = await req.json(); // { chave, valor } | { itens:[{chave,valor}] }  (+ conta? p/ admin)
  const g = await exigirEscopoConta(body.conta);
  if (g.erro) return g.erro;
  const { escopo, sessao } = g;

  const itens = body.itens ?? [{ chave: body.chave, valor: body.valor }];
  for (const it of itens) {
    // num escopo de cobrador (ou admin mirando um cobrador), só as chaves "por conta"
    if (escopo.cobradorId && !ehConfigPorCobrador(it.chave)) {
      return NextResponse.json({ erro: "chave_global_so_admin" }, { status: 400 });
    }
    const { error } = await setConfig(escopo.cobradorId, it.chave, it.valor, sessao.user.id);
    if (error) return NextResponse.json({ erro: error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, escopo: escopo.ehGlobal ? "global" : "cobrador" });
}
