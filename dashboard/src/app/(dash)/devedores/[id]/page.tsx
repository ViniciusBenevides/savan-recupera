import { notFound, redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getSessao, podeOperar } from "@/lib/auth";
import { podeJuridico } from "@/lib/juridico/acesso";
import type { Vinculos } from "@/lib/vinculos";
import { Ficha, type DadosFicha } from "./ficha";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("devedores").select("nome").eq("id", Number((await params).id)).maybeSingle();
  return { title: data?.nome ?? "Devedor não encontrado" };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { aba } = await searchParams;

  const sb = await supabaseServer();
  const { data: d } = await sb
    .from("devedores")
    .select("id, nome, cpf_cnpj, processo, saldo, vencimento, cidade, uf, emails, tags, fase, motivo_inadimplencia, status_cobranca, responsavel_id, carteira_id, ultimo_contato_em, criado_em, inativo_em, inativado_por_nome, titulo_especie, titulo_emissao, prescricao_em, titulo_observacao, carteiras(id, nome, credor, cobrador_id, desconto_max_pct, parcelas_max, entrada_min_pct, parcela_min_valor, tipo_carteira)")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const [prop, fones, conversas, ocorrencias, agenda, acordos, pagamentos, bloqueio, documentos, analises, casos] = await Promise.all([
    sb.rpc("fn_proposta", { p_devedor_id: id }),
    sb.from("telefones_devedor").select("id, telefone_e164, tipo, whatsapp_valido, ordem, excluido_em, excluido_por_nome, motivo_exclusao").eq("devedor_id", id).order("ordem").order("id"),
    sb.from("conversas").select("id, estado, ultima_msg_em, ultima_msg_de, atendente_nome").eq("devedor_id", id).order("ultima_msg_em", { ascending: false, nullsFirst: false }),
    sb.from("ocorrencias").select("id, canal, resultado, descricao, autor_nome, criado_em").eq("devedor_id", id).order("criado_em", { ascending: false }).limit(200),
    sb.from("agenda").select("id, tipo, quando, dia_inteiro, valor, status, observacao, criado_em, concluido_em").eq("devedor_id", id).order("quando", { ascending: false }).limit(100),
    sb.from("acordos").select("id, valor_divida, desconto_pct, valor_total, entrada, parcelas, forma_pagamento, status, criado_por_nome, criado_em, quitado_em, encerrado_em, observacao, acordo_parcelas(id, numero, vencimento, valor, status, pago_em, valor_pago, forma_pagamento)").eq("devedor_id", id).order("criado_em", { ascending: false }),
    sb.from("pagamentos").select("id, valor, status, criado_em, pago_em, pix_payload").eq("devedor_id", id).eq("simulacao", false).order("criado_em", { ascending: false }).limit(20),
    sb.from("bloqueios_contato").select("motivo, criado_em").eq("devedor_id", id).limit(1),
    sb.from("devedor_documentos").select("id, tipo, nome, observacao, arquivo_path, arquivo_tamanho, texto_extraido, criado_por_nome, criado_em").eq("devedor_id", id).order("criado_em", { ascending: false }),
    sb.from("juridico_analises").select("*").eq("devedor_id", id).order("criado_em", { ascending: false }).limit(10),
    sb.from("juridico_casos").select("*").eq("devedor_id", id).order("criado_em", { ascending: false }),
  ]);

  const conversaAtual = conversas.data?.[0] ?? null;
  let mensagens: DadosFicha["mensagens"] = [];
  if (conversaAtual) {
    const { data } = await sb.from("mensagens").select("id, direcao, origem, conteudo, criado_em, autor_nome, privado, status_entrega")
      .eq("conversa_id", conversaAtual.id).order("criado_em", { ascending: true }).limit(300);
    mensagens = data ?? [];
  }

  // Outras carteiras do mesmo CPF ("Exposição total" do MC COB) e nomes da equipe
  const adm = supabaseAdmin();
  const carteira = d.carteiras as unknown as DadosFicha["carteira"];
  const [outras, equipe] = await Promise.all([
    sb.from("devedores").select("id, saldo, status_cobranca, carteiras(nome)").eq("cpf_cnpj", d.cpf_cnpj).neq("id", id).limit(20),
    carteira?.cobrador_id
      ? adm.from("usuarios_app").select("id, nome, role").or(`id.eq.${carteira.cobrador_id},cobrador_id.eq.${carteira.cobrador_id}`)
      : Promise.resolve({ data: [] as { id: string; nome: string | null; role: string }[] }),
  ]);
  const equipeOp = (equipe.data ?? []).filter((u) => u.role === "cobrador" || u.role === "negociador").map((u) => ({ id: u.id, nome: u.nome ?? "—" }));
  // A Zona de risco é só do administrador: os vínculos só são contados para ele
  const vinculos = sessao.role === "admin" ? ((await adm.rpc("fn_vinculos_devedor", { p_devedor_id: id })).data as Vinculos | null) : null;

  const dados: DadosFicha = {
    devedor: {
      id: d.id, nome: d.nome, cpf: d.cpf_cnpj, processo: d.processo, saldo: Number(d.saldo), vencimento: d.vencimento,
      cidade: d.cidade, uf: d.uf, emails: d.emails ?? [], tags: d.tags, fase: d.fase, motivo: d.motivo_inadimplencia,
      situacao: d.status_cobranca, responsavel_id: d.responsavel_id, ultimo_contato_em: d.ultimo_contato_em,
      inativo_em: d.inativo_em, inativado_por_nome: d.inativado_por_nome,
      titulo: { especie: d.titulo_especie, emissao: d.titulo_emissao, prescricao: d.prescricao_em, observacao: d.titulo_observacao },
    },
    carteira,
    proposta: prop.data?.valor_final != null ? { valor: Number(prop.data.valor_final), desconto_pct: Number(prop.data.desconto_pct ?? 0), ano: prop.data.ano_divida ?? null } : null,
    telefones: (fones.data ?? []).filter((t) => !t.excluido_em),
    telefonesExcluidos: (fones.data ?? []).filter((t) => !!t.excluido_em),
    conversa: conversaAtual,
    mensagens,
    ocorrencias: ocorrencias.data ?? [],
    agenda: agenda.data ?? [],
    acordos: (acordos.data ?? []) as DadosFicha["acordos"],
    pagamentos: pagamentos.data ?? [],
    bloqueado: (bloqueio.data?.length ?? 0) > 0,
    outras: (outras.data ?? []).map((o) => ({ id: o.id, saldo: Number(o.saldo), situacao: o.status_cobranca, carteira: (o.carteiras as unknown as { nome: string } | null)?.nome ?? "" })),
    equipe: equipeOp,
    responsavelNome: equipeOp.find((u) => u.id === d.responsavel_id)?.nome ?? null,
    // O texto extraído fica no servidor: a ficha só precisa saber se a leitura deu certo
    documentos: (documentos.data ?? []).map(({ texto_extraido, ...doc }) => ({ ...doc, texto_lido: !!texto_extraido })),
    analises: (analises.data ?? []) as DadosFicha["analises"],
    casos: (casos.data ?? []) as DadosFicha["casos"],
    vinculos,
  };

  // Inativo sai da operação: a ficha fica só para leitura até o administrador reativar
  const opera = podeOperar(sessao.role) && !d.inativo_em;
  return <Ficha dados={dados} abaInicial={aba ?? "resumo"} podeOperar={opera} podeJuridico={podeJuridico(sessao.role) && !d.inativo_em} papel={sessao.role} meuId={sessao.user.id} />;
}
