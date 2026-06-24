import { supabaseAdmin } from "@/lib/supabase-server";

// Chaves de `configuracoes` que cada cobrador pode ter as SUAS (caem no global se vazias).
// Mesmo padrão de `segredos`: linha global (cobrador_id NULL) + 1 linha por cobrador.
// Decisão do dono (§21): Campanha, Descontos e os ajustes de bot (nome/modelo) são por conta.
//  - campanha: campanha_ativa, modo_simulacao, janela_envio, intervalo_min_segundos, aquecimento
//  - descontos: faixas_desconto
//  - bot: ia (nome_bot, modelo)
// As chaves de INFRA (asaas global, bot_persona/contexto/guardrails, chatwoot, numero_teste,
// aquecimento_rapido, validade_proposta_dias, followup, equipe_padrao) seguem globais (admin).
export const CONFIG_POR_COBRADOR = [
  "campanha_ativa",
  "modo_simulacao",
  "janela_envio",
  "intervalo_min_segundos",
  "aquecimento",
  "faixas_desconto",
  "ia",
] as const;

export type ChaveConfig = (typeof CONFIG_POR_COBRADOR)[number];
export const ehConfigPorCobrador = (chave: string) =>
  (CONFIG_POR_COBRADOR as readonly string[]).includes(chave);

// Resolve o mapa de config para um escopo: começa nos defaults globais (cobrador_id NULL) e,
// para um cobrador, sobrescreve com as linhas dele (apenas as chaves por-conta existem por cobrador).
// cobradorId null = visão global (admin). Usa o service role (já guardado pelo papel na chamada).
export async function getConfigEscopo(cobradorId: string | null): Promise<Record<string, any>> {
  const admin = supabaseAdmin();
  const cfg: Record<string, any> = {};
  const { data: glob } = await admin.from("configuracoes").select("chave, valor").is("cobrador_id", null);
  for (const r of glob ?? []) cfg[r.chave] = r.valor;
  if (cobradorId) {
    const { data: meu } = await admin.from("configuracoes").select("chave, valor").eq("cobrador_id", cobradorId);
    for (const r of meu ?? []) cfg[r.chave] = r.valor;
  }
  return cfg;
}

// Indica, por chave, se o cobrador tem a SUA linha (personalizou) ou está herdando o global.
// Útil na UI ("usando o padrão" vs "personalizado por você").
export async function chavesPersonalizadas(cobradorId: string): Promise<Set<string>> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("configuracoes").select("chave").eq("cobrador_id", cobradorId);
  return new Set((data ?? []).map((r) => r.chave));
}

// Grava uma chave de config no escopo (cobradorId NULL = global do admin; preenchido = do cobrador).
// Upsert manual respeitando os índices únicos parciais (1 global + 1 por cobrador).
export async function setConfig(
  cobradorId: string | null,
  chave: string,
  valor: any,
  userId: string,
): Promise<{ error?: string }> {
  const admin = supabaseAdmin();
  let sel = admin.from("configuracoes").select("chave").eq("chave", chave);
  sel = cobradorId ? sel.eq("cobrador_id", cobradorId) : sel.is("cobrador_id", null);
  const { data: existe } = await sel.maybeSingle();

  if (existe) {
    let upd = admin.from("configuracoes")
      .update({ valor, atualizado_por: userId, atualizado_em: new Date().toISOString() })
      .eq("chave", chave);
    upd = cobradorId ? upd.eq("cobrador_id", cobradorId) : upd.is("cobrador_id", null);
    const { error } = await upd;
    return { error: error?.message };
  }
  const { error } = await admin.from("configuracoes")
    .insert({ chave, valor, cobrador_id: cobradorId, atualizado_por: userId, atualizado_em: new Date().toISOString() });
  return { error: error?.message };
}
