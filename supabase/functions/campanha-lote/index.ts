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
// O W01 consulta a fila a cada minuto. Carregar até um ciclo de atraso impede que a
// granularidade do cron transforme 2min24s em 3min em todos os envios, sem criar rajada
// depois de uma pausa longa do workflow.
const CICLO_W01_MS = 60_000;

function baseCadenciaMs(proximoDisparoEm: string | null, agoraMs: number): number {
  const anteriorMs = proximoDisparoEm ? new Date(proximoDisparoEm).getTime() : NaN;
  if (!Number.isFinite(anteriorMs) || anteriorMs > agoraMs) return agoraMs;
  return Math.max(anteriorMs, agoraMs - CICLO_W01_MS);
}

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
  "meta_abordagem_template", "meta_abordagem_template_candidato",
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
// Valor e data entram no texto já formatados em pt-BR. Fazer isso aqui, e não no roteiro, garante
// que "55.08" nunca chegue ao devedor como "55.08" — e mantém o roteiro sendo texto, não código.
function formatarBRL(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** `2014-03-07` → `07/03/2014`. Vazio quando não há data — melhor omitir que inventar. */
function formatarDataBR(data: unknown): string {
  const bruto = String(data ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function anoDe(data: unknown): string {
  const m = /^(\d{4})/.exec(String(data ?? ""));
  return m ? m[1] : "";
}

function formatarNomeCompleto(nome: unknown): string {
  const conectores = new Set(["da", "das", "de", "do", "dos", "e"]);
  return String(nome ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((parte, indice) => indice > 0 && conectores.has(parte)
      ? parte
      : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1))
    .join(" ");
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

function saudacaoNaTz(tz: string): string {
  const hora = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function referenciaPorHorario(ref: any, tz: string): any {
  const variantes = ref?.variantes_horario;
  if (!variantes || typeof variantes !== "object") return ref;
  const saudacao = saudacaoNaTz(tz);
  const chave = saudacao === "Bom dia" ? "dia" : saudacao === "Boa tarde" ? "tarde" : "noite";
  const name = String(variantes[chave] ?? "").trim();
  return name ? { ...ref, name, variantes_horario: undefined } : ref;
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
  const disparoCache = new Map<number, { padrao: string[]; recontato: string[] }>();
  async function textoDeDisparo(cartId: number | null, balde: string | null): Promise<string | null> {
    if (!cartId) return null;
    if (!disparoCache.has(cartId)) {
      const { data } = await sb.from("carteiras").select("roteiro").eq("id", cartId).maybeSingle();
      const bloco = (data?.roteiro?.etapas ?? []).find((e: any) => e?.tipo === "disparo");
      const limpar = (v: unknown) =>
        (Array.isArray(v) ? v : []).map((t) => String(t ?? "").trim()).filter(Boolean);
      disparoCache.set(cartId, { padrao: limpar(bloco?.textos), recontato: limpar(bloco?.textos_recontato) });
    }
    const c = disparoCache.get(cartId)!;
    // Quem já respondeu alguma vez NÃO é contato frio. Mandar para essas 121 pessoas a mesma
    // abertura de quem nunca ouviu falar da MC Cred joga fora o único ativo que a conversa tem —
    // o histórico — e reapresentar-se do zero a quem já conversou soa como robô.
    // Sem texto de recontato escrito, cai no padrão: é melhor a abertura fria do que nenhuma.
    const lista = balde === "recontato_continuidade" && c.recontato.length ? c.recontato : c.padrao;
    return lista.length ? lista[Math.floor(Math.random() * lista.length)] : null;
  }

  // chips com o dono (cobrador) p/ resolver a config/template de cada um
  const { data: chips } = await sb.from("chips").select("id, nome, chatwoot_inbox_id, status, cobrador_id, proximo_disparo_em, conector, instancia_evolution").in("status", ["ativo", "aquecendo"]);
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

    // DE ONDE VEM A 1ª MENSAGEM — e isso depende do conector do chip.
    //
    // meta_cloud (§32): a abordagem ABRE a conversa, então está sempre fora da janela de 24h, e a
    // Cloud API só aceita MODELO APROVADO ali. Sem template configurado ou aprovado, o chip é
    // pulado com o motivo — melhor lote vazio explicado do que envio fantasma marcado como
    // "enviado", ou texto livre que a Meta recusa.
    //
    // baileys: não existe modelo para aprovar, e a 1ª mensagem sai do bloco de disparo do fluxo da
    // carteira, com as variações sorteadas. O gate acima não se aplica e, aplicado, era fatal: o
    // chip Baileys nunca tem template, então caía em `meta_template_ausente` toda rodada e o número
    // conectado ficava parado sem ninguém entender por quê.
    const ehBaileys = (chip.conector ?? "meta_cloud") === "baileys";
    const tzAbordagem = cfg.janela_envio?.tz ?? "America/Sao_Paulo";
    let refTpl: any = null;

    if (!ehBaileys) {
      const refAtivo = referenciaPorHorario(cfg.meta_abordagem_template, tzAbordagem);
      const refCandidato = referenciaPorHorario(cfg.meta_abordagem_template_candidato, tzAbordagem);
      refTpl = refAtivo;
      // Rollout sem interrupcao: candidato so substitui o modelo atual quando o cache da Meta
      // confirmar APPROVED. PENDING/REJECTED/ausente mantem o modelo anterior funcionando.
      if (String(refCandidato?.name ?? "").trim()) {
        let qCand = sb.from("meta_templates").select("status")
          .eq("name", refCandidato.name).eq("language", refCandidato.language ?? "pt_BR")
          .eq("status", "APPROVED");
        qCand = chip.cobrador_id ? qCand.eq("cobrador_id", chip.cobrador_id) : qCand.is("cobrador_id", null);
        const { data: candAprovado } = await qCand.maybeSingle();
        if (candAprovado) refTpl = refCandidato;
      }
      if (!String(refTpl?.name ?? "").trim()) { pulados.meta_template_ausente = (pulados.meta_template_ausente ?? 0) + 1; continue; }
      let qAprov = sb.from("meta_templates").select("status")
        .eq("name", refTpl.name).eq("language", refTpl.language ?? "pt_BR").eq("status", "APPROVED");
      qAprov = chip.cobrador_id ? qAprov.eq("cobrador_id", chip.cobrador_id) : qAprov.is("cobrador_id", null);
      const { data: aprov } = await qAprov.maybeSingle();
      if (!aprov) { pulados.meta_template_nao_aprovado = (pulados.meta_template_nao_aprovado ?? 0) + 1; continue; }
    } else if (!chip.instancia_evolution) {
      // Chip Baileys sem instância nunca escaneou o QR. Deixar passar geraria envio para uma
      // instância inexistente — falha 404 na Evolution, item marcado como falha e o chip levando
      // a culpa por um problema de cadastro.
      pulados.baileys_sem_instancia = (pulados.baileys_sem_instancia ?? 0) + 1;
      continue;
    }

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

    // A aba do CHIP é a única fonte configurável do ritmo. O teto por hora vira também a
    // cadência entre mensagens; uma variação de até 25% evita intervalos mecanicamente iguais.
    // As antigas chaves intervalo_min/max continuam no banco por compatibilidade histórica,
    // mas não comandam mais o disparador.
    const intMin = Math.max(5, Math.ceil(3600 / Math.max(1, Number(limHora))));
    const intMax = Math.max(intMin, Math.ceil(intMin * 1.25));

    // O W01 consulta a cada 1 min. O lote cabe nesse horizonte quando os intervalos sao curtos;
    // com intervalos maiores ele cai para um item, e proximo_disparo_em segura os outros schedules.
    const HORIZONTE_MIN = 1;
    const porHorizonte = Math.max(1, Math.floor((HORIZONTE_MIN * 60) / intMax));
    const demanda = Math.ceil((restante / restanteJanela) * HORIZONTE_MIN * 1.2);
    // o teto da hora entra como mais um limitador do lote (nunca o AUMENTA)
    const lote = Math.min(porHorizonte, Math.max(1, demanda), restanteHora);
    if (lote <= 0) continue;

    // Reserva o chip antes de tirar itens da fila. O Wait do n8n controla mensagens dentro deste
    // lote; esta reserva controla o primeiro envio dos proximos schedules e evita sobreposicao.
    const delaysReservados = Array.from({ length: lote }, () =>
      intMin + Math.floor(Math.random() * (intMax - intMin + 1))
    );
    const agoraIso = new Date(agoraMs).toISOString();
    const baseReservaMs = baseCadenciaMs(chip.proximo_disparo_em, agoraMs);
    const reservaMs = Math.max(
      agoraMs + 1000,
      baseReservaMs + delaysReservados.reduce((s, n) => s + n, 0) * 1000,
    );
    const reservaIso = new Date(reservaMs).toISOString();
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
      const reservaRealMs = Math.max(
        agoraMs + 1000,
        baseReservaMs + delaysReservados.slice(0, selecionados.length).reduce((s, n) => s + n, 0) * 1000,
      );
      const reservaRealIso = new Date(reservaRealMs).toISOString();
      await sb.from("chips").update({ proximo_disparo_em: reservaRealIso }).eq("id", chip.id).eq("proximo_disparo_em", reservaIso);
    }

    for (const [indice, item] of selecionados.entries()) {
      const { data: dev } = await sb.from("devedores").select("id, nome, processo, saldo, vencimento, chatwoot_contact_id, balde").eq("id", item.devedor_id).single();
      const { data: tel } = await sb.from("telefones_devedor").select("id, telefone_e164").eq("id", item.telefone_id).maybeSingle();
      if (!tel) { await sb.from("fila_envios").update({ status: "sem_whatsapp", erro: "sem_telefone" }).eq("id", item.id); continue; }

      const credor = await credorDaCarteira(item.carteira_id);
      const primeiroNome = (dev?.nome ?? "").split(" ")[0];
      const primeiroNomeCap = primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase();
      const nomeCompleto = formatarNomeCompleto(dev?.nome);
      const tzMensagem = cfg.janela_envio?.tz ?? "America/Sao_Paulo";
      // ATENÇÃO (§32 x §35): a 1ª mensagem NÃO é o bloco de disparo do fluxo da carteira — a Meta
      // exige modelo aprovado por ela, palavra por palavra. O fluxo volta a mandar assim que a
      // pessoa responde e a janela de 24h abre. `conteudo` = o modelo já renderizado, para que o
      // histórico do painel e do atendente mostre exatamente o que a pessoa recebeu.
      const vars = {
        primeiro_nome: primeiroNomeCap, nome: nomeCompleto, credor: credor ?? "", nome_bot: nomeBot,
        saudacao: saudacaoNaTz(tzMensagem),
        // Dados da dívida na PRIMEIRA mensagem — decisão do dono em 02/09/2026, tomada com o risco
        // na mesa (número reciclado aprende dívida alheia; ver ADR-0003 e §31). Existem para que o
        // texto de abordagem possa se identificar por completo em vez de pedir licença no vago,
        // que é o que estava produzindo conversa com cara de golpe.
        valor: formatarBRL(dev?.saldo),
        vencimento: formatarDataBR(dev?.vencimento),
        ano: anoDe(dev?.vencimento),
      };

      let tplMeta: TplMeta | null = null;
      let conteudo: string;

      if (ehBaileys) {
        // No canal não-oficial a 1ª mensagem É o bloco de disparo do fluxo — com as variações
        // sorteadas, que são o remédio anti-ban de dois devedores não receberem o texto idêntico.
        const molde = await textoDeDisparo(item.carteira_id, (dev?.balde as string | null) ?? null);
        if (!molde) {
          // Carteira sem texto de disparo. Devolve à fila: o item não tem culpa, e disparar um
          // texto padrão daqui esconderia o buraco de configuração no lugar de mostrá-lo.
          // 'aguardando' e não 'pendente': o enum `status_fila` só aceita aguardando/processando/
          // enviado/falha/sem_whatsapp/cancelado. Com 'pendente' o update era recusado pelo banco,
          // o erro do supabase-js não é lançado (vem no retorno, que aqui é ignorado), e o item
          // ficava preso em 'processando' até o `fn_resetar_presos`. Limpar `chip_id` junto é o
          // mesmo que o reset dos presos faz — devolver à fila é devolver ao pool, sem dono.
          await sb.from("fila_envios").update({ status: "aguardando", chip_id: null }).eq("id", item.id);
          pulados.disparo_sem_texto = (pulados.disparo_sem_texto ?? 0) + 1;
          continue;
        }
        conteudo = renderTemplate(molde, vars).trim();
        if (!conteudo) {
          await sb.from("fila_envios").update({ status: "aguardando", chip_id: null }).eq("id", item.id);
          pulados.disparo_sem_texto = (pulados.disparo_sem_texto ?? 0) + 1;
          continue;
        }
      } else {
        tplMeta = await montarTemplate(sb, chip.cobrador_id ?? null, refTpl, vars);
        if (!tplMeta) {
          // sumiu do cache ou faltou valor para alguma variável: devolve à fila em vez de virar
          // texto livre que a Meta recusaria
          await sb.from("fila_envios").update({ status: "aguardando", chip_id: null }).eq("id", item.id);
          pulados.meta_template_nao_montou = (pulados.meta_template_nao_montou ?? 0) + 1;
          continue;
        }
        conteudo = tplMeta.texto;
      }

      const { data: cartFluxo } = item.carteira_id
        ? await sb.from("carteiras").select("fluxo_versao_ativa_id").eq("id", item.carteira_id).maybeSingle()
        : { data: null };
      await sb.from("fila_envios").update({
        mensagem_renderizada: conteudo,
        fluxo_versao_id: cartFluxo?.fluxo_versao_ativa_id ?? null,
        meta_template_name: tplMeta?.name ?? null,
        meta_template_language: tplMeta?.language ?? null,
      }).eq("id", item.id);

      // "digitando" curto e proporcional ao texto (parece humano); espera até o próximo envio = sorteio anti-ban
      const delayTyping = Math.min(8, 3 + Math.floor(conteudo.length / 60) + Math.floor(Math.random() * 3));
      const delayProximo = delaysReservados[indice];

      itens.push({
        fila_id: item.id, carteira_id: item.carteira_id, chip_id: chip.id, inbox_id: chip.chatwoot_inbox_id,
        devedor_id: dev?.id, devedor_nome: dev?.nome, processo: dev?.processo, valor_divida: dev?.saldo,
        telefone_id: tel.id, telefone_e164: tel.telefone_e164, contato_existente: dev?.chatwoot_contact_id ?? null,
        mensagem: conteudo, delay_typing: delayTyping, delay_proximo: delayProximo, simulacao,
        fluxo_versao_id: cartFluxo?.fluxo_versao_ativa_id ?? null,
        // O W01 decide o caminho de saída por aqui: 'baileys' vai pela Edge Function
        // `enviar-mensagem` (que aplica presença e "digitando…", ADR-0002), 'meta_cloud' vai pelo
        // Chatwoot com modelo aprovado. Sem este campo o workflow teria que adivinhar pelo chip.
        canal: ehBaileys ? "baileys" : "meta_cloud",
        instancia_evolution: ehBaileys ? chip.instancia_evolution : null,
        meta_template_name: tplMeta?.name ?? null,
        // o W01 repassa isto como `template_params` ao Chatwoot (canal whatsapp_cloud)
        template: tplMeta ? chatwootTemplateBody(tplMeta).template_params : null,
      });
    }
  }

  return json({ ok: true, total: itens.length, itens, pulados });
});
