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
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5, 6];
  if (!dias.includes(dow)) return false;

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
