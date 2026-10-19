import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { brl } from "@/lib/utils";
import { dataCurta } from "@/lib/datas";

/**
 * PATCH — mexer num compromisso da agenda. body: { acao: "cumprir"|"quebrar"|"cancelar"|"remarcar", quando?: ISO }
 * remarcar = o original vira "remarcada" e nasce um novo pendente na data nova (fica o rastro).
 * quebrar  = promessa não cumprida; vira registro no histórico do devedor.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao ?? "");
  if (!["cumprir", "quebrar", "cancelar", "remarcar"].includes(acao)) return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });

  const adm = supabaseAdmin();
  const { data: a } = await adm.from("agenda").select("*").eq("id", id).maybeSingle();
  if (!a) return NextResponse.json({ erro: "Compromisso não encontrado." }, { status: 404 });
  if (!(await carteiraDoDevedorSePodeOperar(sessao, a.devedor_id))) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });
  if (a.status !== "pendente") return NextResponse.json({ erro: "Este compromisso já foi resolvido." }, { status: 409 });
  const agora = new Date().toISOString();

  if (acao === "remarcar") {
    const quando = new Date(String(b?.quando ?? ""));
    if (Number.isNaN(quando.getTime())) return NextResponse.json({ erro: "Escolha a nova data." }, { status: 400 });
    if (quando.getTime() < Date.now() - 3600_000) return NextResponse.json({ erro: "A nova data já passou." }, { status: 400 });
    await adm.from("agenda").update({ status: "remarcada", concluido_em: agora }).eq("id", id);
    const { id: _id, criado_em: _c, concluido_em: _k, status: _s, ...resto } = a;
    const { error } = await adm.from("agenda").insert({ ...resto, quando: quando.toISOString(), status: "pendente", criado_por: sessao.user.id });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const status = acao === "cumprir" ? "cumprida" : acao === "quebrar" ? "quebrada" : "cancelada";
  const { error } = await adm.from("agenda").update({ status, concluido_em: agora }).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (acao === "quebrar") {
    await adm.from("ocorrencias").insert({
      devedor_id: a.devedor_id, carteira_id: a.carteira_id, autor_id: sessao.user.id, autor_nome: sessao.nome,
      canal: "sistema", resultado: "anotacao",
      descricao: `Promessa${a.valor ? ` de ${brl(Number(a.valor))}` : ""} para ${dataCurta(a.quando)} não foi cumprida.`,
    });
  }
  return NextResponse.json({ ok: true });
}
