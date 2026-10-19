// A fila "Trabalho de hoje": quem chamar agora e por quê.
// Junta seis fontes numa lista só, na ordem de urgência, e marca como feito (riscado) o que já teve
// um contato registrado hoje depois do motivo que trouxe a pessoa para a fila. Lê com o cliente da
// sessão, então cada papel vê só o que pode (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import { inicioDoDiaSP, fimDoDiaSP, somarDias, diaISO, margem, deDiaISO } from "@/lib/datas";
import { lerMensagem, type Intencao } from "@/lib/ia/ler-mensagem";

export type Grupo = "respondeu" | "esfriando" | "promessa" | "parcela" | "retorno" | "sem_contato";

export const GRUPOS: { id: Grupo; titulo: string; tom: "quente" | "morno" | "normal" }[] = [
  { id: "respondeu", titulo: "Responderam e esperam você", tom: "quente" },
  { id: "esfriando", titulo: "Esfriando · quiseram pagar e sumiram", tom: "morno" },
  { id: "promessa", titulo: "Promessas de hoje e atrasadas", tom: "normal" },
  { id: "parcela", titulo: "Parcelas de acordo", tom: "normal" },
  { id: "retorno", titulo: "Retornos marcados", tom: "normal" },
  { id: "sem_contato", titulo: "Sem contato há muito tempo", tom: "normal" },
];

export type AcaoFila =
  | "responder" | "gerar_pix" | "chamar" | "conferir" | "lembrar" | "cobrar_parcela" | "retornar"
  | "explicar_cessao" | "explicar_divida" | "propor_parcelas" | "anotar_data" | "passar_valor" | "pedir_comprovante"
  | "encerrar";

export type ItemFila = {
  chave: string;
  grupo: Grupo;
  devedor_id: number;
  nome: string;
  carteira: string;
  momento: string;      // ISO do que trouxe a pessoa para a fila
  margem: string;       // o que vai escrito na margem (hora, "ontem", data)
  atrasado: boolean;
  motivo: string;
  citacao: string | null;
  acao: AcaoFila;
  acaoRotulo: string;
  valor: number | null;
  valorRotulo: string;
  conversa_id: number | null;
  agenda_id: number | null;
  parcela_id: number | null;
};

export type Feito = { devedor_id: number; nome: string; carteira: string; resultado: string; autor: string | null; hora: string; descricao: string | null };

export type FilaHoje = { grupos: { id: Grupo; titulo: string; tom: string; itens: ItemFila[] }[]; feitos: Feito[]; total: number; riscados: number };

type Dev = { id: number; nome: string; saldo: number; carteira_id: number; status_cobranca: string; ultimo_contato_em: string | null };

const ROT_ACAO: Record<AcaoFila, string> = {
  responder: "Responder",
  gerar_pix: "Gerar Pix",
  chamar: "Chamar de novo",
  conferir: "Conferir pagamento",
  lembrar: "Lembrar",
  cobrar_parcela: "Cobrar parcela",
  retornar: "Retornar",
  explicar_cessao: "Explicar a cessão",
  explicar_divida: "Explicar a dívida",
  propor_parcelas: "Propor parcelas",
  anotar_data: "Anotar a data",
  passar_valor: "Passar o valor",
  pedir_comprovante: "Pedir comprovante",
  encerrar: "Encerrar com respeito",
};

// O verbo da linha sai do que a pessoa escreveu, não de um "Responder" genérico: quem pergunta se é
// golpe precisa ouvir quem comprou a dívida; quem diz "já paguei" precisa mandar o comprovante.
const ACAO_DA_INTENCAO: Partial<Record<Intencao, AcaoFila>> = {
  quer_pagar: "gerar_pix", promessa: "anotar_data", pediu_parcelar: "propor_parcelas", pediu_retorno: "anotar_data",
  ja_pagou: "pedir_comprovante", desconfiado: "explicar_cessao", nao_reconhece: "explicar_divida",
  sem_condicao: "propor_parcelas", pergunta_valor: "passar_valor", recusa: "encerrar", nao_perturbe: "encerrar",
  pessoa_errada: "encerrar", falecido: "encerrar",
};

export async function montarFilaHoje(sb: SupabaseClient, agora = new Date()): Promise<FilaHoje> {
  const ini = inicioDoDiaSP(agora).toISOString();
  const fim = fimDoDiaSP(agora).toISOString();
  const amanha = diaISO(somarDias(agora, 1));
  const hojeISO = diaISO(agora);

  const [esperando, pixPendente, frias, agendaHoje, parcelas, ocHoje, carteiras, agendaFutura] = await Promise.all([
    sb.from("v_conversas_esperando").select("id, devedor_id, ultima_msg_em").order("ultima_msg_em", { ascending: true }).limit(200),
    sb.from("pagamentos").select("id, devedor_id, valor, criado_em").eq("status", "pendente").eq("simulacao", false)
      .lt("criado_em", new Date(agora.getTime() - 2 * 3600_000).toISOString())
      .gt("criado_em", new Date(agora.getTime() - 10 * 86_400_000).toISOString()).limit(200),
    sb.from("conversas").select("id, devedor_id, ultima_msg_em, ultima_msg_de, estado")
      .in("estado", ["humano", "pix_enviado"]).in("ultima_msg_de", ["humano", "bot"])
      .lt("ultima_msg_em", new Date(agora.getTime() - 12 * 3600_000).toISOString())
      .gt("ultima_msg_em", new Date(agora.getTime() - 10 * 86_400_000).toISOString()).limit(300),
    sb.from("agenda").select("id, devedor_id, tipo, quando, dia_inteiro, valor, observacao").eq("status", "pendente").lte("quando", fim).order("quando").limit(400),
    sb.from("acordo_parcelas").select("id, numero, vencimento, valor, acordos!inner(id, devedor_id, parcelas, status)")
      .eq("status", "aberta").eq("acordos.status", "ativo").lte("vencimento", amanha).order("vencimento").limit(400),
    sb.from("ocorrencias").select("devedor_id, resultado, autor_nome, descricao, criado_em").gte("criado_em", ini).order("criado_em", { ascending: false }).limit(1000),
    sb.from("carteiras").select("id, nome, dias_sem_contato_max, status"),
    sb.from("agenda").select("devedor_id").eq("status", "pendente").limit(5000),
  ]);

  const nomeCarteira = new Map<number, string>((carteiras.data ?? []).map((c) => [c.id, c.nome]));
  const ativas = (carteiras.data ?? []).filter((c) => c.status === "ativa");
  const menorSemContato = Math.min(...ativas.map((c) => c.dias_sem_contato_max ?? 15), 365);

  const semContato = ativas.length
    ? await sb.from("devedores").select("id, nome, saldo, carteira_id, status_cobranca, ultimo_contato_em")
        .in("carteira_id", ativas.map((c) => c.id)).in("status_cobranca", ["em_negociacao", "contatado"])
        .lt("ultimo_contato_em", new Date(agora.getTime() - menorSemContato * 86_400_000).toISOString())
        .order("ultimo_contato_em", { ascending: true }).limit(60)
    : { data: [] as Dev[] };

  // Devedores envolvidos
  const ids = new Set<number>();
  for (const r of esperando.data ?? []) ids.add(r.devedor_id);
  for (const r of pixPendente.data ?? []) ids.add(r.devedor_id);
  for (const r of frias.data ?? []) ids.add(r.devedor_id);
  for (const r of agendaHoje.data ?? []) ids.add(r.devedor_id);
  for (const r of parcelas.data ?? []) ids.add((r.acordos as unknown as { devedor_id: number }).devedor_id);
  for (const r of ocHoje.data ?? []) ids.add(r.devedor_id);
  const devs = new Map<number, Dev>();
  for (const d of (semContato.data ?? []) as Dev[]) devs.set(d.id, d);
  const faltam = [...ids].filter((i) => !devs.has(i));
  for (let i = 0; i < faltam.length; i += 200) {
    const { data } = await sb.from("devedores").select("id, nome, saldo, carteira_id, status_cobranca, ultimo_contato_em").in("id", faltam.slice(i, i + 200));
    for (const d of (data ?? []) as Dev[]) devs.set(d.id, d);
  }

  // Última mensagem recebida de cada conversa esperando
  const convIds = (esperando.data ?? []).map((c) => c.id);
  const citacoes = new Map<number, string>();
  if (convIds.length) {
    const { data } = await sb.from("mensagens").select("conversa_id, conteudo, criado_em, direcao")
      .in("conversa_id", convIds).eq("direcao", "entrada").order("criado_em", { ascending: false }).limit(convIds.length * 4);
    for (const m of data ?? []) if (!citacoes.has(m.conversa_id) && m.conteudo) citacoes.set(m.conversa_id, m.conteudo);
  }

  // Último contato de hoje por devedor (para riscar)
  const ultimoHoje = new Map<number, { criado_em: string; resultado: string; autor_nome: string | null; descricao: string | null }>();
  for (const o of ocHoje.data ?? []) if (!ultimoHoje.has(o.devedor_id)) ultimoHoje.set(o.devedor_id, o);
  const feitoDepois = (devId: number, momento: string) => {
    const o = ultimoHoje.get(devId);
    return !!o && new Date(o.criado_em) >= new Date(momento);
  };

  const usados = new Set<number>();
  const itens: ItemFila[] = [];
  const base = (d: Dev, grupo: Grupo, momento: string, extra: Partial<ItemFila>): ItemFila => ({
    chave: `${grupo}-${d.id}-${extra.agenda_id ?? extra.parcela_id ?? extra.conversa_id ?? ""}`,
    grupo, devedor_id: d.id, nome: d.nome, carteira: nomeCarteira.get(d.carteira_id) ?? "",
    momento, margem: margem(momento, agora), atrasado: false, motivo: "", citacao: null,
    acao: "responder", acaoRotulo: ROT_ACAO.responder, valor: null, valorRotulo: "dívida",
    conversa_id: null, agenda_id: null, parcela_id: null, ...extra,
  });
  const comAcao = (a: AcaoFila) => ({ acao: a, acaoRotulo: ROT_ACAO[a] });

  // 1. Responderam e esperam você
  for (const c of esperando.data ?? []) {
    const d = devs.get(c.devedor_id);
    if (!d || usados.has(d.id) || feitoDepois(d.id, c.ultima_msg_em)) continue;
    const citacao = citacoes.get(c.id) ?? null;
    const acao = citacao ? ACAO_DA_INTENCAO[lerMensagem(citacao, agora).intencao] ?? "responder" : "responder";
    itens.push(base(d, "respondeu", c.ultima_msg_em, {
      conversa_id: c.id, citacao, motivo: citacao ? `"${citacao}"` : "Mandou uma mensagem.",
      ...comAcao(acao), valor: d.saldo, valorRotulo: "dívida",
    }));
    usados.add(d.id);
  }
  // 2. Esfriando: Pix gerado e não pago, ou conversa quente parada. Quem tem compromisso na agenda
  //    (hoje ou para frente) não está esfriando: entra no grupo do compromisso ou espera o dia.
  const futuroPendente = new Set<number>((agendaFutura.data ?? []).map((a) => a.devedor_id));
  for (const p of pixPendente.data ?? []) {
    const d = devs.get(p.devedor_id);
    if (!d || usados.has(d.id) || feitoDepois(d.id, ini)) continue;
    itens.push(base(d, "esfriando", p.criado_em, {
      motivo: `Pediu o Pix ${margem(p.criado_em, agora) === "ontem" ? "ontem" : "em " + margem(p.criado_em, agora)} e não pagou.`,
      ...comAcao("chamar"), valor: Number(p.valor), valorRotulo: "Pix",
    }));
    usados.add(d.id);
  }
  for (const c of frias.data ?? []) {
    const d = devs.get(c.devedor_id);
    if (!d || usados.has(d.id) || futuroPendente.has(d.id) || !["em_negociacao", "pix_gerado"].includes(d.status_cobranca)) continue;
    if (feitoDepois(d.id, ini)) continue;
    const horas = Math.round((agora.getTime() - new Date(c.ultima_msg_em).getTime()) / 3600_000);
    itens.push(base(d, "esfriando", c.ultima_msg_em, {
      conversa_id: c.id, motivo: `Sem resposta há ${horas >= 48 ? `${Math.round(horas / 24)} dias` : `${horas} h`}, depois de mostrar interesse.`,
      ...comAcao("chamar"), valor: d.saldo, valorRotulo: "dívida",
    }));
    usados.add(d.id);
  }
  // 3. Promessas (hoje e as que venceram sem pagamento) e 5. Retornos
  for (const a of agendaHoje.data ?? []) {
    const d = devs.get(a.devedor_id);
    if (!d || usados.has(d.id)) continue;
    const venceu = new Date(a.quando) < new Date(ini);
    if (feitoDepois(d.id, ini)) continue;
    if (a.tipo === "promessa") {
      itens.push(base(d, "promessa", a.quando, {
        agenda_id: a.id, atrasado: venceu,
        margem: a.dia_inteiro ? (venceu ? margem(deDiaISO(diaISO(new Date(a.quando))), agora) : "hoje") : margem(a.quando, agora),
        motivo: venceu ? `Prometeu para ${margem(a.quando, agora)} e não pagou.${a.observacao ? " " + a.observacao : ""}`
          : `Prometeu pagar hoje${a.dia_inteiro ? "" : ` às ${margem(a.quando, agora)}`}.${a.observacao ? " " + a.observacao : ""}`,
        ...comAcao("conferir"), valor: a.valor ? Number(a.valor) : null, valorRotulo: "prometido",
      }));
    } else {
      itens.push(base(d, "retorno", a.quando, {
        agenda_id: a.id, atrasado: venceu,
        motivo: a.observacao || (venceu ? "Retorno que ficou para trás." : "Retorno marcado para hoje."),
        ...comAcao("retornar"), valor: d.saldo, valorRotulo: "dívida",
      }));
    }
    usados.add(d.id);
  }
  // 4. Parcelas (vencendo amanhã, hoje ou atrasadas)
  for (const p of parcelas.data ?? []) {
    const ac = p.acordos as unknown as { id: number; devedor_id: number; parcelas: number };
    const d = devs.get(ac.devedor_id);
    if (!d || usados.has(d.id) || feitoDepois(d.id, ini)) continue;
    const quando = deDiaISO(p.vencimento);
    const atrasada = p.vencimento < hojeISO;
    const rotulo = p.numero === 0 ? "Entrada" : `Parcela ${p.numero} de ${ac.parcelas}`;
    itens.push(base(d, "parcela", quando.toISOString(), {
      parcela_id: p.id, atrasado: atrasada, margem: margem(quando, agora),
      motivo: atrasada ? `${rotulo} do acordo está atrasada.` : p.vencimento === hojeISO ? `${rotulo} do acordo vence hoje.` : `${rotulo} do acordo vence amanhã.`,
      ...comAcao(atrasada ? "cobrar_parcela" : "lembrar"), valor: Number(p.valor), valorRotulo: p.numero === 0 ? "entrada" : `parcela ${p.numero}/${ac.parcelas}`,
    }));
    usados.add(d.id);
  }
  // 6. Sem contato há mais que o limite da carteira
  const limite = new Map<number, number>(ativas.map((c) => [c.id, c.dias_sem_contato_max ?? 15]));
  let nSem = 0;
  for (const d of (semContato.data ?? []) as Dev[]) {
    if (usados.has(d.id) || !d.ultimo_contato_em || nSem >= 12) continue;
    const dias = Math.round((agora.getTime() - new Date(d.ultimo_contato_em).getTime()) / 86_400_000);
    if (dias < (limite.get(d.carteira_id) ?? 15)) continue;
    itens.push(base(d, "sem_contato", d.ultimo_contato_em, {
      motivo: `Em negociação e sem contato há ${dias} dias.`, ...comAcao("chamar"), valor: d.saldo, valorRotulo: "dívida",
    }));
    usados.add(d.id); nSem++;
  }

  const feitos: Feito[] = [];
  for (const [devId, o] of ultimoHoje) {
    const d = devs.get(devId);
    if (!d) continue;
    feitos.push({ devedor_id: devId, nome: d.nome, carteira: nomeCarteira.get(d.carteira_id) ?? "", resultado: o.resultado, autor: o.autor_nome, hora: o.criado_em, descricao: o.descricao });
  }
  feitos.sort((a, b) => b.hora.localeCompare(a.hora));

  const grupos = GRUPOS.map((g) => ({ ...g, itens: itens.filter((i) => i.grupo === g.id) }));
  return { grupos, feitos, total: itens.length + feitos.length, riscados: feitos.length };
}
