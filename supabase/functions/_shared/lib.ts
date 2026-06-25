// SAVAN Recupera — utilitários compartilhados das Edge Functions
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Carrega os segredos da tabela `segredos` e RETORNA o mapa.
// (O runtime do Supabase bloqueia Deno.env.set, por isso lemos sempre do mapa.)
// As funções deployadas são self-contained; este módulo documenta o padrão.
export async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor");
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor;
  return m;
}

// ---------- Config ----------
export async function getConfig(sb: SupabaseClient): Promise<Record<string, any>> {
  const { data } = await sb.from("configuracoes").select("chave, valor");
  const cfg: Record<string, any> = {};
  for (const r of data ?? []) cfg[r.chave] = r.valor;
  return cfg;
}

// Carrega a carteira (overrides) por id. Retorna null se não houver.
export async function getCarteira(sb: SupabaseClient, carteiraId: number | null | undefined) {
  if (!carteiraId) return null;
  const { data } = await sb.from("carteiras")
    .select("id, nome, credor, status, prompt_persona, contexto_negocio, guardrails, config_override")
    .eq("id", carteiraId).maybeSingle();
  return data;
}

// Mescla o config global com o override da carteira (raso por chave de 1º nível).
export function mesclarConfig(cfg: Record<string, any>, carteira: any): Record<string, any> {
  const over = carteira?.config_override ?? {};
  return { ...cfg, ...over };
}

// Monta o system prompt do bot a partir de persona/contexto/guardrails
// (carteira tem prioridade; cai no padrão global de `configuracoes`; e por fim nos defaults).
export function montarSystemPrompt(cfg: any, carteira: any, prop: any): string {
  const nomeBot = cfg.ia?.nome_bot ?? "Ana";
  const primeiroNome = prop?.primeiro_nome ?? "a pessoa";
  const interp = (t: unknown) =>
    String(t ?? "").replaceAll("{{nome_bot}}", nomeBot).replaceAll("{{primeiro_nome}}", primeiroNome);

  const persona = carteira?.prompt_persona || cfg.bot_persona ||
    "Você é {{nome_bot}}, uma assistente de negociação simpática e objetiva. Seu objetivo é oferecer a QUITAÇÃO VOLUNTÁRIA de uma pendência antiga com desconto.";
  const contexto = carteira?.contexto_negocio || cfg.bot_contexto ||
    "Você atende em nome do credor responsável pela cobrança.";
  const g = carteira?.guardrails || cfg.bot_guardrails || {};

  const regras: string[] = [];
  const nuncaCitar = Array.isArray(g.nunca_citar) ? g.nunca_citar : [];
  if (nuncaCitar.length) {
    regras.push(`NUNCA mencione ${nuncaCitar.join(", ")}, nem QUALQUER consequência por não pagar.`);
  }
  regras.push("NUNCA invente valores. Use SOMENTE os números retornados pela tool consultar_divida.");
  if (g.responder_prescricao_honestamente !== false) {
    regras.push("Se perguntarem sobre prescrição ou se ainda precisa pagar: responda com honestidade que, por ser dívida antiga, pode estar prescrita e o pagamento é voluntário; a proposta é um encerramento definitivo com termo de quitação. Nunca pressione.");
  }
  if (g.confirmar_identidade !== false) {
    regras.push(`CONFIRME A IDENTIDADE antes de revelar qualquer dado. Pergunte se fala com ${primeiroNome}. Se não for a pessoa / número errado: peça desculpas, chame a tool pessoa_errada e encerre. NUNCA revele CPF, valor da dívida ou outros dados antes da confirmação.`);
  }
  regras.push("Se pedir para não ser mais contatada: chame a tool nao_perturbe, confirme educadamente e encerre.");
  regras.push("Se contestar a dívida, não reconhecer, citar advogado/Procon/justiça, ou for hostil: chame a tool escalar_humano.");
  const maxRodadas = Number(g.max_rodadas_desconto ?? 1);
  regras.push(`Desconto extra: no máximo ${maxRodadas} vez(es), e somente após recusa explícita da primeira proposta. Use a tool desconto_extra. Nunca ofereça abaixo do valor mínimo.`);
  if (g.regras_extras) regras.push(String(g.regras_extras));

  const tom = g.tom || "humano, caloroso, brasileiro, frases curtas, no máximo 2 perguntas por vez e 1 emoji por mensagem";

  return [
    interp(persona),
    interp(contexto),
    "",
    "REGRAS INEGOCIÁVEIS (violar qualquer uma é falha grave):",
    ...regras.map((r, i) => `${i + 1}. ${interp(r)}`),
    "",
    "FLUXO IDEAL: confirmar identidade -> contextualizar -> consultar_divida -> apresentar proposta (valor, desconto, validade) -> tratar objeções -> gerar_pix -> orientar pagamento -> avisar que após o pagamento envia o termo de quitação.",
    "",
    `ESTILO: ${interp(tom)}. Não soe robótica.`,
  ].join("\n");
}

// ---------- Spintax + template ----------
export function resolverSpintax(texto: string): string {
  // resolve {a|b|c} (não-aninhado) escolhendo uma opção ao acaso
  let prev = "";
  let cur = texto;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, grupo) => {
      const opcoes = grupo.split("|");
      return opcoes[Math.floor(Math.random() * opcoes.length)];
    });
  }
  return cur;
}

export function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  let txt = resolverSpintax(tpl);
  txt = txt.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, chave) => {
    const v = vars[chave];
    return v === undefined || v === null ? "" : String(v);
  });
  return txt;
}

export async function escolherTemplate(
  sb: SupabaseClient,
  tipo: string,
): Promise<{ id: number; conteudo: string } | null> {
  const { data } = await sb
    .from("templates_mensagem")
    .select("id, conteudo, peso")
    .eq("tipo", tipo)
    .eq("ativo", true);
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, t) => s + (t.peso ?? 1), 0);
  let r = Math.random() * total;
  for (const t of data) {
    r -= t.peso ?? 1;
    if (r <= 0) return { id: t.id, conteudo: t.conteudo };
  }
  return { id: data[0].id, conteudo: data[0].conteudo };
}

// ---------- Janela de horário ----------
// Feriados nacionais (base bancária/ANBIMA: fixos + móveis via Páscoa) p/ "pular feriado".
export function feriadosNacionais(ano: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;
  const s = new Set<string>([
    iso(ano, 1, 1), iso(ano, 4, 21), iso(ano, 5, 1), iso(ano, 9, 7),
    iso(ano, 10, 12), iso(ano, 11, 2), iso(ano, 11, 15), iso(ano, 11, 20), iso(ano, 12, 25),
  ]);
  // Páscoa (Meeus/Jones/Butcher) → feriados móveis.
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pascoa = Date.UTC(ano, mes - 1, dia);
  const off = (o: number) => { const dt = new Date(pascoa + o * 86400000); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };
  s.add(off(-48)); s.add(off(-47)); // Carnaval (segunda/terça)
  s.add(off(-2));                   // Sexta-feira Santa
  s.add(off(60));                   // Corpus Christi
  return s;
}
export function ehFeriadoHoje(janela: any, tz: string): boolean {
  if (janela?.pular_feriados === false) return false; // só pula quando habilitado (padrão: pula)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const extras: string[] = Array.isArray(janela?.feriados_extra) ? janela.feriados_extra : [];
  return feriadosNacionais(Number(hoje.slice(0, 4))).has(hoje) || extras.includes(hoje);
}
export function dentroDaJanela(janela: any): boolean {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const partes = fmt.formatToParts(agora);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const minutosAgora = h * 60 + m;

  // dia da semana 0=dom..6=sab no fuso
  const diaTz = new Date(agora.toLocaleString("en-US", { timeZone: tz }));
  const dow = diaTz.getDay();
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5]; // padrão: dias úteis (seg–sex)
  if (!dias.includes(dow)) return false;
  if (ehFeriadoHoje(janela, tz)) return false;

  const [hi, mi] = String(janela?.inicio ?? "08:00").split(":").map(Number);
  const [hf, mf] = String(janela?.fim ?? "20:00").split(":").map(Number);
  return minutosAgora >= hi * 60 + mi && minutosAgora < hf * 60 + mf;
}

export function minutosRestantesJanela(janela: any): number {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const [hf, mf] = String(janela?.fim ?? "20:00").split(":").map(Number);
  return Math.max(1, hf * 60 + mf - (h * 60 + m));
}

// ---------- Chatwoot ----------
export class Chatwoot {
  constructor(
    private url: string,
    private accountId: number,
    private token: string,
  ) {}

  private h() {
    return { "api_access_token": this.token, "Content-Type": "application/json" };
  }

  async onWhatsapp(inboxId: number, e164: string) {
    const r = await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/inboxes/${inboxId}/on_whatsapp`,
      { method: "POST", headers: this.h(), body: JSON.stringify({ phone_number: e164 }) },
    );
    if (!r.ok) return { exists: false };
    return await r.json();
  }

  async buscarContato(q: string) {
    const r = await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/contacts/search?q=${encodeURIComponent(q)}`,
      { headers: this.h() },
    );
    const d = await r.json();
    return d?.payload ?? [];
  }

  async criarContato(inboxId: number, e164: string, nome: string, attrs: Record<string, unknown>) {
    const r = await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/contacts`,
      {
        method: "POST",
        headers: this.h(),
        body: JSON.stringify({
          inbox_id: inboxId,
          name: nome,
          phone_number: e164,
          custom_attributes: attrs,
        }),
      },
    );
    const d = await r.json();
    return d?.payload?.contact ?? d?.payload ?? d;
  }

  async atualizarContato(contactId: number, attrs: Record<string, unknown>) {
    await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/contacts/${contactId}`,
      { method: "PUT", headers: this.h(), body: JSON.stringify({ custom_attributes: attrs }) },
    );
  }

  async criarConversa(inboxId: number, contactId: number, sourceId: string) {
    const r = await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/conversations`,
      {
        method: "POST",
        headers: this.h(),
        body: JSON.stringify({
          inbox_id: inboxId,
          contact_id: contactId,
          source_id: sourceId,
        }),
      },
    );
    return await r.json();
  }

  async enviarMensagem(conversationId: number, conteudo: string, delayTyping = 0) {
    const body: any = { content: conteudo, message_type: "outgoing" };
    if (delayTyping > 0) body.content_attributes = { zapi_args: { delayTyping } };
    const r = await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/conversations/${conversationId}/messages`,
      { method: "POST", headers: this.h(), body: JSON.stringify(body) },
    );
    return await r.json();
  }

  async addLabels(conversationId: number, labels: string[]) {
    await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/conversations/${conversationId}/labels`,
      { method: "POST", headers: this.h(), body: JSON.stringify({ labels }) },
    );
  }

  async getLabels(conversationId: number): Promise<string[]> {
    const r = await fetch(
      `${this.url}/api/v1/accounts/${this.accountId}/conversations/${conversationId}/labels`,
      { headers: this.h() },
    );
    const d = await r.json();
    return d?.payload ?? [];
  }
}

export function cwFromConfig(cfg: Record<string, any>): Chatwoot {
  return new Chatwoot(
    cfg.chatwoot?.url ?? "https://chatwoot.example.com",
    cfg.chatwoot?.account_id ?? 1,
    Deno.env.get("CHATWOOT_TOKEN")!,
  );
}

// telefone BR: gera variantes com e sem o 9º dígito p/ lookup
export function variantesTelefone(e164: string): string[] {
  const limpo = e164.replace(/\D/g, "");
  const out = new Set<string>([limpo, "+" + limpo]);
  const m = limpo.match(/^55(\d{2})(\d+)$/);
  if (m) {
    const ddd = m[1], num = m[2];
    if (num.length === 9 && num[0] === "9") {
      out.add(`55${ddd}${num.slice(1)}`);
      out.add(`+55${ddd}${num.slice(1)}`);
    } else if (num.length === 8) {
      out.add(`55${ddd}9${num}`);
      out.add(`+55${ddd}9${num}`);
    }
  }
  return [...out];
}
