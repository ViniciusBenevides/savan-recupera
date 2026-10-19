import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao } from "@/lib/auth";
import { SectionTitle, estiloBotao } from "@/components/ui/primitives";
import { lerPeriodo } from "@/lib/periodo";
import { brl, cn, num } from "@/lib/utils";
import { dataCurta, diaISO, margem } from "@/lib/datas";
import { GraficoDias } from "./_graficos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

const FORMA: Record<string, string> = { pix: "Pix", loja: "Na loja", transferencia: "Transferência", boleto: "Boleto", dinheiro: "Dinheiro" };
const PERIODOS = [["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"], ["mes_passado", "Mês passado"]] as const;

type Rec = { origem: string; ref_id: number; devedor_id: number; carteira_id: number | null; recebido_em: string; valor: number; forma: string; acordo_id: number | null; parcela_numero: number | null; parcelas_total: number | null };

export default async function Page({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (sessao.role === "negociador") redirect("/trabalho-hoje");
  const f = await searchParams;
  const per = lerPeriodo(f.periodo, f.de, f.ate);
  const sb = await supabaseServer();

  const [{ data: recs, error }, { data: carteiras }, { data: cfg }] = await Promise.all([
    sb.from("v_recebimentos").select("*").gte("recebido_em", per.de.toISOString()).lte("recebido_em", per.ate.toISOString()).order("recebido_em", { ascending: false }).limit(5000),
    sb.from("carteiras").select("id, nome, tipo_carteira, honorarios_pct"),
    sb.from("configuracoes").select("valor").eq("chave", "asaas").is("cobrador_id", null).maybeSingle(),
  ]);
  const lista = (recs ?? []) as Rec[];
  const ids = [...new Set(lista.map((r) => r.devedor_id))];
  const nomes = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from("devedores").select("id, nome").in("id", ids.slice(i, i + 300));
    for (const d of data ?? []) nomes.set(d.id, d.nome);
  }
  const cart = new Map((carteiras ?? []).map((c) => [c.id, c]));

  const total = lista.reduce((s, r) => s + Number(r.valor), 0);
  const porForma = new Map<string, number>();
  const porCarteira = new Map<number, number>();
  for (const r of lista) {
    porForma.set(r.forma, (porForma.get(r.forma) ?? 0) + Number(r.valor));
    if (r.carteira_id) porCarteira.set(r.carteira_id, (porCarteira.get(r.carteira_id) ?? 0) + Number(r.valor));
  }
  const terceiros = [...porCarteira].filter(([id]) => cart.get(id)?.tipo_carteira === "terceiros").map(([id, v]) => {
    const c = cart.get(id)!; const pct = Number(c.honorarios_pct ?? 0);
    return { nome: c.nome, pct, honorarios: Math.round(v * pct) / 100, repasse: v - Math.round(v * pct) / 100 };
  });
  const comissaoPct = Number((cfg?.valor as { comissao_pct?: number } | null)?.comissao_pct ?? 10);
  const verComissao = sessao.role === "admin" || sessao.role === "cobrador";

  // Série por dia (para o gráfico)
  const porDia = new Map<string, number>();
  for (const r of lista) porDia.set(diaISO(new Date(r.recebido_em)), (porDia.get(diaISO(new Date(r.recebido_em))) ?? 0) + Number(r.valor));
  const serie: { dia: string; rotulo: string; valor: number }[] = [];
  for (let d = new Date(per.de); d <= per.ate && serie.length < 92; d = new Date(d.getTime() + 86_400_000)) {
    const k = diaISO(d);
    if (!serie.some((x) => x.dia === k)) serie.push({ dia: k, rotulo: dataCurta(d), valor: Math.round((porDia.get(k) ?? 0) * 100) / 100 });
  }

  const linkPer = (k: string) => `/financeiro?periodo=${k}`;
  const exportar = `/api/financeiro/exportar?de=${per.deISO}&ate=${per.ateISO}`;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Financeiro"
        sub={`${per.rotulo}: tudo o que entrou, de parcelas de acordo e de Pix.`}
        action={lista.length > 0 ? <a href={exportar} className={estiloBotao("outline")}><Download className="h-4 w-4" aria-hidden="true" /> Exportar planilha</a> : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map(([k, t]) => (
          <Link key={k} href={linkPer(k)} className={cn("alvo-toque inline-flex h-9 items-center rounded-full border px-3 text-sm2 font-600", per.chave === k ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte bg-folha text-texto hover:border-tinta/50")}>{t}</Link>
        ))}
        <form action="/financeiro" className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="periodo" value="personalizado" />
          <input type="date" name="de" defaultValue={per.chave === "personalizado" ? per.deISO : ""} aria-label="De" className="h-9 rounded-controle border border-pauta-forte bg-folha px-2 text-sm2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base" />
          <span className="text-sm2 text-lapis">a</span>
          <input type="date" name="ate" defaultValue={per.chave === "personalizado" ? per.ateISO : ""} aria-label="Até" className="h-9 rounded-controle border border-pauta-forte bg-folha px-2 text-sm2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base" />
          <button type="submit" className="h-9 rounded-controle px-2 text-sm2 font-600 text-tinta hover:bg-tinta-clara [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3">Ver</button>
        </form>
      </div>

      {error && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">Não foi possível carregar os recebimentos.</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section aria-labelledby="t-resumo">
          <h2 id="t-resumo" className="sr-only">Resumo do período</h2>
          <dl className="divide-y divide-pauta border-y border-pauta bg-folha text-[0.9375rem]">
            <div className="flex items-baseline justify-between px-4 py-3">
              <dt className="font-700">Recebido</dt>
              <dd className="font-mono text-titulo font-700 tabnums text-pago">{brl(total)}</dd>
            </div>
            {[...porForma].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2"><dt className="pl-3 text-lapis">{FORMA[k] ?? k}</dt><dd className="font-mono tabnums">{brl(v)}</dd></div>
            ))}
            {[...porCarteira].sort((a, b) => b[1] - a[1]).map(([id, v]) => (
              <div key={id} className="flex justify-between px-4 py-2"><dt className="pl-3 text-lapis">{cart.get(id)?.nome ?? "—"}</dt><dd className="font-mono tabnums">{brl(v)}</dd></div>
            ))}
            {terceiros.map((t) => (
              <div key={t.nome} className="px-4 py-2">
                <div className="flex justify-between"><dt>Honorários MC CRED · {t.nome} ({t.pct}%)</dt><dd className="font-mono tabnums">{brl(t.honorarios)}</dd></div>
                <div className="flex justify-between text-lapis"><dt className="pl-3">Repasse ao credor</dt><dd className="font-mono tabnums">{brl(t.repasse)}</dd></div>
              </div>
            ))}
            {verComissao && total > 0 && (
              <div className="flex justify-between px-4 py-2">
                <dt>Comissão de tecnologia ({comissaoPct}%)</dt>
                <dd className="font-mono tabnums">{brl(Math.round(total * comissaoPct) / 100)}</dd>
              </div>
            )}
          </dl>
          {verComissao && total > 0 && <p className="mt-2 text-meta text-lapis">No Pix gerado pelo sistema, a comissão já sai separada pelo split do Asaas. Pagamento na loja precisa ser acertado à parte.</p>}
        </section>

        <section aria-labelledby="t-grafico" className="min-w-0">
          <h2 id="t-grafico" className="text-[0.9375rem] font-700">Recebido por dia</h2>
          {total > 0 ? <GraficoDias dados={serie} /> : <p className="mt-2 text-[0.9375rem] text-lapis">Nada entrou neste período.</p>}
        </section>
      </div>

      <section aria-labelledby="t-livro" className="mt-8">
        <h2 id="t-livro" className="font-display text-titulo font-600 text-ouro">Livro-caixa <span className="font-mono text-sm2 font-500 text-lapis">{num(lista.length)}</span></h2>
        {lista.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-lapis">Sem recebimentos de {per.rotulo.toLowerCase()}. Pagamentos entram aqui quando o Pix cai ou quando alguém registra a parcela paga na ficha.</p>
        ) : (
          <ul className="pagina-pautada mt-2 border-y border-pauta bg-folha [--margem:92px]" role="list">
            {lista.map((r) => (
              <li key={`${r.origem}-${r.ref_id}`} className="grid grid-cols-[var(--margem)_minmax(0,1fr)_auto] items-center border-b border-pauta last:border-b-0">
                <span className="px-4 py-2.5 font-mono text-sm2 text-tinta tabnums">{margem(r.recebido_em)}</span>
                <span className="min-w-0 px-4 py-2.5">
                  <Link href={`/devedores/${r.devedor_id}`} className="font-700 text-texto hover:text-tinta hover:underline">{nomes.get(r.devedor_id) ?? "—"}</Link>
                  <span className="ml-2 text-meta text-lapis">{r.carteira_id ? cart.get(r.carteira_id)?.nome : ""}</span>
                  <span className="block text-sm2 text-lapis">
                    {r.origem === "pix" ? "Pix avulso" : r.parcelas_total === 1 && r.parcela_numero === 1 ? "À vista" : r.parcela_numero === 0 ? "Entrada do acordo" : `Parcela ${r.parcela_numero} de ${r.parcelas_total}`} · {FORMA[r.forma] ?? r.forma}
                  </span>
                </span>
                <span className="pr-4 text-right font-mono tabnums text-pago">{brl(Number(r.valor))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
