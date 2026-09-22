// Qual forma do número (com ou sem o 9) o WhatsApp conhece — perguntado UMA vez por telefone e
// guardado em `telefones_devedor.whatsapp_e164`.
//
// Quem pergunta é o `contato-criar`, logo antes da primeira abordagem daquele telefone (no ritmo
// do disparador, nunca em lote). Quem usa a resposta é o `enviar-mensagem` e o próprio
// `contato-criar`, para o contato do Chatwoot nascer no MESMO número para onde a mensagem sai.
// Sem resposta gravada, os dois caem no comportamento de antes (`variantesE164Br`).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  configBaileysApi,
  consultarNumeroBaileysApi,
  type ConsultaNumeroWhatsapp,
  variantesE164Br,
} from "./baileys-api-client.ts";

export type ResultadoResolucao = ConsultaNumeroWhatsapp & { origem: "gravado" | "consulta" | "sem_consulta" };

/** As formas como o mesmo telefone pode estar gravado (com/sem `+`, com/sem o 9). */
export function formasGravadas(e164: string): string[] {
  const formas = new Set<string>();
  for (const v of [e164, ...variantesE164Br(e164)]) {
    const d = String(v ?? "").replace(/\D/g, "");
    if (!d) continue;
    formas.add(`+${d}`);
    formas.add(d);
  }
  return [...formas];
}

/**
 * Devolve a forma do número que entrega. Só a resposta POSITIVA é reaproveitada do banco:
 * `whatsapp_valido = false` também é gravado por opt-out e por "pessoa errada", que não dizem
 * nada sobre o número existir — então um `false` gravado não vira "não existe" aqui.
 *
 * "nao_existe" NÃO é gravado por esta função: o W01 leva o item para "Registrar sem WA", e é o
 * `campanha-registrar` que marca o telefone e faz o failover para o próximo — um escritor só.
 */
export async function resolverNumeroWhatsapp(
  sb: SupabaseClient,
  segredos: Record<string, string>,
  chip: { numero_e164?: string | null },
  telefone: { id?: number | null; e164: string },
): Promise<ResultadoResolucao> {
  if (telefone.id) {
    const { data } = await sb.from("telefones_devedor")
      .select("whatsapp_e164, whatsapp_valido").eq("id", telefone.id).maybeSingle();
    if (data?.whatsapp_valido === true && data.whatsapp_e164) {
      return { status: "existe", e164: data.whatsapp_e164, origem: "gravado" };
    }
  }

  const cfg = configBaileysApi(segredos);
  if (!cfg || !chip.numero_e164) {
    return { status: "indeterminado", detalhe: "sem_config_ou_chip_sem_numero", origem: "sem_consulta" };
  }

  const consulta = await consultarNumeroBaileysApi(cfg, chip.numero_e164, telefone.e164);
  if (consulta.status === "existe" && telefone.id) {
    await sb.from("telefones_devedor")
      .update({ whatsapp_e164: consulta.e164, whatsapp_valido: true, verificado_em: new Date().toISOString() })
      .eq("id", telefone.id);
  }
  return { ...consulta, origem: "consulta" };
}

/** A forma resolvida para um número qualquer (usado no envio, que só recebe o número). */
export async function numeroResolvido(sb: SupabaseClient, e164: string): Promise<string | null> {
  const { data } = await sb.from("telefones_devedor")
    .select("whatsapp_e164")
    .in("telefone_e164", formasGravadas(e164))
    .eq("whatsapp_valido", true)
    .not("whatsapp_e164", "is", null)
    .limit(1);
  return data?.[0]?.whatsapp_e164 ?? null;
}
