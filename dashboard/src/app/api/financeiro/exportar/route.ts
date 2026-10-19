import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { exigirSessao } from "@/lib/auth";
import { lerPeriodo } from "@/lib/periodo";
import { dataLonga, hora } from "@/lib/datas";

// GET — planilha (CSV com ; e vírgula decimal, que o Excel em português abre direto) dos recebimentos.
export async function GET(req: Request) {
  const g = await exigirSessao();
  if (g.erro) return g.erro;
  const u = new URL(req.url);
  const per = lerPeriodo("personalizado", u.searchParams.get("de") ?? undefined, u.searchParams.get("ate") ?? undefined);
  const sb = await supabaseServer();
  const { data: recs } = await sb.from("v_recebimentos").select("*").gte("recebido_em", per.de.toISOString()).lte("recebido_em", per.ate.toISOString()).order("recebido_em").limit(20000);
  const lista = recs ?? [];
  const ids = [...new Set(lista.map((r) => r.devedor_id))];
  const dev = new Map<number, { nome: string; cpf: string; carteira: string }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from("devedores").select("id, nome, cpf_cnpj, carteiras(nome)").in("id", ids.slice(i, i + 300));
    for (const d of data ?? []) dev.set(d.id, { nome: d.nome, cpf: d.cpf_cnpj, carteira: (d.carteiras as unknown as { nome: string } | null)?.nome ?? "" });
  }
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const linhas = [["Data", "Hora", "Devedor", "CPF", "Carteira", "Origem", "Forma", "Valor"].join(";")];
  for (const r of lista) {
    const d = dev.get(r.devedor_id);
    const origem = r.origem === "pix" ? "Pix avulso" : r.parcela_numero === 0 ? "Entrada" : `Parcela ${r.parcela_numero}/${r.parcelas_total}`;
    linhas.push([dataLonga(r.recebido_em), hora(r.recebido_em), esc(d?.nome ?? ""), d?.cpf ?? "", esc(d?.carteira ?? ""), origem, r.forma, Number(r.valor).toFixed(2).replace(".", ",")].join(";"));
  }
  return new NextResponse("﻿" + linhas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="recebimentos_${per.deISO}_${per.ateISO}.csv"` },
  });
}
