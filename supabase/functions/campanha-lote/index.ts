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
const emMinutos = (hhmm: string, padrao: number): number => {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : padrao;
};

// Faixas de envio do dia (§33). O formato novo é `faixas_por_dia[dow] = [["08:00","12:00"], …]`,
// que permite excluir o almoço ou encurtar a sexta. Sem ele, cai no formato antigo
// (`dias` + `inicio`/`fim`), então nenhuma configuração existente precisa ser migrada.
function faixasDoDia(janela: any, dow: number): [number, number][] {
  const mapa = janela?.faixas_por_dia;
  if (mapa && typeof mapa === "object") {
    const faixas = mapa[String(dow)];
    if (!Array.isArray(faixas)) return [];                    // dia sem faixa = dia desligado
    return faixas
      .filter((f: any) => Array.isArray(f) && f.length === 2)
      .map((f: any) => [emMinutos(f[0], 0), emMinutos(f[1], 0)] as [number, number])
      .filter(([ini, fim]) => fim > ini);
  }
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5];      // padrão: dias úteis (seg–sex)
  if (!dias.includes(dow)) return [];
  return [[emMinutos(janela?.inicio, 8 * 60), emMinutos(janela?.fim, 20 * 60)]];
}

function agoraNaTz(tz: string): { minutos: number; dow: number } {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const dow = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getDay();
  return { minutos: h * 60 + m, dow };
}

function dentroDaJanela(janela: any): boolean {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  if (ehFeriadoHoje(janela, tz)) return false;
  const { minutos, dow } = agoraNaTz(tz);
  return faixasDoDia(janela, dow).some(([ini, fim]) => minutos >= ini && minutos < fim);
}

// Minutos que ainda restam de janela HOJE (soma das faixas ainda por vir, não só a atual) — é o que
// dimensiona a demanda do lote para o volume do dia ser diluído em vez de sair em rajada.
function minutosRestantesJanela(janela: any): number {
  const tz = janela?.tz ?? "America/Sao_Paulo";
  const { minutos, dow } = agoraNaTz(tz);
  const restante = faixasDoDia(janela, dow)
    .reduce((soma, [ini, fim]) => soma + Math.max(0, fim - Math.max(ini, minutos)), 0);
  return Math.max(1, restante);
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

  // §35: a 1ª mensagem é o bloco `tipo: "disparo"` do fluxo da carteira. As variações dentro do
  // bloco são sorteadas a cada envio — é o que substituiu o peso entre vários templates, e continua
  // sendo o mesmo remédio anti-ban: dois devedores não recebem o texto idêntico.
  const disparoCache = new Map<number, string[]>();
  async function textoDeDisparo(cartId: number | null): Promise<string | null> {
    if (!cartId) return null;
    if (!disparoCache.has(cartId)) {
      const { data } = await sb.from("carteiras").select("roteiro").eq("id", cartId).maybeSingle();
      const bloco = (data?.roteiro?.etapas ?? []).find((e: any) => e?.tipo === "disparo");
      const textos: string[] = (bloco?.textos ?? []).map((t: unknown) => String(t ?? "").trim()).filter(Boolean);
      disparoCache.set(cartId, textos);
    }
    const textos = disparoCache.get(cartId)!;
    return textos.length ? textos[Math.floor(Math.random() * textos.length)] : null;
  }

  // chips com o dono (cobrador) p/ resolver a config/template de cada um
  const { data: chips } = await sb.from("chips").select("id, nome, chatwoot_inbox_id, status, cobrador_id, proximo_disparo_em").in("status", ["ativo", "aquecendo"]);
  const itens: any[] = [];
  const pulados: Record<string, number> = {}; // motivo -> nº de chips

  for (const chip of chips ?? []) {
    const cfg = resolverCfg(chip.cobrador_id ?? null);
    // gate POR COBRADOR: a campanha dele precisa estar ligada e dentro da janela dele
    if (!(cfg.campanha_ativa === true || cfg.campanha_ativa === "true")) { pulados.campanha_inativa = (pulados.campanha_inativa ?? 0) + 1; continue; }
    if (!dentroDaJanela(cfg.janela_envio)) { pulados.fora_da_janela = (pulados.fora_da_janela ?? 0) + 1; continue; }
    const agoraMs = Date.now();
    if (chip.proximo_disparo_em && new Date(chip.proximo_disparo_em).getTime() > agoraMs) {
      pulados.intervalo_chip = (pulados.intervalo_chip ?? 0) + 1;
      continue;
    }

    // GATE DO CONECTOR OFICIAL (§32). Todo chip é Meta Cloud API: a 1ª mensagem a um contato novo
    // NÃO pode ser texto livre — tem que ser um TEMPLATE aprovado pela Meta. Enquanto o envio por
    // template não existir, nenhum lote sai daqui: é melhor devolver lote vazio com o motivo do que
    // gerar envio fantasma (marcado como "enviado" sem nada chegar) ou texto livre que a Meta recusa.
    // A abordagem ABRE a conversa, então está sempre fora da janela de 24h: a Cloud API só aceita
    // modelo aprovado. Sem template configurado (ou ainda em análise na Meta) o chip é pulado com o
    // motivo — melhor lote vazio explicado do que envio fantasma marcado como "enviado".
    const refTpl = cfg.meta_abordagem_template;
    if (!String(refTpl?.name ?? "").trim()) { pulados.meta_template_ausente = (pulados.meta_template_ausente ?? 0) + 1; continue; }
    const { data: aprov } = await sb.from("meta_templates").select("status")
      .eq("cobrador_id", chip.cobrador_id).eq("name", refTpl.name).eq("status", "APPROVED").maybeSingle();
    if (!aprov) { pulados.meta_template_nao_aprovado = (pulados.meta_template_nao_aprovado ?? 0) + 1; continue; }

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

    // ORÇAMENTO POR HORA (§33) — o teto diário sozinho não impede a RAJADA: um chip podia gastar a
    // cota inteira do dia em minutos, que é o padrão que o WhatsApp lê como robô (§31). Aqui entra o
    // segundo freio: quantas mensagens este chip ainda pode mandar NESTA hora.
    const tzChip = cfg.janela_envio?.tz ?? "America/Sao_Paulo";
    const diaLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tzChip, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const horaAtual = new Date(new Date().toLocaleString("en-US", { timeZone: tzChip })).getHours();
    const { data: limHora } = await sb.rpc("fn_limite_chip_hora", { p_chip_id: chip.id });
    const { data: mHora } = await sb.from("chip_metricas_horarias").select("msgs")
      .eq("chip_id", chip.id).eq("dia", diaLocal).eq("hora", horaAtual).maybeSingle();
    const restanteHora = Math.max(0, (limHora ?? 0) - (mHora?.msgs ?? 0));
    if (restanteHora <= 0) { pulados.teto_hora = (pulados.teto_hora ?? 0) + 1; continue; }

    // O W01 consulta a cada 5 min. O lote cabe nesse horizonte quando os intervalos sao curtos;
    // com intervalos maiores ele cai para um item, e proximo_disparo_em segura os outros schedules.
    const HORIZONTE_MIN = 5;
    const porHorizonte = Math.max(1, Math.floor((HORIZONTE_MIN * 60) / intMax));
    const demanda = Math.ceil((restante / restanteJanela) * HORIZONTE_MIN * 1.2);
    // o teto da hora entra como mais um limitador do lote (nunca o AUMENTA)
    const lote = Math.min(porHorizonte, Math.max(1, demanda), restanteHora);
    if (lote <= 0) continue;

    // Piso do intervalo derivado do ritmo: com um teto de N msgs/hora, dois envios não podem sair
    // mais juntos que 3600/N segundos. O sorteio anti-ban (§28) continua, só que a partir desse piso.
    const pisoRitmo = (limHora ?? 0) > 0 ? Math.floor(3600 / (limHora as number)) : 0;
    const intMinEfetivo = Math.max(intMin, pisoRitmo);
    const intMaxEfetivo = Math.max(intMax, intMinEfetivo);

    // Reserva o chip antes de tirar itens da fila. O Wait do n8n controla mensagens dentro deste
    // lote; esta reserva controla o primeiro envio dos proximos schedules e evita sobreposicao.
    const delaysReservados = Array.from({ length: lote }, () =>
      intMinEfetivo + Math.floor(Math.random() * (intMaxEfetivo - intMinEfetivo + 1))
    );
    const agoraIso = new Date(agoraMs).toISOString();
    const reservaIso = new Date(agoraMs + delaysReservados.reduce((s, n) => s + n, 0) * 1000).toISOString();
    const { data: reserva, error: erroReserva } = await sb.from("chips")
      .update({ proximo_disparo_em: reservaIso })
      .eq("id", chip.id)
      .or(`proximo_disparo_em.is.null,proximo_disparo_em.lte.${agoraIso}`)
      .select("id")
      .maybeSingle();
    if (erroReserva || !reserva) {
      pulados.intervalo_chip = (pulados.intervalo_chip ?? 0) + 1;
      continue;
    }

    const { data: selec } = await sb.rpc("fn_selecionar_lote", { p_chip_id: chip.id, p_n: lote });
    const selecionados = selec ?? [];
    if (!selecionados.length) {
      await sb.from("chips").update({ proximo_disparo_em: null }).eq("id", chip.id).eq("proximo_disparo_em", reservaIso);
      continue;
    }
    if (selecionados.length !== delaysReservados.length) {
      const reservaRealIso = new Date(
        agoraMs + delaysReservados.slice(0, selecionados.length).reduce((s, n) => s + n, 0) * 1000,
      ).toISOString();
      await sb.from("chips").update({ proximo_disparo_em: reservaRealIso }).eq("id", chip.id).eq("proximo_disparo_em", reservaIso);
    }

    for (const [indice, item] of selecionados.entries()) {
      const { data: dev } = await sb.from("devedores").select("id, nome, processo, saldo, vencimento, chatwoot_contact_id").eq("id", item.devedor_id).single();
      const { data: tel } = await sb.from("telefones_devedor").select("id, telefone_e164").eq("id", item.telefone_id).maybeSingle();
      if (!tel) { await sb.from("fila_envios").update({ status: "sem_whatsapp", erro: "sem_telefone" }).eq("id", item.id); continue; }

      const credor = await credorDaCarteira(item.carteira_id);
      const primeiroNome = (dev?.nome ?? "").split(" ")[0];
      const primeiroNomeCap = primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase();
      // ATENÇÃO (§32 x §35): a 1ª mensagem NÃO é o bloco de disparo do fluxo da carteira — a Meta
      // exige modelo aprovado por ela, palavra por palavra. O fluxo volta a mandar assim que a
      // pessoa responde e a janela de 24h abre. `conteudo` = o modelo já renderizado, para que o
      // histórico do painel e do atendente mostre exatamente o que a pessoa recebeu.
      const tplMeta = await montarTemplate(sb, chip.cobrador_id ?? null, refTpl, {
        primeiro_nome: primeiroNomeCap, nome: dev?.nome ?? "", credor: credor ?? "", nome_bot: nomeBot,
      });
      if (!tplMeta) {
        // sumiu do cache ou faltou valor para alguma variável: devolve à fila em vez de virar
        // texto livre que a Meta recusaria
        await sb.from("fila_envios").update({ status: "pendente" }).eq("id", item.id);
        pulados.meta_template_nao_montou = (pulados.meta_template_nao_montou ?? 0) + 1;
        continue;
      }
      const conteudo = tplMeta.texto;

      await sb.from("fila_envios").update({ mensagem_renderizada: conteudo }).eq("id", item.id);

      // "digitando" curto e proporcional ao texto (parece humano); espera até o próximo envio = sorteio anti-ban
      const delayTyping = Math.min(8, 3 + Math.floor(conteudo.length / 60) + Math.floor(Math.random() * 3));
      const delayProximo = delaysReservados[indice];

      itens.push({
        fila_id: item.id, carteira_id: item.carteira_id, chip_id: chip.id, inbox_id: chip.chatwoot_inbox_id,
        devedor_id: dev?.id, devedor_nome: dev?.nome, processo: dev?.processo, valor_divida: dev?.saldo,
        telefone_id: tel.id, telefone_e164: tel.telefone_e164, contato_existente: dev?.chatwoot_contact_id ?? null,
        mensagem: conteudo, delay_typing: delayTyping, delay_proximo: delayProximo, simulacao,
        // o W01 repassa isto como `template_params` ao Chatwoot (canal whatsapp_cloud)
        template: chatwootTemplateBody(tplMeta).template_params,
      });
    }
  }

  return json({ ok: true, total: itens.length, itens, pulados });
});
