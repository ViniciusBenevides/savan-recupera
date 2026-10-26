import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, exigirAdmin, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { bloqueiosExclusao, type Vinculos } from "@/lib/vinculos";

/**
 * PATCH — responsável pelo devedor ("Assumir" do MC COB). body: { responsavel_id: "eu" | uuid | null }
 * O negociador só assume para si ou solta; o dono da operação (e o admin) distribui para quem é
 * da equipe dele.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const cart = await carteiraDoDevedorSePodeOperar(sessao, id);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  let alvo: string | null = b?.responsavel_id === "eu" ? sessao.user.id : (b?.responsavel_id ?? null);
  if (alvo && alvo !== sessao.user.id) {
    if (sessao.role === "negociador") return NextResponse.json({ erro: "Você só pode assumir para si." }, { status: 403 });
    const { data: u } = await supabaseAdmin().from("usuarios_app").select("id, role, cobrador_id").eq("id", alvo).maybeSingle();
    const daEquipe = !!u && ((u.role === "cobrador" && u.id === cart.cobrador_id) || (u.role === "negociador" && u.cobrador_id === cart.cobrador_id));
    if (!daEquipe) return NextResponse.json({ erro: "Essa pessoa não é da equipe desta carteira." }, { status: 400 });
  }
  if (alvo === undefined) alvo = null;

  const { error } = await supabaseAdmin().from("devedores").update({ responsavel_id: alvo }).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, responsavel_id: alvo });
}

/**
 * DELETE — exclusão definitiva (Zona de risco, V5.7.01). Só o administrador, digitando EXCLUIR.
 * body: { confirmacao: "EXCLUIR" }
 * Para cadastro de teste, duplicado ou importado por engano. Bloqueada quando há pagamento, acordo,
 * Jurídico ou documento; o que é só histórico operacional (telefones, ocorrências, agenda,
 * conversas) sai junto. A auditoria guarda quem excluiu e o retrato do que havia.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  if (String(b?.confirmacao ?? "").trim().toUpperCase() !== "EXCLUIR") {
    return NextResponse.json({ erro: "Para excluir definitivamente, digite EXCLUIR." }, { status: 400 });
  }

  const adm = supabaseAdmin();
  const { data: d } = await adm.from("devedores")
    .select("id, nome, cpf_cnpj, processo, carteira_id, saldo, status_cobranca, carteiras(nome)").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ erro: "Devedor não encontrado." }, { status: 404 });

  const { data: vinc, error: eV } = await adm.rpc("fn_vinculos_devedor", { p_devedor_id: id });
  if (eV || !vinc) return NextResponse.json({ erro: "Não foi possível conferir os vínculos do cliente." }, { status: 500 });
  const bloqueios = bloqueiosExclusao(vinc as Vinculos);
  if (bloqueios.length) {
    return NextResponse.json({ erro: `Exclusão bloqueada: ${bloqueios.join("; ")}. Inative o cliente para preservar o histórico.`, bloqueios }, { status: 409 });
  }

  // A auditoria vem antes: se a exclusão falhar, sobra um registro de tentativa, nunca o contrário.
  await registrarAuditoria(adm, g.sessao, {
    acao: "devedor_excluido", entidade: "devedor", entidade_id: id, carteira_id: d.carteira_id, devedor_id: id,
    detalhe: {
      nome: d.nome, documento: d.cpf_cnpj, processo: d.processo, saldo: d.saldo, situacao: d.status_cobranca,
      carteira: (d.carteiras as unknown as { nome: string } | null)?.nome ?? null, vinculos: vinc,
    },
  });
  const { error } = await adm.from("devedores").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: "Não foi possível excluir com segurança. Nada foi removido." }, { status: 500 });

  // Os totais da carteira continuam batendo com a lista
  if (d.carteira_id) {
    const { count } = await adm.from("devedores").select("id", { count: "exact", head: true }).eq("carteira_id", d.carteira_id);
    await adm.from("carteiras").update({ num_devedores: count ?? 0 }).eq("id", d.carteira_id);
  }
  return NextResponse.json({ ok: true });
}
