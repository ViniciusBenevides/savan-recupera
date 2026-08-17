// Application API do Chatwoot — o lado "atendimento" (conversas, mensagens, notas, status).
// `chatwoot.ts` cuida do provisionamento de inbox; aqui fica o que a caixa de entrada do painel
// usa para responder no lugar do agente humano.
//
// Por que passar pelo Chatwoot em vez de falar direto com a Graph API: o inbox é do tipo
// whatsapp_cloud, então quem entrega a mensagem no WhatsApp é o Chatwoot. Mandar pela Meta por
// fora criaria uma mensagem que o Chatwoot nunca veria — e o histórico das duas pontas divergiria.
import { supabaseAdmin } from "@/lib/supabase-server";
import { getSegredo } from "@/lib/segredos";

export type ContaChatwoot = { url: string; accountId: number; token: string };

export type FalhaChatwoot = { ok: false; erro: string; status?: number };
export type RespostaChatwoot<T> = ({ ok: true } & T) | FalhaChatwoot;

// url/account_id vivem em `configuracoes` (visível no painel); o token vive em `segredos`
// (nunca sai do servidor). Os dois precisam existir para qualquer envio.
export async function contaChatwoot(): Promise<ContaChatwoot | null> {
  const { data } = await supabaseAdmin()
    .from("configuracoes").select("valor").eq("chave", "chatwoot").is("cobrador_id", null).maybeSingle();
  const cfg = (data?.valor ?? null) as { url?: string; account_id?: number } | null;
  const url = String(cfg?.url ?? "").replace(/\/$/, "");
  const token = await getSegredo("CHATWOOT_TOKEN", null);
  if (!url || !token) return null;
  return { url, accountId: Number(cfg?.account_id ?? 1), token };
}

async function cw(
  conta: ContaChatwoot,
  caminho: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; corpo: any }> {
  const r = await fetch(`${conta.url}/api/v1/accounts/${conta.accountId}${caminho}`, {
    ...init,
    headers: {
      api_access_token: conta.token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const corpo = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, corpo };
}

// Traduz a falha do Chatwoot para uma frase que o operador entende. O erro que mais aparece é o
// 422 da Meta rebatido pelo Chatwoot quando a janela de 24h fechou entre a checagem e o envio.
function explicar(status: number, corpo: any): string {
  const bruto = String(
    corpo?.message ?? corpo?.error ??
    (Array.isArray(corpo?.errors) ? corpo.errors.join(", ") : "") ?? "",
  ).trim();
  if (/131047|24 hours|re-?engagement/i.test(bruto)) {
    return "O WhatsApp recusou: a janela de 24h desta conversa fechou. Só sai modelo aprovado agora.";
  }
  if (status === 401 || status === 403) {
    return "O Chatwoot recusou o token de atendimento. Confira a chave CHATWOOT_TOKEN em Ajustes.";
  }
  if (status === 404) return "Conversa não encontrada no Chatwoot.";
  return bruto ? `O Chatwoot recusou o envio (${status}): ${bruto}` : `O Chatwoot respondeu ${status}.`;
}

export type MensagemEnviada = { chatwoot_message_id: number | null; conteudo: string };

/** Texto livre do agente — só vale dentro da janela de 24h. */
export async function enviarTexto(
  conta: ContaChatwoot,
  conversationId: number,
  conteudo: string,
): Promise<RespostaChatwoot<MensagemEnviada>> {
  const { ok, status, corpo } = await cw(conta, `/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: conteudo, message_type: "outgoing" }),
  });
  if (!ok) return { ok: false, erro: explicar(status, corpo), status };
  return { ok: true, chatwoot_message_id: Number(corpo?.id) || null, conteudo };
}

/** Nota interna: fica no histórico da equipe e nunca chega ao contato. */
export async function enviarNota(
  conta: ContaChatwoot,
  conversationId: number,
  conteudo: string,
): Promise<RespostaChatwoot<MensagemEnviada>> {
  const { ok, status, corpo } = await cw(conta, `/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: conteudo, message_type: "outgoing", private: true }),
  });
  if (!ok) return { ok: false, erro: explicar(status, corpo), status };
  return { ok: true, chatwoot_message_id: Number(corpo?.id) || null, conteudo };
}

export type TemplateRenderizado = {
  name: string; language: string; category: string; params: string[]; texto: string;
};

/**
 * Modelo aprovado — o único caminho fora da janela de 24h.
 * `content` vai com o texto já renderizado para que painel e Chatwoot mostrem exatamente o que a
 * pessoa recebeu, e não `{{1}}`. Mesmo formato usado pelo disparo da campanha (edge disparar-teste).
 */
export async function enviarTemplate(
  conta: ContaChatwoot,
  conversationId: number,
  tpl: TemplateRenderizado,
): Promise<RespostaChatwoot<MensagemEnviada>> {
  const { ok, status, corpo } = await cw(conta, `/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: tpl.texto,
      message_type: "outgoing",
      template_params: {
        name: tpl.name,
        category: tpl.category.toLowerCase(),
        language: tpl.language,
        processed_params: Object.fromEntries(tpl.params.map((p, i) => [String(i + 1), p])),
      },
    }),
  });
  if (!ok) return { ok: false, erro: explicar(status, corpo), status };
  return { ok: true, chatwoot_message_id: Number(corpo?.id) || null, conteudo: tpl.texto };
}

/** Mantém o status do Chatwoot alinhado ao estado da conversa no painel. Best-effort. */
export async function alternarStatus(
  conta: ContaChatwoot,
  conversationId: number,
  status: "open" | "resolved" | "pending",
): Promise<boolean> {
  try {
    const r = await cw(conta, `/conversations/${conversationId}/toggle_status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    return r.ok;
  } catch { return false; }
}

export type RespostaPronta = { id: number; atalho: string; titulo: string; conteudo: string };

/** Respostas prontas (canned responses) da conta — o "/" da caixa de entrada. */
export async function respostasProntas(conta: ContaChatwoot): Promise<RespostaPronta[]> {
  try {
    const { ok, corpo } = await cw(conta, "/canned_responses");
    if (!ok) return [];
    const lista = Array.isArray(corpo) ? corpo : (corpo?.payload ?? []);
    return (lista as any[])
      .map((c) => ({
        id: Number(c?.id) || 0,
        atalho: String(c?.short_code ?? "").trim(),
        // O Chatwoot guarda o conteúdo em HTML leve; a caixa de entrada é texto puro.
        titulo: String(c?.short_code ?? "").trim(),
        conteudo: String(c?.content ?? "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .trim(),
      }))
      .filter((c) => c.id && c.conteudo);
  } catch { return []; }
}

// ── Modelos aprovados da Meta ──────────────────────────────────────────────────────────────
export type ModeloDisponivel = {
  name: string; language: string; category: string; texto: string; variaveis: number;
};

function corpoDoTemplate(components: unknown): string {
  const lista = Array.isArray(components) ? components : [];
  const body = lista.find((c: any) => c?.type === "BODY");
  return String((body as any)?.text ?? "");
}

/** Quantos `{{n}}` o corpo do modelo espera — a Meta recusa se vier número diferente. */
export function contarVariaveis(texto: string): number {
  const marcas = texto.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  const indices = marcas.map((m) => Number(m.replace(/\D/g, "")));
  return indices.length ? Math.max(...indices) : 0;
}

/** Modelos APROVADOS que este chip pode usar (os do dono do chip + os globais). */
export async function modelosAprovados(cobradorId: string | null): Promise<ModeloDisponivel[]> {
  const admin = supabaseAdmin();
  let q = admin.from("meta_templates")
    .select("name, language, category, components, cobrador_id")
    .eq("status", "APPROVED");
  q = cobradorId ? q.or(`cobrador_id.is.null,cobrador_id.eq.${cobradorId}`) : q;
  const { data } = await q.order("name");
  const vistos = new Set<string>();
  const out: ModeloDisponivel[] = [];
  for (const t of (data ?? []) as any[]) {
    const chave = `${t.name}|${t.language}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const texto = corpoDoTemplate(t.components);
    if (!texto) continue;
    out.push({
      name: t.name, language: t.language, category: String(t.category ?? "UTILITY"),
      texto, variaveis: contarVariaveis(texto),
    });
  }
  return out;
}

/** Resolve o modelo pedido e substitui `{{n}}` pelos valores digitados pelo operador. */
export async function renderizarModelo(
  cobradorId: string | null,
  pedido: { name: string; language?: string; params?: unknown },
): Promise<{ ok: true; tpl: TemplateRenderizado } | FalhaChatwoot> {
  const nome = String(pedido?.name ?? "").trim();
  if (!nome) return { ok: false, erro: "Escolha um modelo aprovado." };
  const disponiveis = await modelosAprovados(cobradorId);
  const modelo = disponiveis.find(
    (m) => m.name === nome && (!pedido.language || m.language === pedido.language),
  );
  if (!modelo) {
    return { ok: false, erro: "Modelo não encontrado entre os aprovados pela Meta. Sincronize em Ajustes › Integrações." };
  }
  const params = (Array.isArray(pedido.params) ? pedido.params : []).map((p) => String(p ?? "").trim());
  if (params.length !== modelo.variaveis || params.some((p) => !p)) {
    return {
      ok: false,
      erro: modelo.variaveis === 0
        ? "Este modelo não aceita variáveis."
        : `Este modelo pede ${modelo.variaveis} valor(es) e nenhum pode ficar vazio.`,
    };
  }
  let texto = modelo.texto;
  params.forEach((p, i) => { texto = texto.replaceAll(`{{${i + 1}}}`, p); });
  return {
    ok: true,
    tpl: { name: modelo.name, language: modelo.language, category: modelo.category, params, texto },
  };
}

// ── Janela de 24h da Cloud API ─────────────────────────────────────────────────────────────
export const JANELA_MS = 24 * 60 * 60 * 1000;

export function dentroDaJanela(ultimaEntradaEm: string | null | undefined): boolean {
  if (!ultimaEntradaEm) return false;
  const t = new Date(ultimaEntradaEm).getTime();
  return Number.isFinite(t) && Date.now() - t < JANELA_MS;
}
