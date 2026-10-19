import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { RESULTADOS, type Resultado, type Canal } from "@/lib/resultados";

const CANAIS: Canal[] = ["whatsapp", "ligacao", "presencial", "email", "sistema"];
const STATUS_AGENDA = ["cumprida", "quebrada", "remarcada", "cancelada"] as const;

/**
 * POST — "Registrar resultado e ir para o próximo" (o FECHAR ATENDIMENTO do MC COB).
 * body: {
 *   devedor_id, resultado, canal?, descricao?, conversa_id?,
 *   agendar?: { tipo: "retorno"|"promessa", quando: ISO, valor?, dia_inteiro? },
 *   concluir?: { agenda_id, status: "cumprida"|"quebrada"|"remarcada"|"cancelada" }
 * }
 * Grava a ocorrência (o gatilho do banco atualiza último contato, situação e bloqueios), fecha o
 * compromisso que motivou o contato e marca o próximo. Responder pela conversa marca como lida.
 */
export async function POST(req: Request) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const b = await req.json().catch(() => ({}));

  const devedorId = Number(b?.devedor_id);
  const resultado = String(b?.resultado ?? "") as Resultado;
  if (!Number.isInteger(devedorId) || devedorId <= 0) return NextResponse.json({ erro: "Devedor inválido." }, { status: 400 });
  if (!(resultado in RESULTADOS)) return NextResponse.json({ erro: "Escolha o resultado do contato." }, { status: 400 });
  const canal = (CANAIS.includes(b?.canal) ? b.canal : "whatsapp") as Canal;
  const descricao = b?.descricao ? String(b.descricao).trim().slice(0, 2000) : null;

  const cart = await carteiraDoDevedorSePodeOperar(sessao, devedorId);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  // Valida o agendamento antes de gravar qualquer coisa
  let agendar: { tipo: "retorno" | "promessa"; quando: string; valor: number | null; dia_inteiro: boolean } | null = null;
  if (b?.agendar) {
    const tipo = b.agendar.tipo === "promessa" ? "promessa" : "retorno";
    const quando = new Date(String(b.agendar.quando ?? ""));
    if (Number.isNaN(quando.getTime())) return NextResponse.json({ erro: "Data do próximo passo inválida." }, { status: 400 });
    if (quando.getTime() < Date.now() - 86_400_000) return NextResponse.json({ erro: "A data do próximo passo já passou." }, { status: 400 });
    const valor = b.agendar.valor != null && b.agendar.valor !== "" ? Number(b.agendar.valor) : null;
    if (valor != null && !(valor > 0)) return NextResponse.json({ erro: "Valor da promessa inválido." }, { status: 400 });
    agendar = { tipo, quando: quando.toISOString(), valor, dia_inteiro: b.agendar.dia_inteiro !== false };
  }

  const adm = supabaseAdmin();
  const { data: oc, error } = await adm.from("ocorrencias").insert({
    devedor_id: devedorId, carteira_id: cart.carteira_id, autor_id: sessao.user.id, autor_nome: sessao.nome,
    canal, resultado, descricao, conversa_id: Number(b?.conversa_id) || null,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // Fecha o compromisso que trouxe a pessoa para a fila
  if (b?.concluir?.agenda_id) {
    const st = STATUS_AGENDA.includes(b.concluir.status) ? b.concluir.status : "cumprida";
    await adm.from("agenda").update({ status: st, concluido_em: new Date().toISOString() })
      .eq("id", Number(b.concluir.agenda_id)).eq("devedor_id", devedorId).eq("status", "pendente");
  }

  // Marca o próximo passo. Se a pessoa já tinha um compromisso pendente do mesmo tipo, ele é
  // remarcado (não fica um velho e um novo brigando na fila).
  let agendaId: number | null = null;
  if (agendar) {
    await adm.from("agenda").update({ status: "remarcada", concluido_em: new Date().toISOString() })
      .eq("devedor_id", devedorId).eq("tipo", agendar.tipo).eq("status", "pendente");
    const { data: ag, error: eAg } = await adm.from("agenda").insert({
      devedor_id: devedorId, carteira_id: cart.carteira_id, responsavel_id: sessao.user.id, criado_por: sessao.user.id,
      tipo: agendar.tipo, quando: agendar.quando, dia_inteiro: agendar.dia_inteiro, valor: agendar.valor,
      observacao: descricao, origem_ocorrencia_id: oc.id,
    }).select("id").single();
    if (eAg) return NextResponse.json({ erro: eAg.message }, { status: 400 });
    agendaId = ag.id;
  }

  // Quem trabalhou o devedor sem dono vira o responsável (regra do MC COB).
  await adm.from("devedores").update({ responsavel_id: sessao.user.id }).eq("id", devedorId).is("responsavel_id", null);

  // Contato pela conversa = conversa lida.
  if (b?.conversa_id) {
    await adm.from("conversas").update({ lida_em: new Date().toISOString() }).eq("id", Number(b.conversa_id)).eq("devedor_id", devedorId);
  }

  return NextResponse.json({ ok: true, ocorrencia_id: oc.id, agenda_id: agendaId });
}
