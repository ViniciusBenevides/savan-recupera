import { supabaseAdmin } from "@/lib/supabase-server";

// Chaves que cada cobrador pode ter as suas (caem no global/infra do admin se vazias).
// São exatamente as lidas pelas Edge Functions bot-turno (OpenAI) e gerar-pix (Asaas).
// Z-API é por chip (chips_credenciais) e o token de webhook do Asaas é infra do admin —
// por isso não entram aqui (evita sobrescrever a chave global de outras funções).
export const SEGREDOS_POR_COBRADOR = [
  "OPENAI_API_KEY",
  "ASAAS_API_KEY_SANDBOX",
  "ASAAS_API_KEY_PROD",
];

// Resolve um segredo para um cobrador: usa a chave do cobrador se existir e estiver
// preenchida; senão cai na chave global (cobrador_id NULL = infra do admin).
export async function getSegredo(chave: string, cobradorId: string | null): Promise<string> {
  const admin = supabaseAdmin();
  if (cobradorId) {
    const { data } = await admin
      .from("segredos").select("valor").eq("chave", chave).eq("cobrador_id", cobradorId).maybeSingle();
    if (data?.valor && data.valor.trim()) return data.valor.trim();
  }
  const { data: glob } = await admin
    .from("segredos").select("valor").eq("chave", chave).is("cobrador_id", null).maybeSingle();
  return (glob?.valor ?? "").trim();
}
