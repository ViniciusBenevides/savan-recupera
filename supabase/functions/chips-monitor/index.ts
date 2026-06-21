// SAVAN Recupera — chips-monitor
// Consulta o status Z-API de cada chip conectado e atualiza chips.status/saude.
// Se desconectar, pausa o chip e registra evento (o dashboard alerta o gestor).
// NOTA: versão self-contained (igual à deployada via MCP). Chamada pelo W08 (n8n, 15 min).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }
async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor");
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor;
  return m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  const seg = await carregarSegredos(sb);
  const clientToken = seg.ZAPI_CLIENT_TOKEN ?? "";

  const { data: chips } = await sb.from("chips").select("id, nome, status").not("status", "in", "(cadastrado,banido)");
  const resultados: any[] = [];
  for (const chip of chips ?? []) {
    const { data: cred } = await sb.from("chips_credenciais").select("zapi_instance_id, zapi_token").eq("chip_id", chip.id).maybeSingle();
    if (!cred) continue;
    let saude: any = null, conectado = false;
    try {
      const r = await fetch(`https://api.z-api.io/instances/${cred.zapi_instance_id}/token/${cred.zapi_token}/status`, { headers: { "Client-Token": clientToken } });
      saude = await r.json();
      conectado = saude?.connected === true;
    } catch (e) { saude = { erro: String(e) }; }

    let novoStatus = chip.status;
    if (conectado && (chip.status === "desconectado" || chip.status === "conectado")) {
      novoStatus = chip.status === "conectado" ? "conectado" : "aquecendo";
    } else if (!conectado && ["ativo", "aquecendo", "conectado"].includes(chip.status)) {
      novoStatus = "desconectado";
      await sb.from("eventos_campanha").insert({ tipo: "chip_status", chip_id: chip.id, payload: { status: "desconectado", nome: chip.nome } });
      // failover: se há fila/conversas presas neste chip, abre um evento PENDENTE para o
      // operador confirmar a reatribuição (não migra nada sozinho).
      const { data: resumo } = await sb.rpc("fn_failover_resumo", { p_chip_id: chip.id });
      const tem = ((resumo?.aguardando ?? 0) + (resumo?.conversas_ativas ?? 0) + (resumo?.escaladas ?? 0)) > 0;
      if (tem) {
        const { data: existe } = await sb.from("failover_eventos")
          .select("id").eq("chip_caido_id", chip.id).eq("status", "pendente").maybeSingle();
        if (!existe) await sb.from("failover_eventos").insert({ chip_caido_id: chip.id, resumo });
      }
    }
    await sb.from("chips").update({ saude, status: novoStatus }).eq("id", chip.id);
    resultados.push({ chip: chip.id, conectado, status: novoStatus });
  }
  return json({ ok: true, chips: resultados });
});
