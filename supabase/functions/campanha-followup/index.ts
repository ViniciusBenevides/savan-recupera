// SAVAN Recupera — campanha-followup (self-contained = deployada)
// Reengaja conversas sem resposta de carteiras ATIVAS. Gate POR COBRADOR (campanha ligada +
// janela do cobrador dono da carteira); templates de follow-up escopados ao cobrador (cai no global).
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n) pode chamar; anon key recusada (401).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }
async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor").is("cobrador_id", null);
  const m: Record<string, string> = {}; for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor; return m;
}
const CHAVES_POR_COBRADOR = new Set(["campanha_ativa", "modo_simulacao", "janela_envio", "intervalo_min_segundos", "aquecimento", "faixas_desconto", "ia"]);
async function carregarConfigResolver(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor, cobrador_id");
  const global: Record<string, any> = {}; const porCobrador = new Map<string, Record<string, any>>();
  for (const r of data ?? []) {
    if (r.cobrador_id == null) global[r.chave] = r.valor;
    else { const m = porCobrador.get(r.cobrador_id) ?? {}; m[r.chave] = r.valor; porCobrador.set(r.cobrador_id, m); }
  }
  return (cob: string | null): Record<string, any> => {
    if (!cob) return { ...global };
    const over = porCobrador.get(cob) ?? {}; const out = { ...global };
    for (const k of Object.keys(over)) if (CHAVES_POR_COBRADOR.has(k)) out[k] = over[k];
    return out;
  };
}
function resolverSpintax(t: string): string { let p = "", c = t; while (c !== p) { p = c; c = c.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => { const o = g.split("|"); return o[Math.floor(Math.random() * o.length)]; }); } return c; }
function render(tpl: string, v: Record<string, unknown>): string { return resolverSpintax(tpl).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => { const x = v[k]; return x == null ? "" : String(x); }); }
async function templateFollowup(sb: SupabaseClient, tipo: string, cob: string | null): Promise<string | null> {
  async function buscar(c: string | null) {
    let q = sb.from("templates_mensagem").select("conteudo").eq("tipo", tipo).eq("ativo", true).limit(1);
    q = c ? q.eq("cobrador_id", c) : q.is("cobrador_id", null);
    const { data } = await q.maybeSingle();
    return data?.conteudo ?? null;
  }
  return (cob ? await buscar(cob) : null) ?? await buscar(null);
}

// §35: os reenvios são os blocos `tipo: "followup"` do fluxo da carteira, NA ORDEM em que aparecem.
// Cada um traz o próprio texto (variações sorteadas) e o próprio tempo de espera — antes o texto vinha
// de `templates_mensagem` e o intervalo de uma config global, e as duas metades da mesma decisão
// moravam em telas diferentes.
type BlocoFollowup = { textos: string[]; espera_horas: number };
function followupsDoFluxo(roteiro: any): BlocoFollowup[] {
  return (roteiro?.etapas ?? [])
    .filter((e: any) => e?.tipo === "followup")
    .map((e: any) => ({
      textos: (e.textos ?? []).map((t: unknown) => String(t ?? "").trim()).filter(Boolean),
      espera_horas: Number(e.espera_horas) > 0 ? Number(e.espera_horas) : 24,
    }))
    .filter((b: BlocoFollowup) => b.textos.length > 0);
}
const sortear = (xs: string[]): string => xs[Math.floor(Math.random() * xs.length)];
// Feriados nacionais (base bancária/ANBIMA: fixos + móveis via Páscoa) p/ "pular feriado".
function feriadosNacionais(ano: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;
  const s = new Set<string>([iso(ano,1,1), iso(ano,4,21), iso(ano,5,1), iso(ano,9,7), iso(ano,10,12), iso(ano,11,2), iso(ano,11,15), iso(ano,11,20), iso(ano,12,25)]);
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pas = Date.UTC(ano, mes - 1, dia);
  const off = (o: number) => { const dt = new Date(pas + o * 86400000); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };
  s.add(off(-48)); s.add(off(-47)); s.add(off(-2)); s.add(off(60)); // Carnaval seg/ter, Sexta-feira Santa, Corpus Christi
  return s;
}
function ehFeriadoHoje(j: any, tz: string): boolean {
  if (j?.pular_feriados === false) return false;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const extras: string[] = Array.isArray(j?.feriados_extra) ? j.feriados_extra : [];
  return feriadosNacionais(Number(hoje.slice(0, 4))).has(hoje) || extras.includes(hoje);
}
const emMinutos = (hhmm: string, padrao: number): number => {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : padrao;
};
// Faixas do dia (§33): formato novo `faixas_por_dia[dow]`, com fallback no antigo (dias + inicio/fim).
// Espelha campanha-lote — os dois precisam concordar sobre quando a janela está aberta.
function faixasDoDia(j: any, dow: number): [number, number][] {
  const mapa = j?.faixas_por_dia;
  if (mapa && typeof mapa === "object") {
    const faixas = mapa[String(dow)];
    if (!Array.isArray(faixas)) return [];
    return faixas
      .filter((f: any) => Array.isArray(f) && f.length === 2)
      .map((f: any) => [emMinutos(f[0], 0), emMinutos(f[1], 0)] as [number, number])
      .filter(([ini, fim]) => fim > ini);
  }
  if (!(j?.dias ?? [1, 2, 3, 4, 5]).includes(dow)) return [];
  return [[emMinutos(j?.inicio, 8 * 60), emMinutos(j?.fim, 20 * 60)]];
}
function dentroJanela(j: any): boolean {
  const tz = j?.tz ?? "America/Sao_Paulo";
  if (ehFeriadoHoje(j, tz)) return false;
  const pp = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(pp.find((p) => p.type === "hour")?.value ?? "0"); const m = Number(pp.find((p) => p.type === "minute")?.value ?? "0");
  const min = h * 60 + m; const dow = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getDay();
  return faixasDoDia(j, dow).some(([ini, fim]) => min >= ini && min < fim);
}

// ─── Templates aprovados da Meta (§32) ────────────────────────────────────────────────────────
// Fora da janela de 24h a Cloud API recusa texto livre: só sai MODELO APROVADO. Estas funcoes
// resolvem o template no cache local (meta_templates), rendem o corpo com as variaveis e montam
// o payload do Chatwoot. O `content` vai com o texto ja renderizado — assim o historico do painel
// e do atendente mostra exatamente o que a pessoa recebeu, e nao um placeholder.
type TplMeta = { name: string; language: string; category: string; params: string[]; texto: string };

function corpoDoTemplate(components: unknown): string {
  const lista = Array.isArray(components) ? components : [];
  const body = lista.find((c: any) => c?.type === "BODY");
  return String((body as any)?.text ?? "");
}

async function montarTemplate(
  sb: SupabaseClient, cobradorId: string | null, ref: any, vars: Record<string, string>,
): Promise<TplMeta | null> {
  const name = String(ref?.name ?? "").trim();
  if (!name) return null;
  const language = String(ref?.language ?? "pt_BR");
  let q = sb.from("meta_templates").select("name, language, category, components")
    .eq("name", name).eq("language", language).eq("status", "APPROVED");
  if (cobradorId) q = q.eq("cobrador_id", cobradorId);
  const { data } = await q.maybeSingle();
  if (!data) return null;

  const nomes: string[] = Array.isArray(ref?.variaveis) ? ref.variaveis : [];
  const params = nomes.map((v) => String(vars[v] ?? "").trim());
  // A Meta recusa parametro vazio; sem valor para uma posicao, o template nao pode ser usado.
  if (params.some((p) => !p)) return null;
  let texto = corpoDoTemplate(data.components);
  params.forEach((p, i) => { texto = texto.replaceAll(`{{${i + 1}}}`, p); });
  return {
    name: data.name, language: data.language,
    category: String(data.category ?? "UTILITY").toLowerCase(), params, texto,
  };
}

// Payload de mensagem do Chatwoot para um canal WhatsApp Cloud enviando modelo aprovado.
function chatwootTemplateBody(tpl: TplMeta) {
  return {
    content: tpl.texto,
    message_type: "outgoing",
    template_params: {
      name: tpl.name,
      category: tpl.category,
      language: tpl.language,
      processed_params: Object.fromEntries(tpl.params.map((p, i) => [String(i + 1), p])),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A1: somente o service_role (n8n) pode chamar. A anon key pública é recusada.
  // Trava revisada (§29): exige JWT de service_role pelo claim `role` (o verify_jwt já validou a
  // assinatura). Imune à rotação/novo sistema de API keys do Supabase — antes comparava o valor cru
  // do SERVICE_ROLE_KEY e quebrava (401 em tudo) quando a chave do env divergia do JWT do n8n.
  let _role = "";
  try {
    let _p = ((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    while (_p.length % 4) _p += "=";
    _role = JSON.parse(atob(_p)).role;
  } catch { _role = ""; }
  if (_role !== "service_role") return json({ ok: false, erro: "nao_autorizado" }, 401);
  const sb = admin();
  const seg = await carregarSegredos(sb);
  const resolverCfg = await carregarConfigResolver(sb);
  const cfgG = resolverCfg(null);
  const cwUrl = (cfgG.chatwoot?.url ?? "https://chatwoot.example.com").replace(/\/$/, "");
  const acc = cfgG.chatwoot?.account_id ?? 1;
  const maxFu = Number(cfgG.followup?.max ?? 3);
  const intervalos: number[] = cfgG.followup?.intervalos_horas ?? [24, 72, 168];

  // carteiras ativas + dono (cobrador) p/ resolver o gate e o fluxo
  const { data: ativas } = await sb.from("carteiras").select("id, credor, cobrador_id, roteiro").eq("status", "ativa");
  const idsAtivas = (ativas ?? []).map((c) => c.id);
  if (idsAtivas.length === 0) return json({ ok: true, motivo: "sem_carteira_ativa", enviados: 0 });
  const cartMap = new Map<number, { credor: string | null; cobrador_id: string | null; blocos: BlocoFollowup[] }>(
    (ativas ?? []).map((c) => [c.id, { credor: c.credor, cobrador_id: c.cobrador_id, blocos: followupsDoFluxo(c.roteiro) }]));

  const { data: convs } = await sb.from("conversas")
    .select("id, devedor_id, carteira_id, chatwoot_conversation_id, followups_enviados")
    .eq("estado", "aguardando_resposta").in("carteira_id", idsAtivas)
    .lte("proximo_followup_em", new Date().toISOString())
    .order("proximo_followup_em").limit(30);

  let enviados = 0, encerrados = 0, gated = 0, semTemplate = 0, falhas = 0;
  for (const c of convs ?? []) {
    const cart = cartMap.get(c.carteira_id) ?? { credor: null, cobrador_id: null, blocos: [] };
    const cfg = resolverCfg(cart.cobrador_id);
    // gate por cobrador: se a campanha dele estiver desligada ou fora da janela, não reengaja agora
    if (!(cfg.campanha_ativa === true || cfg.campanha_ativa === "true") || !dentroJanela(cfg.janela_envio)) { gated++; continue; }
    const simulacao = cfg.modo_simulacao === true || cfg.modo_simulacao === "true";

    // Com fluxo, quem manda no número de reenvios é o desenho da carteira (3 blocos = 3 reenvios);
    // sem fluxo, continua o teto global.
    const blocos = cart.blocos;
    const n = c.followups_enviados ?? 0;
    if (n >= (blocos.length || maxFu)) {
      await sb.from("conversas").update({
        estado: "encerrada", motivo_encerramento: "sem_resposta", proximo_followup_em: null,
      }).eq("id", c.id);
      encerrados++; continue;
    }
    const { data: dev } = await sb.from("devedores").select("nome").eq("id", c.devedor_id).single();
    const pn = (dev?.nome ?? "").split(" ")[0];
    const credor = cart.credor ?? "";

    // O reenvio vai para quem NUNCA respondeu — a janela de 24h nunca abriu, então também só sai
    // como modelo aprovado da Meta. O bloco de follow-up do fluxo da carteira (§35) segue mandando
    // no RITMO (quantos e de quanto em quanto tempo); o TEXTO é o do modelo aprovado.
    const refs: any[] = Array.isArray(cfg.meta_followup_templates?.lista) ? cfg.meta_followup_templates.lista : [];
    const tplMeta = await montarTemplate(sb, cart.cobrador_id, refs[n], {
      primeiro_nome: pn.charAt(0) + pn.slice(1).toLowerCase(), nome: dev?.nome ?? "",
      credor, nome_bot: cfg.ia?.nome_bot ?? "Ana",
    });
    if (!tplMeta) { semTemplate++; continue; }
    const texto = tplMeta.texto;

    let chatwootMessageId: number | null = null;
    if (!simulacao) {
      const envio = await fetch(`${cwUrl}/api/v1/accounts/${acc}/conversations/${c.chatwoot_conversation_id}/messages`, {
        method: "POST", headers: { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(chatwootTemplateBody(tplMeta)),
      });
      const envioBody = await envio.json().catch(() => null);
      chatwootMessageId = Number(envioBody?.id ?? 0) || null;
      if (!envio.ok || !chatwootMessageId) { falhas++; continue; }
    }
    // o próximo reenvio é agendado pela espera do PRÓXIMO bloco do fluxo (ou pela config global)
    const horasProx = blocos[n + 1]?.espera_horas ?? intervalos[Math.min(n + 1, intervalos.length - 1)];
    const prox = new Date(Date.now() + horasProx * 3600000).toISOString();
    await sb.from("conversas").update({ followups_enviados: n + 1, proximo_followup_em: prox, ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot" }).eq("id", c.id);
    await sb.from("mensagens").upsert({
      conversa_id: c.id, direcao: "saida", origem: "bot", conteudo: texto,
      chatwoot_message_id: chatwootMessageId, simulacao,
    }, chatwootMessageId ? { onConflict: "chatwoot_message_id" } : undefined);
    await sb.from("eventos_campanha").insert({ tipo: "followup", devedor_id: c.devedor_id, carteira_id: c.carteira_id, payload: { n: n + 1, simulacao } });
    enviados++;
  }
  // sem_template = reenvio adiado por falta de modelo aprovado (nao consome a vez)
  return json({ ok: true, enviados, encerrados, gated, sem_template: semTemplate, falhas });
});
