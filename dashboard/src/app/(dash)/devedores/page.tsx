import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getSessao, podeOperar } from "@/lib/auth";
import { ListaDevedores, type LinhaDevedor } from "./_lista/lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Devedores" };

const POR_PAGINA = 50;
const limpar = (s: string) => s.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

type Busca = { aba?: string; q?: string; carteira?: string; situacao?: string; contato?: string; ordem?: string; p?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Busca> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  const f = await searchParams;
  const aba = f.aba === "minha" || f.aba === "sem" ? f.aba : "todos";
  const pagina = Math.max(1, Number(f.p) || 1);
  const sb = await supabaseServer();

  let qb = sb
    .from("devedores")
    .select("id, nome, cpf_cnpj, processo, saldo, status_cobranca, responsavel_id, ultimo_contato_em, carteira_id, carteiras(nome)", { count: "exact" });

  if (aba === "minha") qb = qb.eq("responsavel_id", sessao.user.id);
  if (aba === "sem") qb = qb.is("responsavel_id", null);
  if (f.carteira) qb = qb.eq("carteira_id", Number(f.carteira));
  if (f.situacao) qb = qb.eq("status_cobranca", f.situacao);
  if (f.contato === "nunca") qb = qb.is("ultimo_contato_em", null);
  else if (["7", "15", "30"].includes(f.contato ?? "")) qb = qb.lt("ultimo_contato_em", new Date(Date.now() - Number(f.contato) * 86_400_000).toISOString());

  const q = limpar(f.q ?? "");
  if (q) {
    const digitos = q.replace(/\D/g, "");
    const partes = [`nome.ilike.%${q}%`, `processo.ilike.%${q}%`];
    if (digitos.length >= 3) partes.push(`cpf_cnpj.ilike.%${digitos}%`);
    if (digitos.length >= 6) {
      const { data: fones } = await sb.from("telefones_devedor").select("devedor_id").ilike("telefone_e164", `%${digitos}%`).limit(200);
      const ids = [...new Set((fones ?? []).map((x) => x.devedor_id))];
      if (ids.length) partes.push(`id.in.(${ids.join(",")})`);
    }
    qb = qb.or(partes.join(","));
  }

  if (f.ordem === "divida") qb = qb.order("saldo", { ascending: false });
  else if (f.ordem === "contato") qb = qb.order("ultimo_contato_em", { ascending: true, nullsFirst: true });
  else if (f.ordem === "nome") qb = qb.order("nome");
  else qb = qb.order("prioridade", { ascending: false }).order("saldo", { ascending: false });

  const ini = (pagina - 1) * POR_PAGINA;
  const [{ data, count, error }, { data: carteiras }] = await Promise.all([
    qb.range(ini, ini + POR_PAGINA - 1),
    sb.from("carteiras").select("id, nome, cobrador_id").order("nome"),
  ]);

  const ids = (data ?? []).map((d) => d.id);
  const proximos = new Map<number, { tipo: string; quando: string }>();
  if (ids.length) {
    const { data: ag } = await sb.from("agenda").select("devedor_id, tipo, quando").in("devedor_id", ids).eq("status", "pendente").order("quando");
    for (const a of ag ?? []) if (!proximos.has(a.devedor_id)) proximos.set(a.devedor_id, { tipo: a.tipo, quando: a.quando });
  }

  // Equipe (nomes de quem pode ser responsável): o dono da operação e os negociadores dele.
  const tenant = sessao.role === "admin" ? (carteiras?.[0]?.cobrador_id ?? null) : sessao.tenant;
  const { data: equipeRaw } = tenant
    ? await supabaseAdmin().from("usuarios_app").select("id, nome, role").or(`id.eq.${tenant},cobrador_id.eq.${tenant}`)
    : { data: [] as { id: string; nome: string | null; role: string }[] };
  const equipe = (equipeRaw ?? []).filter((u) => u.role === "cobrador" || u.role === "negociador").map((u) => ({ id: u.id, nome: u.nome ?? "—" }));
  const nomes = new Map(equipe.map((u) => [u.id, u.nome]));

  const linhas: LinhaDevedor[] = (data ?? []).map((d) => ({
    id: d.id, nome: d.nome, cpf: d.cpf_cnpj, processo: d.processo, saldo: Number(d.saldo), situacao: d.status_cobranca,
    responsavel: d.responsavel_id ? nomes.get(d.responsavel_id) ?? "—" : null, ultimo_contato_em: d.ultimo_contato_em,
    carteira: (d.carteiras as unknown as { nome: string } | null)?.nome ?? "", proximo: proximos.get(d.id) ?? null,
  }));

  return (
    <ListaDevedores
      linhas={linhas}
      total={count ?? 0}
      pagina={pagina}
      porPagina={POR_PAGINA}
      filtros={{ aba, q: f.q ?? "", carteira: f.carteira ?? "", situacao: f.situacao ?? "", contato: f.contato ?? "", ordem: f.ordem ?? "" }}
      carteiras={(carteiras ?? []).map((c) => ({ id: c.id, nome: c.nome }))}
      equipe={equipe}
      podeOperar={podeOperar(sessao.role)}
      erro={error ? "Não foi possível carregar a lista. Tente de novo." : null}
    />
  );
}
