import Link from "next/link";
import { SectionTitle } from "@/components/ui/primitives";
import { getSessao } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import { brl, cn, num, pct } from "@/lib/utils";
import { dataCurta, inicioDoDiaSP, somarDias, partesSP } from "@/lib/datas";
import { RESULTADOS, type Resultado } from "@/lib/resultados";
import { GraficoSemanas } from "./_graficos";
import { Resumo } from "../_inicio/resumo";
import { Historico } from "../_inicio/historico";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios" };

const ABAS = [
  { k: "resultado", t: "Resultado" },
  { k: "equipe", t: "Equipe" },
  { k: "robo", t: "Robô" },
];

type Funil = { carteira_id: number; nome: string; base: number; saldo_total: number; saldo_aberto: number; contatados: number; responderam: number; negociando: number; acordo_ou_promessa: number; pagos: number };

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: pedida } = await searchParams;
  const aba = ABAS.some((a) => a.k === pedida) ? pedida! : "resultado";
  const sessao = await getSessao();
  const sb = await supabaseServer();

  return (
    <>
      <SectionTitle title="Relatórios" sub={aba === "resultado" ? "Do primeiro contato ao pagamento, por carteira." : aba === "equipe" ? "O que cada pessoa fez nos últimos 30 dias." : "O que o robô fez na abertura das conversas."} />
      <div className="mb-6 flex gap-1 sem-barra overflow-x-auto overflow-y-hidden border-b border-pauta" role="tablist">
        {ABAS.map((a) => (
          <Link key={a.k} href={a.k === "resultado" ? "/relatorios" : `/relatorios?aba=${a.k}`} role="tab" aria-selected={aba === a.k}
            className={cn("relative flex h-11 shrink-0 items-center px-3 text-[0.9375rem] font-600", aba === a.k ? "text-tinta" : "text-lapis hover:text-texto")}>
            {a.t}
            {aba === a.k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tinta" />}
          </Link>
        ))}
      </div>
      {aba === "resultado" && <AbaResultado sb={sb} />}
      {aba === "equipe" && <AbaEquipe sb={sb} />}
      {aba === "robo" && (
        <div className="space-y-10">
          <Resumo sessao={sessao} />
          <Historico />
        </div>
      )}
    </>
  );
}

async function AbaResultado({ sb }: { sb: Awaited<ReturnType<typeof supabaseServer>> }) {
  const desde = inicioDoDiaSP(somarDias(new Date(), -83));
  const [{ data: funil }, { data: recs }, { data: todos }] = await Promise.all([
    sb.from("v_funil_carteira").select("*").order("nome"),
    sb.from("v_recebimentos").select("carteira_id, valor, recebido_em").gte("recebido_em", desde.toISOString()).limit(20000),
    sb.from("v_recebimentos").select("carteira_id, valor").limit(50000),
  ]);
  const linhas = (funil ?? []) as Funil[];
  const recuperado = new Map<number, number>();
  for (const r of todos ?? []) if (r.carteira_id) recuperado.set(r.carteira_id, (recuperado.get(r.carteira_id) ?? 0) + Number(r.valor));

  // Semanas (segunda a domingo) dos últimos 3 meses
  const semanas: { rotulo: string; valor: number; ini: Date }[] = [];
  const hoje = new Date();
  const segunda = inicioDoDiaSP(somarDias(hoje, -((partesSP(hoje).semana + 6) % 7)));
  for (let i = 11; i >= 0; i--) { const ini = somarDias(segunda, -7 * i); semanas.push({ ini, rotulo: dataCurta(ini), valor: 0 }); }
  for (const r of recs ?? []) {
    const t = new Date(r.recebido_em).getTime();
    for (let i = semanas.length - 1; i >= 0; i--) if (t >= semanas[i].ini.getTime()) { semanas[i].valor += Number(r.valor); break; }
  }

  if (!linhas.length) return <p className="text-[0.9375rem] text-lapis">Nenhuma carteira ainda. Importe a primeira planilha em Carteiras.</p>;

  const etapas: { k: keyof Funil; t: string }[] = [
    { k: "base", t: "Base" }, { k: "contatados", t: "Com contato" }, { k: "responderam", t: "Responderam" },
    { k: "negociando", t: "Em negociação" }, { k: "acordo_ou_promessa", t: "Acordo ou promessa" }, { k: "pagos", t: "Pagos" },
  ];

  return (
    <div className="space-y-10">
      {linhas.map((f) => {
        const rec = recuperado.get(f.carteira_id) ?? 0;
        return (
          <section key={f.carteira_id} aria-labelledby={`f-${f.carteira_id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`f-${f.carteira_id}`} className="font-display text-titulo font-600 text-ouro">{f.nome}</h2>
              <p className="text-[0.9375rem]">
                <span className="font-mono font-600 tabnums text-pago">{brl(rec)}</span> recuperados · <span className="font-mono tabnums">{brl(Number(f.saldo_aberto))}</span> em aberto
                <span className="text-lapis"> ({pct(Number(f.saldo_total) ? (rec / Number(f.saldo_total)) * 100 : 0)} do total da carteira)</span>
              </p>
            </div>
            <ol className="mt-3 border-y border-pauta bg-folha">
              {etapas.map((e, i) => {
                const v = Number(f[e.k] ?? 0);
                const base = Number(f.base) || 1;
                return (
                  <li key={e.k} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] items-center gap-3 border-b border-pauta px-4 py-2.5 last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)_140px]">
                    <span className="font-600">{e.t}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-ink-800" aria-hidden="true">
                      <span className={cn("block h-full rounded-full", e.k === "pagos" ? "bg-pago" : "bg-tinta")} style={{ width: `${Math.max(v ? 2 : 0, (v / base) * 100)}%` }} />
                    </span>
                    <span className="text-right font-mono tabnums">
                      {num(v)}
                      {i > 0 && <span className="ml-2 inline-block w-10 text-meta text-lapis">{pct((v / base) * 100, 0)}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-1.5 text-meta text-lapis">O percentual ao lado é quanto da base chegou até ali.</p>
          </section>
        );
      })}
      <section aria-labelledby="t-semanas">
        <h2 id="t-semanas" className="font-display text-titulo font-600 text-ouro">Recuperado por semana</h2>
        <p className="mt-1 text-sm2 text-lapis">Últimas 12 semanas, todas as carteiras.</p>
        <GraficoSemanas dados={semanas.map((s) => ({ rotulo: s.rotulo, valor: Math.round(s.valor * 100) / 100 }))} />
      </section>
    </div>
  );
}

async function AbaEquipe({ sb }: { sb: Awaited<ReturnType<typeof supabaseServer>> }) {
  const desde = inicioDoDiaSP(somarDias(new Date(), -30)).toISOString();
  const [{ data: oc }, { data: recs }] = await Promise.all([
    sb.from("ocorrencias").select("autor_nome, resultado").gte("criado_em", desde).not("autor_nome", "is", null).limit(20000),
    sb.from("v_recebimentos").select("acordo_id, valor").gte("recebido_em", desde).not("acordo_id", "is", null).limit(20000),
  ]);
  const acordoIds = [...new Set((recs ?? []).map((r) => r.acordo_id as number))];
  const donoAcordo = new Map<number, string>();
  for (let i = 0; i < acordoIds.length; i += 300) {
    const { data } = await sb.from("acordos").select("id, criado_por_nome").in("id", acordoIds.slice(i, i + 300));
    for (const a of data ?? []) donoAcordo.set(a.id, a.criado_por_nome ?? "—");
  }
  type Linha = { nome: string; total: number; titular: number; promessas: number; acordos: number; pagos: number; valor: number };
  const porPessoa = new Map<string, Linha>();
  const linha = (n: string) => { if (!porPessoa.has(n)) porPessoa.set(n, { nome: n, total: 0, titular: 0, promessas: 0, acordos: 0, pagos: 0, valor: 0 }); return porPessoa.get(n)!; };
  for (const o of oc ?? []) {
    const l = linha(o.autor_nome!);
    if ((o.resultado as Resultado) !== "anotacao") l.total++;
    if (o.resultado === "falou_com_titular") l.titular++;
    if (o.resultado === "promessa") l.promessas++;
    if (o.resultado === "acordo") l.acordos++;
    if (o.resultado === "pagou") l.pagos++;
  }
  for (const r of recs ?? []) { const n = donoAcordo.get(r.acordo_id as number); if (n) linha(n).valor += Number(r.valor); }
  const linhas = [...porPessoa.values()].sort((a, b) => b.valor - a.valor || b.total - a.total);

  if (!linhas.length) return <p className="text-[0.9375rem] text-lapis">Ninguém registrou contato nos últimos 30 dias. Os números aparecem aqui conforme a equipe usa o Registrar resultado.</p>;
  const cab = ["Contatos", `Falou com o titular`, "Promessas", "Acordos", "Pagos", "Recebido"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-y border-pauta bg-folha text-[0.9375rem]">
        <thead>
          <tr className="border-b border-pauta text-left text-meta font-600 text-lapis">
            <th className="px-4 py-2.5 font-600">Pessoa</th>
            {cab.map((c) => <th key={c} className="px-4 py-2.5 text-right font-600">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="border-b border-pauta last:border-b-0">
              <td className="px-4 py-2.5 font-600">{l.nome}</td>
              {[l.total, l.titular, l.promessas, l.acordos, l.pagos].map((v, i) => <td key={i} className="px-4 py-2.5 text-right font-mono tabnums">{num(v)}</td>)}
              <td className="px-4 py-2.5 text-right font-mono tabnums text-pago">{brl(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-meta text-lapis">Contatos contam cada "{RESULTADOS.sem_resposta.rotulo}", "{RESULTADOS.falou_com_titular.rotulo}" etc. registrados. Recebido = parcelas pagas dos acordos que a pessoa fechou.</p>
    </div>
  );
}
