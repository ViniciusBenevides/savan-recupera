import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { exigirSessao } from "@/lib/auth";
import { lerMensagem } from "@/lib/ia/ler-mensagem";
import { sugerirResposta } from "@/lib/ia/sugerir-resposta";

// GET — o que a ficha resumida precisa (painel ao lado do Trabalho de hoje e das Conversas).
// Lê com a sessão: se o devedor não é visível para este usuário, o RLS devolve nada e vira 404.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: "devedor_invalido" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: d } = await sb
    .from("devedores")
    .select("id, nome, cpf_cnpj, processo, saldo, vencimento, cidade, uf, status_cobranca, responsavel_id, carteira_id, ultimo_contato_em, motivo_inadimplencia, carteiras(nome, credor, parcelas_max, parcela_min_valor, desconto_max_pct, entrada_min_pct, tipo_carteira)")
    .eq("id", id)
    .maybeSingle();
  if (!d) return NextResponse.json({ erro: "devedor_nao_encontrado" }, { status: 404 });

  const [prop, convs, acordo, agenda, fones, bloqueio] = await Promise.all([
    sb.rpc("fn_proposta", { p_devedor_id: id }),
    sb.from("conversas").select("id, estado, ultima_msg_em, ultima_msg_de").eq("devedor_id", id).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(1),
    sb.from("acordos").select("id, valor_total, parcelas, entrada, desconto_pct, status, forma_pagamento, criado_em, acordo_parcelas(id, numero, vencimento, valor, status, pago_em)").eq("devedor_id", id).eq("status", "ativo").maybeSingle(),
    sb.from("agenda").select("id, tipo, quando, dia_inteiro, valor, observacao").eq("devedor_id", id).eq("status", "pendente").order("quando").limit(3),
    sb.from("telefones_devedor").select("id, telefone_e164, tipo, whatsapp_valido, ordem").eq("devedor_id", id).order("ordem"),
    sb.from("bloqueios_contato").select("motivo").eq("devedor_id", id).limit(1),
  ]);

  const conversa = convs.data?.[0] ?? null;
  let mensagens: { id: number; direcao: string; origem: string; conteudo: string | null; criado_em: string; autor_nome: string | null }[] = [];
  if (conversa) {
    const { data } = await sb.from("mensagens").select("id, direcao, origem, conteudo, criado_em, autor_nome, privado")
      .eq("conversa_id", conversa.id).eq("privado", false).order("criado_em", { ascending: false }).limit(6);
    mensagens = (data ?? []).reverse();
  }

  const carteira = (d.carteiras as unknown as { nome: string; credor: string | null; parcelas_max: number; parcela_min_valor: number; desconto_max_pct: number; entrada_min_pct: number; tipo_carteira: string }) ?? null;
  const proposta = (prop.data ?? null) as { valor_final?: number; desconto_pct?: number; ano_divida?: number; idade_anos?: number } | null;
  const ultimaEntrada = [...mensagens].reverse().find((m) => m.direcao === "entrada" && m.conteudo);
  const leitura = ultimaEntrada && conversa?.ultima_msg_de === "devedor" ? lerMensagem(ultimaEntrada.conteudo!) : null;
  const ano = proposta?.ano_divida ?? (d.vencimento ? Number(String(d.vencimento).slice(0, 4)) : null);
  const sugestao = leitura
    ? sugerirResposta(leitura, {
        nome: d.nome, credor: carteira?.credor ?? carteira?.nome ?? "loja", ano,
        divida: Number(d.saldo), proposta: proposta?.valor_final != null ? Number(proposta.valor_final) : null,
        parcelasMax: carteira?.parcelas_max ?? 6, parcelaMin: Number(carteira?.parcela_min_valor ?? 30),
      })
    : null;

  // Nome do responsável: a tabela de usuários só é legível pelo próprio dono, então vai pelo admin.
  let responsavel: string | null = null;
  if (d.responsavel_id) {
    const { data } = await supabaseAdmin().from("usuarios_app").select("nome").eq("id", d.responsavel_id).maybeSingle();
    responsavel = data?.nome ?? null;
  }

  return NextResponse.json({
    devedor: {
      id: d.id, nome: d.nome, cpf: d.cpf_cnpj, processo: d.processo, saldo: Number(d.saldo), vencimento: d.vencimento,
      cidade: d.cidade, uf: d.uf, situacao: d.status_cobranca, responsavel_id: d.responsavel_id, responsavel,
      ultimo_contato_em: d.ultimo_contato_em, motivo: d.motivo_inadimplencia, ano,
    },
    carteira,
    proposta: proposta?.valor_final != null ? { valor: Number(proposta.valor_final), desconto_pct: Number(proposta.desconto_pct ?? 0) } : null,
    conversa,
    mensagens,
    leitura: leitura ? { ...leitura, data: leitura.data?.toISOString() ?? null } : null,
    sugestao,
    acordo: acordo.data ?? null,
    agenda: agenda.data ?? [],
    telefones: fones.data ?? [],
    bloqueado: (bloqueio.data?.length ?? 0) > 0,
  });
}
