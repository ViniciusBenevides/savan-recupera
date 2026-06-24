// SAVAN Recupera — campanha-lote (self-contained = deployada)
// Aplica gates de config POR COBRADOR (cada cobrador liga/desliga e regra a SUA campanha),
// calcula o lote permitido por chip (aquecimento + pacing), seleciona itens da fila atomicamente
// (apenas de carteiras ATIVAS, via fn_selecionar_lote) e devolve cada item com a mensagem renderizada.
// Config/Templates: padrão global (cobrador_id NULL) sobrescrito pelos do cobrador dono do chip.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

// Chaves de config que existem "por cobrador" (o resto é só global/infra).
const CHAVES_POR_COBRADOR = new Set([
  "campanha_ativa", "modo_simulacao", "janela_envio", "intervalo_min_segundos", "aquecimento", "faixas_desconto", "ia",
]);

// Carrega TODA a tabela e devolve um resolvedor: resolve(cobradorId) = global + overlay do cobrador.
async function carregarConfigResolver(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor, cobrador_id");
  const global: Record<string, any> = {};
  const porCobrador = new Map<string, Record<string, any>>();
  for (const r of data ?? []) {
    if (r.cobrador_id == null) { global[r.chave] = r.valor; }
    else {
      const m = porCobrador.get(r.cobrador_id) ?? {};
      m[r.chave] = r.valor; porCobrador.set(r.cobrador_id, m);
    }
  }
  return (cobradorId: string | null): Record<string, any> => {
    if (!cobradorId) return { ...global };
    const over = porCobrador.get(cobradorId) ?? {};
    const out = { ...global };
    for (const k of Object.keys(over)) if (CHAVES_POR_COBRADOR.has(k)) out[k] = over[k];
    return out;
  };
}

function resolverSpintax(texto: string): string {
  let prev = ""; let cur = texto;
  while (cur !== prev) { prev = cur; cur = cur.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => { const o = g.split("|"); return o[Math.floor(Math.random() * o.length)]; }); }
  return cur;
}
function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  let txt = resolverSpintax(tpl);
  txt = txt.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => { const v = vars[k]; return v === undefined || v === null ? "" : String(v); });
  return txt;
}
// Template do tipo, escopado ao cobrador (os seus); se não tiver, cai nos modelos GLOBAIS.
async function escolherTemplate(sb: SupabaseClient, tipo: string, cobradorId: string | null): Promise<{ id: number; conteudo: string } | null> {
  async function buscar(cob: string | null) {
    let q = sb.from("templates_mensagem").select("id, conteudo, peso").eq("tipo", tipo).eq("ativo", true);
    q = cob ? q.eq("cobrador_id", cob) : q.is("cobrador_id", null);
    const { data } = await q;
    return data ?? [];
  }
  let data = cobradorId ? await buscar(cobradorId) : [];
  if (data.length === 0) data = await buscar(null);
  if (data.length === 0) return null;
  const total = data.reduce((s, t) => s + (t.peso ?? 1), 0);
  let r = Math.random() * total;
  for (const t of data) { r -= t.peso ?? 1; if (r <= 0) return { id: t.id, conteudo: t.conteudo }; }
  return { id: data[0].id, conteudo: data[0].conteudo };
}

function dentroDaJanela(janela: any): boolean {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  const agora = new Date();
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(agora);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const minutosAgora = h * 60 + m;
  const diaTz = new Date(agora.toLocaleString("en-US", { timeZone: tz }));
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5, 6];
  if (!dias.includes(diaTz.getDay())) return false;
  const [hi, mi] = String(janela?.inicio ?? "08:00").split(":").map(Number);
  const [hf, mf] = String(janela?.fim ?? "20:00").split(":").map(Number);
  return minutosAgora >= hi * 60 + mi && minutosAgora < hf * 60 + mf;
}
function minutosRestantesJanela(janela: any): number {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const [hf, mf] = String(janela?.fim ?? "20:00").split(":").map(Number);
  return Math.max(1, hf * 60 + mf - (h * 60 + m));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  const resolverCfg = await carregarConfigResolver(sb);

  await sb.rpc("fn_resetar_presos", { p_min: 15 });

  const carteiraCache = new Map<number, string | null>();
  async function credorDaCarteira(cartId: number | null): Promise<string | null> {
    if (!cartId) return null;
    if (carteiraCache.has(cartId)) return carteiraCache.get(cartId)!;
    const { data } = await sb.from("carteiras").select("credor").eq("id", cartId).maybeSingle();
    const credor = data?.credor ?? null;
    carteiraCache.set(cartId, credor);
    return credor;
  }

  // chips com o dono (cobrador) p/ resolver a config/template de cada um
  const { data: chips } = await sb.from("chips").select("id, nome, chatwoot_inbox_id, status, cobrador_id").in("status", ["ativo", "aquecendo"]);
  const itens: any[] = [];
  const pulados: Record<string, number> = {}; // motivo -> nº de chips

  for (const chip of chips ?? []) {
    const cfg = resolverCfg(chip.cobrador_id ?? null);
    // gate POR COBRADOR: a campanha dele precisa estar ligada e dentro da janela dele
    if (!(cfg.campanha_ativa === true || cfg.campanha_ativa === "true")) { pulados.campanha_inativa = (pulados.campanha_inativa ?? 0) + 1; continue; }
    if (!dentroDaJanela(cfg.janela_envio)) { pulados.fora_da_janela = (pulados.fora_da_janela ?? 0) + 1; continue; }

    const intervalo = Number(cfg.intervalo_min_segundos ?? 12);
    const simulacao = cfg.modo_simulacao === true || cfg.modo_simulacao === "true";
    const restanteJanela = minutosRestantesJanela(cfg.janela_envio);
    const nomeBot = cfg.ia?.nome_bot ?? "Ana";

    const { data: limite } = await sb.rpc("fn_limite_chip", { p_chip_id: chip.id });
    const { data: mDia } = await sb.from("chip_metricas_diarias").select("novos_contatos").eq("chip_id", chip.id).eq("dia", new Date().toISOString().slice(0, 10)).maybeSingle();
    const usados = mDia?.novos_contatos ?? 0;
    const restante = Math.max(0, (limite ?? 0) - usados);
    if (restante <= 0) continue;
    const porMinuto = Math.floor(60 / intervalo);
    const lote = Math.min(porMinuto, Math.ceil((restante / restanteJanela) * 1.2));
    if (lote <= 0) continue;

    const { data: selec } = await sb.rpc("fn_selecionar_lote", { p_chip_id: chip.id, p_n: lote });

    for (const item of selec ?? []) {
      const { data: dev } = await sb.from("devedores").select("id, nome, processo, saldo, vencimento, chatwoot_contact_id").eq("id", item.devedor_id).single();
      const { data: tel } = await sb.from("telefones_devedor").select("id, telefone_e164").eq("id", item.telefone_id).maybeSingle();
      if (!tel) { await sb.from("fila_envios").update({ status: "sem_whatsapp", erro: "sem_telefone" }).eq("id", item.id); continue; }

      const credor = await credorDaCarteira(item.carteira_id);
      const tpl = await escolherTemplate(sb, "abordagem_inicial", chip.cobrador_id ?? null);
      const primeiroNome = (dev?.nome ?? "").split(" ")[0];
      const primeiroNomeCap = primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase();
      const conteudo = tpl
        ? renderTemplate(tpl.conteudo, { primeiro_nome: primeiroNomeCap, nome_bot: nomeBot, nome: dev?.nome, credor: credor ?? "" })
        : `Olá ${primeiroNomeCap}, aqui é a ${nomeBot}${credor ? ` da ${credor}` : ""}.`;

      await sb.from("fila_envios").update({ template_id: tpl?.id ?? null, mensagem_renderizada: conteudo }).eq("id", item.id);

      itens.push({
        fila_id: item.id, carteira_id: item.carteira_id, chip_id: chip.id, inbox_id: chip.chatwoot_inbox_id,
        devedor_id: dev?.id, devedor_nome: dev?.nome, processo: dev?.processo, valor_divida: dev?.saldo,
        telefone_id: tel.id, telefone_e164: tel.telefone_e164, contato_existente: dev?.chatwoot_contact_id ?? null,
        mensagem: conteudo, delay_typing: intervalo, simulacao,
      });
    }
  }

  return json({ ok: true, total: itens.length, itens, pulados });
});
