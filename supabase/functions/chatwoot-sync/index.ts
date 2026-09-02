// SAVAN Recupera - espelha conversas e mensagens do Chatwoot no Supabase.
// Chamado pelo n8n para message_created/conversation_created e manualmente para backfill.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  deveGravarEntrega, entregaConfirmada, statusEntregaDoChatwoot,
} from "../_shared/entrega.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function serviceRole(req: Request): boolean {
  try {
    let p = ((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "")
      .replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    return JSON.parse(atob(p)).role === "service_role";
  } catch {
    return false;
  }
}

async function configESegredos(sb: SupabaseClient) {
  const [{ data: cfgRows, error: cfgErro }, { data: segRows, error: segErro }] = await Promise.all([
    sb.from("configuracoes").select("chave, valor"),
    sb.from("segredos").select("chave, valor"),
  ]);
  if (cfgErro || segErro) throw new Error("configuracao_indisponivel");
  const cfg: Record<string, any> = {};
  const seg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  for (const r of segRows ?? []) if (r.valor) seg[r.chave] = r.valor;
  const url = String(cfg.chatwoot?.url ?? "").replace(/\/$/, "");
  const accountId = Number(cfg.chatwoot?.account_id ?? 1);
  if (!url || !seg.CHATWOOT_TOKEN) throw new Error("chatwoot_nao_configurado");
  return { url, accountId, token: seg.CHATWOOT_TOKEN, openAiKey: seg.OPENAI_API_KEY ?? "" };
}

async function cwGet(base: string, token: string, path: string): Promise<any> {
  const r = await fetch(`${base}${path}`, { headers: { "api_access_token": token } });
  if (!r.ok) throw new Error(`chatwoot_http_${r.status}`);
  return await r.json();
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function iso(v: unknown, fallback = new Date().toISOString()): string {
  if (typeof v === "number") {
    const d = new Date(v < 10_000_000_000 ? v * 1000 : v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof v === "string" && v) {
    if (/^\d+$/.test(v)) return iso(Number(v), fallback);
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback;
}

function tipoMensagem(v: unknown): "entrada" | "saida" | null {
  const t = String(v ?? "").toLowerCase();
  if (t === "incoming" || t === "0") return "entrada";
  if (t === "outgoing" || t === "template" || t === "1" || t === "3") return "saida";
  return null;
}

/**
 * Grava o recibo de entrega de uma mensagem já espelhada. A decisão (mapear o status e resolver
 * conflito entre recibos fora de ordem) mora em `_shared/entrega.ts`, com testes; aqui é só o I/O.
 */
async function gravarEntrega(sb: SupabaseClient, messageId: number, bruto: unknown) {
  const status = statusEntregaDoChatwoot(bruto);
  if (status === null) return { status: "ignorado" as const, status_entrega: null };

  const { data: atual, error: erroAtual } = await sb.from("mensagens")
    .select("id, status_entrega").eq("chatwoot_message_id", messageId).maybeSingle();
  if (erroAtual) throw erroAtual;
  if (!atual) return { status: "sem_mensagem" as const, status_entrega: null };

  const anterior = typeof atual.status_entrega === "number" ? atual.status_entrega : null;
  if (!deveGravarEntrega(anterior, status)) {
    return { status: "sem_mudanca" as const, status_entrega: anterior };
  }

  const patch: Record<string, unknown> = { status_entrega: status };
  // `entregue_em` marca o instante em que a entrega foi CONFIRMADA. O Chatwoot não guarda carimbo
  // próprio do recibo, então a hora em que o evento chegou é a informação honesta disponível.
  if (entregaConfirmada(status)) patch.entregue_em = new Date().toISOString();

  const { error } = await sb.from("mensagens").update(patch).eq("id", atual.id);
  if (error) throw error;
  return { status: "gravado" as const, status_entrega: status };
}

async function conversaDetalhe(base: string, token: string, accountId: number, convId: number) {
  return await cwGet(base, token, `/api/v1/accounts/${accountId}/conversations/${convId}`);
}

type AnexoMensagem = {
  id?: number;
  file_type?: string;
  extension?: string;
  data_url?: string;
  thumb_url?: string;
};

function anexosSeguros(anexos: AnexoMensagem[]): any[] {
  return anexos.map((a) => ({
    id: a.id ?? null,
    file_type: a.file_type ?? null,
    extension: a.extension ?? null,
    data_url: a.data_url ?? null,
    thumb_url: a.thumb_url ?? null,
  }));
}

async function transcreverAudio(
  anexo: AnexoMensagem,
  tokenChatwoot: string,
  openAiKey: string,
): Promise<string | null> {
  if (!anexo.data_url || !openAiKey) return null;
  const audio = await fetch(anexo.data_url, { headers: { api_access_token: tokenChatwoot } });
  if (!audio.ok) throw new Error(`audio_download_http_${audio.status}`);
  const blob = await audio.blob();
  const extensao = String(anexo.extension ?? "ogg").replace(/[^a-z0-9]/gi, "") || "ogg";
  const form = new FormData();
  form.append("file", blob, `audio.${extensao}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("prompt", "Conversa brasileira sobre atendimento e negociacao. Preserve nomes proprios, valores e datas exatamente como falados.");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}` },
    body: form,
  });
  if (!r.ok) throw new Error(`openai_transcricao_http_${r.status}`);
  const d = await r.json();
  const texto = String(d?.text ?? "").trim();
  return texto || null;
}

async function garantirConversa(
  sb: SupabaseClient,
  cw: { url: string; accountId: number; token: string },
  convId: number,
  detalheRecebido?: any,
  simulacaoRecebida?: boolean,
): Promise<any | null> {
  const { data: existente, error: erroExistente } = await sb.from("conversas")
    .select("id, devedor_id, carteira_id, chip_id, simulacao, estado")
    .eq("chatwoot_conversation_id", convId).maybeSingle();
  if (erroExistente) throw erroExistente;
  if (existente) return existente;

  const detalhe = detalheRecebido ?? await conversaDetalhe(cw.url, cw.token, cw.accountId, convId);
  const inboxId = numero(detalhe?.inbox_id ?? detalhe?.inbox?.id ?? detalhe?.conversation?.inbox_id);
  if (!inboxId) return null;

  const { data: chip, error: erroChip } = await sb.from("chips")
    .select("id").eq("chatwoot_inbox_id", inboxId).maybeSingle();
  if (erroChip) throw erroChip;
  if (!chip) return null;

  const remetente = detalhe?.meta?.sender ?? detalhe?.conversation?.meta?.sender ?? {};
  const contactId = numero(remetente?.id ?? detalhe?.contact_inbox?.contact_id);
  const attrs = remetente?.custom_attributes ?? {};
  let devedorId = numero(attrs?.devedor_id);

  if (!devedorId && contactId) {
    const { data: devContato } = await sb.from("devedores")
      .select("id").eq("chatwoot_contact_id", contactId).limit(2);
    if ((devContato ?? []).length === 1) devedorId = devContato![0].id;
  }

  const fone = String(remetente?.phone_number ?? "").replace(/\D/g, "");
  let telefoneId: number | null = null;
  if (!devedorId && fone.length >= 8) {
    const { data: tels } = await sb.from("telefones_devedor")
      .select("id, devedor_id").ilike("telefone_e164", `%${fone.slice(-8)}`);
    const ids = [...new Set((tels ?? []).map((t: any) => Number(t.devedor_id)))];
    if (ids.length === 1) devedorId = ids[0];
    if (devedorId) telefoneId = numero((tels ?? []).find((t: any) => Number(t.devedor_id) === devedorId)?.id);
  }
  if (!devedorId) {
    console.warn(`chatwoot-sync: conversa ${convId} sem devedor identificavel`);
    return null;
  }

  const { data: dev, error: erroDev } = await sb.from("devedores")
    .select("id, carteira_id").eq("id", devedorId).maybeSingle();
  if (erroDev) throw erroDev;
  if (!dev) return null;
  if (!telefoneId) {
    const { data: tel } = await sb.from("telefones_devedor")
      .select("id").eq("devedor_id", devedorId).eq("principal", true).limit(1).maybeSingle();
    telefoneId = numero(tel?.id);
  }

  const { data: semelhante } = await sb.from("conversas")
    .select("simulacao, estado").eq("devedor_id", devedorId).eq("chip_id", chip.id)
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const simulacao = typeof simulacaoRecebida === "boolean"
    ? simulacaoRecebida
    : semelhante?.simulacao === true;

  // ── Adoção: a conversa é do DEVEDOR, não do transporte (ADR-0001) ──────────────────────────
  // Quando um chip cai e outro assume, o ponteiro do Chatwoot fica para trás: o `fn_reatribuir_chip`
  // troca `conversas.chip_id` e não o `chatwoot_conversation_id`. Foi o que aconteceu no ban da conta
  // oficial (§38) — 430 conversas ficaram apontando para a inbox banida. Quando o devedor voltar a
  // aparecer por uma inbox nova, criar linha nova RACHARIA o dossiê e o robô repetiria o que o número
  // antigo já disse. Então reaproveitamos a linha existente e só trocamos o transporte.
  //
  // Só adotamos quando o ponteiro antigo é de OUTRA inbox (ou não existe). Se a linha já aponta para
  // esta mesma inbox com outro id, aí é conversa realmente nova e merece linha própria.
  const { data: adotavel } = await sb.from("conversas")
    .select("id, devedor_id, carteira_id, chip_id, simulacao, estado, chatwoot_inbox_id")
    .eq("devedor_id", devedorId)
    .eq("simulacao", simulacao)
    .or(`chatwoot_inbox_id.is.null,chatwoot_inbox_id.neq.${inboxId}`)
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1).maybeSingle();

  if (adotavel) {
    const { data: adotada, error: erroAdotar } = await sb.from("conversas").update({
      chatwoot_conversation_id: convId,
      chatwoot_inbox_id: inboxId,
      chatwoot_contact_id: contactId,
      chip_id: chip.id,
    }).eq("id", adotavel.id)
      .select("id, devedor_id, carteira_id, chip_id, simulacao, estado").single();
    if (erroAdotar) throw erroAdotar;
    console.log(
      `chatwoot-sync adoção: conversa ${adotavel.id} (devedor ${devedorId}) migrou da inbox ` +
      `${adotavel.chatwoot_inbox_id ?? "n/d"} para a ${inboxId}, chatwoot_conversation_id ${convId}`,
    );
    return adotada;
  }

  const quando = iso(detalhe?.last_activity_at ?? detalhe?.created_at);
  const resolvida = String(detalhe?.status ?? "open") === "resolved";
  // Resolver no Chatwoot nao pode apagar um desfecho mais especifico que ja
  // veio do pagamento ou do opt-out.
  const estadoAnterior = String(semelhante?.estado ?? "");
  const estado = resolvida
    ? (["pago", "optout"].includes(estadoAnterior) ? estadoAnterior : "encerrada")
    : "aguardando_resposta";
  const { data: carteiraFluxo } = dev.carteira_id
    ? await sb.from("carteiras").select("fluxo_versao_ativa_id").eq("id", dev.carteira_id).maybeSingle()
    : { data: null };

  const { data: criada, error: erroCriar } = await sb.from("conversas").upsert({
    devedor_id: devedorId,
    carteira_id: dev.carteira_id,
    chip_id: chip.id,
    telefone_id: telefoneId,
    chatwoot_conversation_id: convId,
    chatwoot_inbox_id: inboxId,
    chatwoot_contact_id: contactId,
    fluxo_versao_id: carteiraFluxo?.fluxo_versao_ativa_id ?? null,
    estado,
    ultima_msg_em: quando,
    ultima_msg_de: "sistema",
    simulacao,
    criado_em: iso(detalhe?.created_at, quando),
  }, { onConflict: "chatwoot_conversation_id" })
    .select("id, devedor_id, carteira_id, chip_id, simulacao, estado").single();
  if (erroCriar) throw erroCriar;
  return criada;
}

async function espelharMensagem(
  sb: SupabaseClient,
  conv: any,
  msg: any,
  cw: { token: string; openAiKey?: string },
): Promise<{ status: "gravada" | "ignorada"; conteudo: string | null; transcricao: string | null }> {
  if (msg?.private === true) return { status: "ignorada", conteudo: null, transcricao: null };
  const direcao = tipoMensagem(msg?.message_type);
  if (!direcao) return { status: "ignorada", conteudo: null, transcricao: null };
  const messageId = numero(msg?.id ?? msg?.chatwoot_message_id);
  if (!messageId) return { status: "ignorada", conteudo: null, transcricao: null };

  const criadoEm = iso(msg?.created_at);
  const anexos = (Array.isArray(msg?.attachments) ? msg.attachments : []) as AnexoMensagem[];
  const anexoAudio = anexos.find((a) => String(a?.file_type ?? "").toLowerCase() === "audio");
  const tipoConteudo = anexoAudio ? "audio" : String(msg?.content_type ?? "text");
  let transcricao: string | null = null;
  let conteudo = String(msg?.content ?? msg?.conteudo ?? "").trim();
  if (direcao === "entrada" && anexoAudio && !conteudo) {
    try {
      transcricao = await transcreverAudio(anexoAudio, cw.token, cw.openAiKey ?? "");
      conteudo = transcricao ?? "[Audio recebido - transcricao indisponivel]";
    } catch (e) {
      console.error(`chatwoot-sync: falha ao transcrever mensagem ${messageId}:`, e instanceof Error ? e.message : String(e));
      conteudo = "[Audio recebido - transcricao indisponivel]";
    }
  }
  const senderType = String(msg?.sender?.type ?? msg?.sender_type ?? "").toLowerCase();
  const origem = direcao === "entrada" ? "devedor" : (senderType === "user" ? "humano" : "bot");

  const { data: porId, error: erroId } = await sb.from("mensagens")
    .select("id, origem").eq("chatwoot_message_id", messageId).maybeSingle();
  if (erroId) throw erroId;
  if (porId) {
    const { error } = await sb.from("mensagens").update({
      conversa_id: conv.id, direcao, conteudo, tipo_conteudo: tipoConteudo,
      anexos: anexosSeguros(anexos), transcricao, criado_em: criadoEm, simulacao: conv.simulacao === true,
    }).eq("id", porId.id);
    if (error) throw error;
  } else {
    const { data: candidatos, error: erroCandidatos } = await sb.from("mensagens")
      .select("id, conteudo, criado_em, origem")
      .eq("conversa_id", conv.id).eq("direcao", direcao).is("chatwoot_message_id", null)
      .order("criado_em", { ascending: false }).limit(12);
    if (erroCandidatos) throw erroCandidatos;
    const alvo = (candidatos ?? [])
      .filter((m: any) => String(m.conteudo ?? "") === conteudo)
      .map((m: any) => ({ ...m, distancia: Math.abs(new Date(m.criado_em).getTime() - new Date(criadoEm).getTime()) }))
      .filter((m: any) => m.distancia <= 15 * 60 * 1000)
      .sort((a: any, b: any) => a.distancia - b.distancia)[0];

    if (alvo) {
      const { error } = await sb.from("mensagens").update({
        chatwoot_message_id: messageId, criado_em: criadoEm,
      }).eq("id", alvo.id);
      if (error) throw error;
    } else {
      // Use INSERT here. If the API response registers the same automated message between our
      // lookup and this write, an upsert would overwrite origem=bot with sender.type=user from
      // Chatwoot. On the unique race, update only transport fields and preserve the known author.
      const { error } = await sb.from("mensagens").insert({
        conversa_id: conv.id,
        direcao,
        origem,
        conteudo,
        tipo_conteudo: tipoConteudo,
        anexos: anexosSeguros(anexos),
        transcricao,
        chatwoot_message_id: messageId,
        criado_em: criadoEm,
        simulacao: conv.simulacao === true,
      });
      if (error?.code === "23505") {
        const { error: erroCorrida } = await sb.from("mensagens").update({
          conversa_id: conv.id, direcao, conteudo, tipo_conteudo: tipoConteudo,
          anexos: anexosSeguros(anexos), transcricao, criado_em: criadoEm,
          simulacao: conv.simulacao === true,
        }).eq("chatwoot_message_id", messageId);
        if (erroCorrida) throw erroCorrida;
      } else if (error) {
        throw error;
      }
    }
  }

  // O `message_created` de uma saída já vem com um status inicial (`sent`/`failed`). Aproveitar
  // aqui garante recibo mesmo se o `message_updated` nunca chegar — e é o que faz o backfill
  // (`executarBackfill`) trazer a história de entrega junto com o conteúdo.
  if (direcao === "saida") {
    try {
      await gravarEntrega(sb, messageId, msg?.status);
    } catch (e) {
      console.error(`chatwoot-sync: falha ao gravar entrega de ${messageId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  const ultimaMsgDe = direcao === "entrada" ? "devedor" : origem;
  if (direcao === "saida" && conteudo) {
    const { data: pagamentoPix, error: erroPix } = await sb.from("pagamentos")
      .select("id, pix_payload")
      .eq("devedor_id", conv.devedor_id)
      .in("status", ["pendente", "recebido", "confirmado"])
      .not("pix_payload", "is", null)
      .order("criado_em", { ascending: false })
      .limit(1).maybeSingle();
    if (erroPix) throw erroPix;
    // O código pode ser a mensagem inteira ou estar dentro de uma explicação.
    // A presença do payload EMV completo comprova a entrega nos dois formatos.
    if (pagamentoPix?.pix_payload && conteudo.includes(pagamentoPix.pix_payload.trim())) {
      const { error: erroEstadoPix } = await sb.from("conversas")
        .update({ estado: "pix_enviado" })
        .eq("id", conv.id)
        .in("estado", ["aguardando_resposta", "bot_ativo", "pix_enviado"]);
      if (erroEstadoPix) throw erroEstadoPix;
    }
  }
  const { error: erroConv } = await sb.from("conversas").update({
    ultima_msg_em: criadoEm,
    ultima_msg_de: ultimaMsgDe,
  }).eq("id", conv.id).or(`ultima_msg_em.is.null,ultima_msg_em.lte.${criadoEm}`);
  if (erroConv) throw erroConv;
  return { status: "gravada", conteudo, transcricao };
}

async function mensagensDaConversa(
  cw: { url: string; accountId: number; token: string },
  convId: number,
): Promise<any[]> {
  const todas: any[] = [];
  const vistos = new Set<number>();
  let before: number | null = null;
  for (let pagina = 0; pagina < 100; pagina++) {
    const sufixo = before ? `?before=${before}` : "";
    const d = await cwGet(cw.url, cw.token, `/api/v1/accounts/${cw.accountId}/conversations/${convId}/messages${sufixo}`);
    const lote = Array.isArray(d?.payload) ? d.payload : [];
    let novos = 0;
    for (const m of lote) {
      const id = numero(m?.id);
      if (id && !vistos.has(id)) {
        vistos.add(id);
        todas.push(m);
        novos++;
      }
    }
    if (lote.length < 20 || novos === 0) break;
    before = Math.min(...lote.map((m: any) => numero(m?.id)).filter(Boolean) as number[]);
    if (!before) break;
  }
  return todas.sort((a, b) => new Date(iso(a?.created_at)).getTime() - new Date(iso(b?.created_at)).getTime());
}

async function executarBackfill(
  sb: SupabaseClient,
  cw: { url: string; accountId: number; token: string },
  inboxId: number,
) {
  let conversas = 0, mensagens = 0, ignoradas = 0, semVinculo = 0;
  const vistos = new Set<number>();
  for (let page = 1; page <= 100; page++) {
    const d = await cwGet(cw.url, cw.token,
      `/api/v1/accounts/${cw.accountId}/conversations?inbox_id=${inboxId}&status=all&page=${page}`);
    const lote = Array.isArray(d?.data?.payload) ? d.data.payload : [];
    let novos = 0;
    for (const resumo of lote) {
      const convId = numero(resumo?.id);
      if (!convId || vistos.has(convId)) continue;
      vistos.add(convId);
      novos++;
      const detalhe = await conversaDetalhe(cw.url, cw.token, cw.accountId, convId);
      const conv = await garantirConversa(sb, cw, convId, detalhe);
      if (!conv) { semVinculo++; continue; }
      conversas++;
      for (const m of await mensagensDaConversa(cw, convId)) {
        if ((await espelharMensagem(sb, conv, m, cw)).status === "gravada") mensagens++;
        else ignoradas++;
      }
    }
    if (lote.length === 0 || novos === 0 || vistos.size >= Number(d?.data?.meta?.all_count ?? Infinity)) break;
  }
  return { conversas, mensagens, ignoradas, sem_vinculo: semVinculo };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!serviceRole(req)) return json({ ok: false, erro: "nao_autorizado" }, 401);
  try {
    const sb = admin();
    const cw = await configESegredos(sb);
    const body = await req.json();

    if (body?.backfill === true) {
      const inboxId = numero(body?.inbox_id);
      if (!inboxId) return json({ ok: false, erro: "inbox_id_ausente" }, 400);
      return json({ ok: true, ...(await executarBackfill(sb, cw, inboxId)) });
    }

    const evento = String(body?.evento ?? body?.event ?? "");

    // `message_updated` é o único evento que traz o recibo do provedor. Ele não cria nem altera
    // conversa: só carimba a mensagem que já existe. Fica antes de tudo porque não precisa (e não
    // deve) pagar o GET do detalhe da conversa.
    if (evento === "message_updated") {
      const messageId = numero(body?.chatwoot_message_id ?? body?.id);
      if (!messageId) return json({ ok: false, erro: "message_id_ausente" }, 400);
      const r = await gravarEntrega(sb, messageId, body?.status ?? body?.message?.status);
      return json({ ok: true, entrega: r.status, status_entrega: r.status_entrega });
    }

    if (evento !== "message_created" && evento !== "conversation_created") {
      return json({ ok: true, ignorado: "evento_nao_suportado" });
    }
    const convId = numero(body?.chatwoot_conversation_id ?? body?.conversation?.id ?? body?.conversation_id);
    if (!convId) return json({ ok: false, erro: "conversation_id_ausente" }, 400);
    const detalhe = await conversaDetalhe(cw.url, cw.token, cw.accountId, convId);
    const conv = await garantirConversa(sb, cw, convId, detalhe, body?.simulacao);
    if (!conv) return json({ ok: true, ignorado: "conversa_sem_vinculo_local" });
    if (evento === "conversation_created") return json({ ok: true, conversa_id: conv.id, mensagem: "ignorada" });
    let mensagemEvento: any = {
      id: body?.chatwoot_message_id ?? body?.id,
      message_type: body?.message_type,
      private: body?.private,
      content: body?.mensagem ?? body?.content,
      content_type: body?.content_type,
      created_at: body?.created_at,
      sender_type: body?.sender_type,
      sender: body?.sender,
      attachments: body?.attachments,
    };
    // O normalizador antigo do n8n nao enviava attachments. Busca a mensagem no Chatwoot
    // para que audio continue funcionando durante a transicao do workflow.
    if (!Array.isArray(mensagemEvento.attachments) || mensagemEvento.attachments.length === 0) {
      const idAlvo = numero(mensagemEvento.id);
      if (idAlvo) {
        const encontrada = (await mensagensDaConversa(cw, convId)).find((m) => numero(m?.id) === idAlvo);
        if (encontrada) mensagemEvento = { ...encontrada, ...mensagemEvento, attachments: encontrada.attachments };
      }
    }
    const resultado = await espelharMensagem(sb, conv, mensagemEvento, cw);
    return json({
      ok: true,
      conversa_id: conv.id,
      mensagem: resultado.status,
      conteudo_processado: resultado.conteudo,
      transcricao: resultado.transcricao,
    });
  } catch (e) {
    console.error("chatwoot-sync erro:", e instanceof Error ? e.message : String(e));
    return json({ ok: false, erro: "falha_sincronizacao" }, 500);
  }
});
