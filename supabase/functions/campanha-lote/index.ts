// SAVAN Recupera — campanha-lote (self-contained = deployada)
// Aplica gates de config POR COBRADOR (cada cobrador liga/desliga e regra a SUA campanha),
// calcula o lote permitido por chip (aquecimento + pacing), seleciona itens da fila atomicamente
// (apenas de carteiras ATIVAS, via fn_selecionar_lote) e devolve cada item com a mensagem renderizada.
// Config/Templates: padrão global (cobrador_id NULL) sobrescrito pelos do cobrador dono do chip.
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n) pode chamar; a resposta carrega
// PII (nome/telefone/valor), então a anon key pública é recusada (401).
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
async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor").is("cobrador_id", null);
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor;
  return m;
}
// Anti "enviar no vácuo": o Chatwoot aceita a mensagem (200) mesmo com o chip CAÍDO na Z-API, e o
// fluxo marcava como "enviada" — daí "mandou pra 30" sem nada chegar. Confere a conexão real antes
// de gastar lote. true=conectado, false=caiu, null=não deu p/ checar (erro/sem credencial → pula sem marcar).
async function chipConectado(sb: SupabaseClient, clientGlobal: string, chipId: number): Promise<boolean | null> {
  const { data: cred } = await sb.from("chips_credenciais").select("zapi_instance_id, zapi_token, zapi_client_token").eq("chip_id", chipId).maybeSingle();
  if (!cred?.zapi_instance_id || !cred?.zapi_token) return null;
  try {
    const r = await fetch(`https://api.z-api.io/instances/${cred.zapi_instance_id}/token/${cred.zapi_token}/status`, { headers: { "Client-Token": cred.zapi_client_token ?? clientGlobal } });
    const d = await r.json();
    return d?.connected === true;
  } catch { return null; }
}
// Marca o chip como caído e abre failover pendente (mesma lógica do chips-monitor) p/ o operador confirmar.
async function marcarChipCaido(sb: SupabaseClient, chip: any) {
  await sb.from("chips").update({ status: "desconectado" }).eq("id", chip.id);
  await sb.from("eventos_campanha").insert({ tipo: "chip_status", chip_id: chip.id, payload: { status: "desconectado", nome: chip.nome, origem: "campanha-lote" } });
  const { data: resumo } = await sb.rpc("fn_failover_resumo", { p_chip_id: chip.id });
  const tem = ((resumo?.aguardando ?? 0) + (resumo?.conversas_ativas ?? 0) + (resumo?.escaladas ?? 0)) > 0;
  if (tem) {
    const { data: existe } = await sb.from("failover_eventos").select("id").eq("chip_caido_id", chip.id).eq("status", "pendente").maybeSingle();
    if (!existe) await sb.from("failover_eventos").insert({ chip_caido_id: chip.id, resumo });
  }
}

// Chaves de config que existem "por cobrador" (o resto é só global/infra).
const CHAVES_POR_COBRADOR = new Set([
  "campanha_ativa", "modo_simulacao", "janela_envio", "intervalo_min_segundos", "intervalo_max_segundos", "aquecimento", "faixas_desconto", "ia",
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

// Feriados nacionais (base bancária/ANBIMA: fixos + móveis via Páscoa). Usado para "pular feriado".
function feriadosNacionais(ano: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;
  const s = new Set<string>([
    iso(ano, 1, 1),   // Confraternização
    iso(ano, 4, 21),  // Tiradentes
    iso(ano, 5, 1),   // Dia do Trabalho
    iso(ano, 9, 7),   // Independência
    iso(ano, 10, 12), // N. Sra. Aparecida
    iso(ano, 11, 2),  // Finados
    iso(ano, 11, 15), // Proclamação da República
    iso(ano, 11, 20), // Consciência Negra (nacional desde 2024)
    iso(ano, 12, 25), // Natal
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
function ehFeriadoHoje(janela: any, tz: string): boolean {
  if (janela?.pular_feriados === false) return false; // só pula quando habilitado (padrão: pula)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const extras: string[] = Array.isArray(janela?.feriados_extra) ? janela.feriados_extra : [];
  return feriadosNacionais(Number(hoje.slice(0, 4))).has(hoje) || extras.includes(hoje);
}
function dentroDaJanela(janela: any): boolean {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  const agora = new Date();
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(agora);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const minutosAgora = h * 60 + m;
  const diaTz = new Date(agora.toLocaleString("en-US", { timeZone: tz }));
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5]; // padrão: dias úteis (seg–sex)
  if (!dias.includes(diaTz.getDay())) return false;
  if (ehFeriadoHoje(janela, tz)) return false;
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
  const resolverCfg = await carregarConfigResolver(sb);
  const seg = await carregarSegredos(sb);
  const zapiClientGlobal = seg.ZAPI_CLIENT_TOKEN ?? "";

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

    // Anti "enviar no vácuo": confirma a conexão real do chip na Z-API antes de gastar o lote.
    // Chip caído -> marca desconectado + abre failover e pula (não vira envio fantasma).
    const vivo = await chipConectado(sb, zapiClientGlobal, chip.id);
    if (vivo === false) { await marcarChipCaido(sb, chip); pulados.chip_desconectado = (pulados.chip_desconectado ?? 0) + 1; continue; }
    if (vivo === null) { pulados.chip_sem_status = (pulados.chip_sem_status ?? 0) + 1; continue; }

    // Intervalo ALEATÓRIO entre mensagens (anti-ban): cada envio aguarda um tempo sorteado em
    // [intervalo_min_segundos, intervalo_max_segundos]. Compatível com config antiga (só o mín).
    const intMin = Math.max(5, Number(cfg.intervalo_min_segundos ?? 30));
    let intMax = Number(cfg.intervalo_max_segundos ?? 90);
    if (!Number.isFinite(intMax) || intMax < intMin) intMax = intMin;
    const simulacao = cfg.modo_simulacao === true || cfg.modo_simulacao === "true";
    const restanteJanela = minutosRestantesJanela(cfg.janela_envio);
    const nomeBot = cfg.ia?.nome_bot ?? "Ana";

    const { data: limite } = await sb.rpc("fn_limite_chip", { p_chip_id: chip.id });
    const { data: mDia } = await sb.from("chip_metricas_diarias").select("novos_contatos").eq("chip_id", chip.id).eq("dia", new Date().toISOString().slice(0, 10)).maybeSingle();
    const usados = mDia?.novos_contatos ?? 0;
    const restante = Math.max(0, (limite ?? 0) - usados);
    if (restante <= 0) continue;
    // O W01 roda a cada 5 min; o lote cobre esse horizonte e é espaçado item a item pela espera
    // aleatória do n8n (campo delay_proximo). Dimensiono pelo intervalo MÁX p/ o ciclo não estourar
    // os 5 min (no pior caso, lote × intMax ≈ horizonte).
    const HORIZONTE_MIN = 5;
    const porHorizonte = Math.max(1, Math.floor((HORIZONTE_MIN * 60) / intMax));
    const demanda = Math.ceil((restante / restanteJanela) * HORIZONTE_MIN * 1.2);
    const lote = Math.min(porHorizonte, Math.max(1, demanda));
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

      // "digitando" curto e proporcional ao texto (parece humano); espera até o próximo envio = sorteio anti-ban
      const delayTyping = Math.min(8, 3 + Math.floor(conteudo.length / 60) + Math.floor(Math.random() * 3));
      const delayProximo = intMin + Math.floor(Math.random() * (intMax - intMin + 1));

      itens.push({
        fila_id: item.id, carteira_id: item.carteira_id, chip_id: chip.id, inbox_id: chip.chatwoot_inbox_id,
        devedor_id: dev?.id, devedor_nome: dev?.nome, processo: dev?.processo, valor_divida: dev?.saldo,
        telefone_id: tel.id, telefone_e164: tel.telefone_e164, contato_existente: dev?.chatwoot_contact_id ?? null,
        mensagem: conteudo, delay_typing: delayTyping, delay_proximo: delayProximo, simulacao,
      });
    }
  }

  return json({ ok: true, total: itens.length, itens, pulados });
});
