import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sessao } from "@/lib/auth";

// Registro das ações de risco feitas pelo painel (exclusão, inativação, aprovação jurídica…).
// Não derruba a ação se a gravação falhar: a ação já aconteceu e precisa responder à pessoa;
// a falha vai para o log do servidor.
export async function registrarAuditoria(
  adm: SupabaseClient,
  sessao: Sessao,
  a: { acao: string; entidade: string; entidade_id?: string | number | null; carteira_id?: number | null; devedor_id?: number | null; detalhe?: Record<string, unknown> },
) {
  const { error } = await adm.from("auditoria").insert({
    acao: a.acao,
    entidade: a.entidade,
    entidade_id: a.entidade_id != null ? String(a.entidade_id) : null,
    carteira_id: a.carteira_id ?? null,
    devedor_id: a.devedor_id ?? null,
    autor_id: sessao.user.id,
    autor_nome: sessao.nome,
    detalhe: a.detalhe ?? {},
  });
  if (error) console.error("auditoria:", a.acao, error.message);
}
