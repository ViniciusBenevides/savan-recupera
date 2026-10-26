import { supabaseAdmin } from "@/lib/supabase-server";
import type { Papel, Sessao } from "@/lib/auth";

// Quem decide no Jurídico (analisar, aprovar como advogado, abrir caso, cadastrar precedente): o
// administrador e o dono da operação. O negociador e o "só leitura" acompanham.
export const podeJuridico = (papel: Papel) => papel === "admin" || papel === "cobrador";

/** A carteira do devedor, se esta pessoa pode decidir o Jurídico dele (admin: qualquer; cobrador: as dele). */
export async function carteiraDoJuridico(sessao: Sessao, devedorId: number): Promise<{ carteira_id: number } | null> {
  if (!podeJuridico(sessao.role)) return null;
  const adm = supabaseAdmin();
  const { data: dev } = await adm.from("devedores").select("carteira_id, carteiras(cobrador_id)").eq("id", devedorId).maybeSingle();
  if (!dev?.carteira_id) return null;
  if (sessao.role === "admin") return { carteira_id: dev.carteira_id };
  const dono = (dev.carteiras as unknown as { cobrador_id: string | null } | null)?.cobrador_id;
  return dono && dono === sessao.user.id ? { carteira_id: dev.carteira_id } : null;
}
