// SAVAN Recupera — metricas-sync
// Reabre itens presos, recalcula métricas do dia a partir de eventos_campanha e
// promove chips de 'aquecendo' para 'ativo' ao fim da curva de aquecimento
// (chip 'novo' ~31d; chip 'aquecido' fim da curva curta; limite fixo = próximo ciclo).
// NOTA: versão self-contained (igual à deployada via MCP). Chamada pelo W09 (n8n, 5 min).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  const hoje = new Date().toISOString().slice(0, 10);

  // 1) reabre itens presos em processando
  const { data: reabertos } = await sb.rpc("fn_resetar_presos", { p_min: 15 });

  // 2) recalcula contagens do dia a partir dos eventos (idempotente)
  const inicioDia = hoje + "T00:00:00Z";
  const conta = async (tipo: string) => {
    const { count } = await sb.from("eventos_campanha").select("id", { count: "exact", head: true })
      .eq("tipo", tipo).gte("criado_em", inicioDia);
    return count ?? 0;
  };
  const enviados = await conta("envio");
  const respostas = await conta("resposta");
  const pixGerados = await conta("pix_gerado");
  const optouts = await conta("optout");
  const falhas = await conta("falha");

  await sb.from("metricas_diarias").upsert({
    dia: hoje, enviados, respostas, pix_gerados: pixGerados, optouts, falhas, atualizado_em: new Date().toISOString(),
  }, { onConflict: "dia" });

  // 3) promove chips de 'aquecendo' para 'ativo' ao fim da curva de aquecimento.
  // Chip 'novo' termina ao fim da curva global (~31d); 'aquecido' ao fim da curva curta;
  // limite fixo (override) já está no teto, então promove no próximo ciclo.
  const { data: chips } = await sb.from("chips")
    .select("id, status, data_ativacao, maturidade, aquecimento_perfil, limite_dia_override")
    .eq("status", "aquecendo");

  const { data: curvas } = await sb.from("configuracoes").select("chave, valor").like("chave", "aquecimento%");
  const curvaMap = new Map((curvas ?? []).map((c: { chave: string; valor: unknown }) => [c.chave, c.valor]));
  const plateauDia = (chave: string): number => {
    const curva = curvaMap.get(chave) as Array<{ de: number; ate: number }> | undefined;
    if (!Array.isArray(curva) || curva.length === 0) return 31;
    const aberta = curva.reduce((acc, f) => (Number(f.ate) >= Number(acc.ate) ? f : acc), curva[0]);
    return Number(aberta.de) || 31;
  };

  let promovidos = 0;
  for (const c of chips ?? []) {
    if (!c.data_ativacao) continue;
    const dias = Math.floor((Date.now() - new Date(c.data_ativacao).getTime()) / 86400000) + 1;
    let limiar: number;
    if (c.limite_dia_override != null) {
      limiar = 1;
    } else {
      const chave = c.maturidade === "aquecido"
        ? (c.aquecimento_perfil || "aquecimento_rapido")
        : (c.aquecimento_perfil || "aquecimento");
      limiar = plateauDia(chave);
    }
    if (dias >= limiar) { await sb.from("chips").update({ status: "ativo" }).eq("id", c.id); promovidos++; }
  }

  return json({ ok: true, reabertos: reabertos ?? 0, enviados, respostas, pix_gerados: pixGerados, chips_promovidos: promovidos });
});
