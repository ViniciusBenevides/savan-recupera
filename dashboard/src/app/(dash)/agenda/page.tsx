import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getSessao, podeOperar } from "@/lib/auth";
import { diaISO, fimDoDiaSP, inicioDoDiaSP, somarDias, deDiaISO } from "@/lib/datas";
import { AgendaLista, type ItemAgenda } from "./_agenda/agenda-lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string; quem?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (sessao.role === "credor") redirect("/relatorios");
  const f = await searchParams;
  const tipo = ["promessas", "retornos", "parcelas"].includes(f.tipo ?? "") ? f.tipo! : "tudo";
  const quem = f.quem === "equipe" || f.quem === "minha" ? f.quem : sessao.role === "negociador" ? "minha" : "equipe";

  const sb = await supabaseServer();
  const ate = fimDoDiaSP(somarDias(new Date(), 45)).toISOString();

  const [ag, parc] = await Promise.all([
    tipo === "parcelas"
      ? Promise.resolve({ data: [] as never[] })
      : (() => {
          let q = sb.from("agenda").select("id, devedor_id, tipo, quando, dia_inteiro, valor, observacao, responsavel_id, devedores(nome, responsavel_id, carteiras(nome))")
            .eq("status", "pendente").lte("quando", ate).order("quando").limit(800);
          if (tipo === "promessas") q = q.eq("tipo", "promessa");
          if (tipo === "retornos") q = q.eq("tipo", "retorno");
          if (quem === "minha") q = q.eq("responsavel_id", sessao.user.id);
          return q;
        })(),
    tipo === "promessas" || tipo === "retornos"
      ? Promise.resolve({ data: [] as never[] })
      : sb.from("acordo_parcelas").select("id, numero, vencimento, valor, acordos!inner(id, devedor_id, parcelas, status, criado_por, devedores(nome, responsavel_id, carteiras(nome)))")
          .eq("status", "aberta").eq("acordos.status", "ativo").lte("vencimento", diaISO(somarDias(new Date(), 45))).order("vencimento").limit(800),
  ]);

  type Dev = { nome: string; responsavel_id: string | null; carteiras: { nome: string } | null };
  const ids = new Set<string>();
  const itens: ItemAgenda[] = [];
  for (const a of (ag.data ?? []) as unknown as { id: number; devedor_id: number; tipo: string; quando: string; dia_inteiro: boolean; valor: number | null; observacao: string | null; responsavel_id: string | null; devedores: Dev }[]) {
    if (a.responsavel_id) ids.add(a.responsavel_id);
    itens.push({ chave: `a-${a.id}`, agenda_id: a.id, parcela_id: null, devedor_id: a.devedor_id, nome: a.devedores?.nome ?? "—", carteira: a.devedores?.carteiras?.nome ?? "",
      tipo: a.tipo as "promessa" | "retorno", quando: a.quando, dia_inteiro: a.dia_inteiro, valor: a.valor != null ? Number(a.valor) : null, observacao: a.observacao, responsavel_id: a.responsavel_id, rotulo: "" });
  }
  for (const p of (parc.data ?? []) as unknown as { id: number; numero: number; vencimento: string; valor: number; acordos: { devedor_id: number; parcelas: number; devedores: Dev } }[]) {
    const resp = p.acordos.devedores?.responsavel_id ?? null;
    if (quem === "minha" && resp !== sessao.user.id) continue;
    if (resp) ids.add(resp);
    itens.push({ chave: `p-${p.id}`, agenda_id: null, parcela_id: p.id, devedor_id: p.acordos.devedor_id, nome: p.acordos.devedores?.nome ?? "—", carteira: p.acordos.devedores?.carteiras?.nome ?? "",
      tipo: "parcela", quando: deDiaISO(p.vencimento).toISOString(), dia_inteiro: true, valor: Number(p.valor), observacao: null, responsavel_id: resp,
      rotulo: p.numero === 0 ? "Entrada do acordo" : `Parcela ${p.numero} de ${p.acordos.parcelas}` });
  }
  itens.sort((x, y) => x.quando.localeCompare(y.quando));

  const nomes = new Map<string, string>();
  if (ids.size) {
    const { data } = await supabaseAdmin().from("usuarios_app").select("id, nome").in("id", [...ids]);
    for (const u of data ?? []) nomes.set(u.id, u.nome ?? "—");
  }

  return (
    <AgendaLista
      itens={itens.map((i) => ({ ...i, responsavel: i.responsavel_id ? nomes.get(i.responsavel_id) ?? null : null }))}
      tipo={tipo}
      quem={quem}
      podeOperar={podeOperar(sessao.role)}
      hojeIni={inicioDoDiaSP().toISOString()}
    />
  );
}
