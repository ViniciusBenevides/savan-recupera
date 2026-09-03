// Por onde uma conversa aceita mensagem AGORA — e sob que regra.
//
// Isto existe porque o painel aplicava a regra da Meta em toda conversa: janela de 24h e modelo
// aprovado. Com a WABA banida (§38) e o canal em Baileys, a consequência era o pior dos mundos —
// o operador ficava barrado de responder texto livre (que na Baileys sempre pode) e era empurrado
// para modelos de uma conta que não entrega mais nada.
//
// A regra do canal é a mesma do fluxo do robô: **o conector do chip escolhe o caminho de saída.**
//   • baileys / baileys_chatwoot → texto livre sempre, envio direto pela Edge Function
//     `enviar-mensagem` (ADR-0002), que escolhe o transporte pelo conector. Sem template.
//   • meta_cloud → janela de 24h e, fora dela, só modelo aprovado — pelo Chatwoot
//
// O que NÃO muda com o conector: bloqueio de contato. "Não perturbe" é trava de banco e vale para
// todos os chips, presentes e futuros (ADR-0003).

import { supabaseAdmin } from "@/lib/supabase-server";
import { CONECTOR_PADRAO, ehConectorBaileys, ehConectorSuportado, type Conector } from "@/lib/conector";
import { dentroDaJanela, JANELA_MS } from "@/lib/chatwoot-atendimento";
import type { ConversaAtendimento } from "@/lib/conversas";

export type ChipDaConversa = {
  id: number;
  nome: string;
  conector: Conector;
  papel: string;
  status: string;
  numero_e164: string | null;
  instancia_evolution: string | null;
  chatwoot_inbox_id: number | null;
  cobrador_id: string | null;
};

export type CanalConversa = {
  chip: ChipDaConversa | null;
  conector: Conector;
  /** Por onde a mensagem sai. `nenhum` = não há caminho, e a caixa de texto não deve aparecer. */
  caminho: "evolution" | "chatwoot" | "nenhum";
  /** Motivo de `caminho: "nenhum"`, em português, pronto para a tela. */
  impedimento: string | null;
  /** A janela de 24h da Cloud API se aplica a este canal? Na Baileys, não. */
  janela_aplica: boolean;
  na_janela: boolean;
  janela_expira_em: string | null;
  /** Texto livre é permitido agora? */
  texto_livre: boolean;
  /** Modelo aprovado da Meta faz sentido aqui? */
  usa_modelo: boolean;
  /**
   * Escrever agora é ABORDAGEM — mensagem para quem não escreveu primeiro (CONTEXT.md). Não é
   * proibição: é o aviso de que esta é a categoria de envio que derruba número, e que na Baileys
   * nada do lado do WhatsApp vai barrar por você.
   */
  abordagem: boolean;
  /** O ponteiro do Chatwoot aponta para a inbox do chip atual? */
  ponteiro_valido: boolean;
  /** Telefone do devedor, para o envio direto pela Evolution. */
  telefone_e164: string | null;
};

function normalizarConector(valor: unknown): Conector {
  const bruto = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  return ehConectorSuportado(bruto) ? bruto : CONECTOR_PADRAO;
}

/** Bloqueio permanente de contato: por devedor ou por telefone. Vence qualquer outra regra. */
async function bloqueioDeContato(devedorId: number, telefone: string | null): Promise<string | null> {
  const admin = supabaseAdmin();
  const alvos = [`devedor_id.eq.${devedorId}`];
  if (telefone) alvos.push(`telefone_e164.eq.${telefone}`);
  const { data } = await admin
    .from("bloqueios_contato")
    .select("motivo")
    .or(alvos.join(","))
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const motivo = String(data.motivo ?? "");
  if (motivo === "nao_perturbe") {
    return "Esta pessoa pediu para não ser contatada. A trava vale para todos os números, para sempre.";
  }
  if (motivo === "pessoa_errada") {
    return "Este número está marcado como de outra pessoa. Corrija o cadastro do devedor antes de escrever.";
  }
  if (motivo === "falecimento") return "Contato bloqueado por falecimento registrado.";
  if (motivo === "denuncia") return "Contato bloqueado após denúncia. Não escreva por aqui.";
  return "Contato bloqueado permanentemente.";
}

/** Estados de conversa que, por si sós, fecham a porta. */
function impedimentoPeloEstado(conversa: ConversaAtendimento): string | null {
  if (conversa.estado === "optout") {
    return "Esta pessoa pediu para não ser mais contatada. Escrever para ela não é permitido por aqui.";
  }
  if (conversa.estado === "encerrada" && conversa.motivo_encerramento === "pessoa_errada") {
    return "Este número foi marcado como de outra pessoa. Corrija o cadastro do devedor antes de escrever.";
  }
  return null;
}

/**
 * Para onde a mensagem vai. Quando a conversa não aponta para um telefone, cai no MESMO critério
 * que a importação usa para escolher o número da abordagem: o primeiro móvel por `ordem`; sem
 * móvel, o primeiro da lista (`api/carteiras/[id]/importar`).
 *
 * A `conversas.telefone_id` fica nula com facilidade — a FK é `on delete set null`, e conversa
 * que nasce de uma resposta recebida pode vir sem ela. O filtro antigo era
 * `.eq("principal", true)`, e `telefones_devedor` nunca teve coluna `principal`: o Postgres
 * devolvia 42703, o cliente devolvia `data: null` sem lançar, e o painel dizia ao operador que o
 * devedor não tinha telefone enquanto a ficha, que lê a tabela direto, listava quatro.
 */
async function telefoneDaConversa(conversa: ConversaAtendimento): Promise<string | null> {
  const admin = supabaseAdmin();
  if (conversa.telefone_id) {
    const { data } = await admin.from("telefones_devedor")
      .select("telefone_e164").eq("id", conversa.telefone_id).maybeSingle();
    if (data?.telefone_e164) return data.telefone_e164 as string;
  }
  const { data: tels } = await admin.from("telefones_devedor")
    .select("telefone_e164, tipo").eq("devedor_id", conversa.devedor_id).order("ordem");
  const lista = (tels ?? []) as { telefone_e164: string; tipo: string | null }[];
  const escolhido = lista.find((t) => t.tipo === "movel") ?? lista[0];
  return escolhido?.telefone_e164 ?? null;
}

export async function canalDaConversa(conversa: ConversaAtendimento): Promise<CanalConversa> {
  const admin = supabaseAdmin();

  const [{ data: chipRaw }, telefone] = await Promise.all([
    conversa.chip_id
      ? admin.from("chips")
          .select("id, nome, conector, papel, status, numero_e164, instancia_evolution, chatwoot_inbox_id, cobrador_id")
          .eq("id", conversa.chip_id).maybeSingle()
      : Promise.resolve({ data: null }),
    telefoneDaConversa(conversa),
  ]);

  const chip: ChipDaConversa | null = chipRaw
    ? { ...(chipRaw as any), conector: normalizarConector((chipRaw as any).conector) }
    : null;
  const conector = chip?.conector ?? CONECTOR_PADRAO;

  const naJanela = dentroDaJanela(conversa.ultima_entrada_em);
  const janelaExpira = conversa.ultima_entrada_em
    ? new Date(new Date(conversa.ultima_entrada_em).getTime() + JANELA_MS).toISOString()
    : null;
  const ponteiroValido =
    conversa.chatwoot_conversation_id != null &&
    chip?.chatwoot_inbox_id != null &&
    conversa.chatwoot_inbox_id === chip.chatwoot_inbox_id;

  const base = {
    chip,
    conector,
    janela_aplica: conector === "meta_cloud",
    na_janela: naJanela,
    janela_expira_em: janelaExpira,
    abordagem: !naJanela,
    ponteiro_valido: ponteiroValido,
    telefone_e164: telefone,
  };

  const fechado = (impedimento: string): CanalConversa => ({
    ...base, caminho: "nenhum", impedimento, texto_livre: false, usa_modelo: false,
  });

  const bloqueio = impedimentoPeloEstado(conversa)
    ?? await bloqueioDeContato(conversa.devedor_id, telefone);
  if (bloqueio) return fechado(bloqueio);

  if (!chip) return fechado("Esta conversa não está ligada a nenhum número — não há por onde responder.");
  if (chip.papel === "equipe") {
    return fechado("Este número é de escalador humano; ele não conversa pelo painel.");
  }

  // ── Baileys: o caminho do dia a dia ─────────────────────────────────────────────────────────
  // Sai direto pela Evolution, com presença e "digitando…" (ADR-0002). Não depende do ponteiro do
  // Chatwoot — o endereço é o telefone — e por isso funciona também nas conversas que ficaram
  // apontando para a inbox do número banido.
  if (ehConectorBaileys(conector)) {
    // Só a Evolution é endereçada por instância; no baileys_chatwoot o endereço é o próprio
    // numero_e164 do chip, então exigir instância aqui fecharia um canal que está no ar.
    if (conector === "baileys" && !chip.instancia_evolution) {
      return fechado(`O número ${chip.nome} ainda não foi conectado por QR — não há sessão para enviar.`);
    }
    if (!telefone) {
      return fechado("Este devedor não tem telefone cadastrado — não há para onde enviar.");
    }
    return { ...base, caminho: "evolution", impedimento: null, texto_livre: true, usa_modelo: false };
  }

  // ── Meta Cloud: preservado, e suspenso ──────────────────────────────────────────────────────
  // O código fica (§39), mas a WABA da MC CRED está banida desde 17/08/2026. Se o ponteiro aponta
  // para a inbox dela, dizer isso é melhor que deixar o operador escrever para o vazio: o Chatwoot
  // aceita o POST, devolve um id, e a Meta descarta.
  if (!ponteiroValido) {
    return fechado(
      "Esta conversa ainda aponta para a caixa do número oficial, que está banido desde 17/08/2026. " +
      "Nada enviado por aqui chega ao destinatário — ela volta a aceitar mensagem quando for atendida por um número ativo.",
    );
  }
  return {
    ...base,
    caminho: "chatwoot",
    impedimento: null,
    texto_livre: naJanela,
    usa_modelo: true,
  };
}
