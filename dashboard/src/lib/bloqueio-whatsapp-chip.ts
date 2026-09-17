import type { supabaseAdmin } from "@/lib/supabase-server";
import { bloqueioVigente, statusComBloqueio, type BloqueioWhatsapp } from "@/lib/bloqueio-whatsapp";

type Admin = ReturnType<typeof supabaseAdmin>;

type ChipParaBloqueio = {
  id: number;
  status: string | null;
  saude: Record<string, any> | null;
  whatsapp_bloqueio_ate: string | null;
};

export type SituacaoBloqueio = { travado: boolean; ate: string | null; tipo: string | null };

// Uma troca de menos de 5 min na data não é notícia — é a renovação da trava "sem fim informado"
// (ver `TRAVA_SEM_FIM_MS`). Sem esta folga o polling de 3s da tela de conexão gravaria a cada volta.
const FOLGA_MS = 5 * 60_000;

/**
 * Junta o que o Chatwoot sabe agora com o que está gravado no chip, e grava se mudou.
 *
 * Quando o Chatwoot responde, ele decide: a cópia dele é pelo menos tão recente quanto a coluna,
 * porque toda consulta ao vivo do `chips-monitor` também passa por ele. Quando não responde
 * (`doChatwoot` nulo), vale a coluna — "não sei" não libera chip bloqueado.
 *
 * Se o bloqueio aparecer com o chip em `ativo`/`aquecendo`, ele vai para `pausado` na mesma escrita,
 * pela mesma regra do monitor: sem isso, o `campanha-lote` ainda abordaria até a próxima rodada.
 */
export async function sincronizarBloqueioChip(
  admin: Admin,
  chip: ChipParaBloqueio,
  doChatwoot: BloqueioWhatsapp | null,
): Promise<SituacaoBloqueio> {
  const gravado = bloqueioVigente(chip.whatsapp_bloqueio_ate) ? chip.whatsapp_bloqueio_ate : null;
  const tipoGravado = (chip.saude?.bloqueio_whatsapp?.tipo as string | undefined) ?? null;
  if (!doChatwoot) return { travado: gravado !== null, ate: gravado, tipo: gravado ? tipoGravado : null };

  const ate = doChatwoot.ativo ? doChatwoot.ate : null;
  const travado = bloqueioVigente(ate);
  const mudou = (ate === null) !== (gravado === null) ||
    (ate !== null && gravado !== null && Math.abs(Date.parse(ate) - Date.parse(gravado)) >= FOLGA_MS);

  const statusAtual = String(chip.status ?? "cadastrado");
  const novoStatus = statusComBloqueio(statusAtual, travado);
  if (mudou || novoStatus !== statusAtual) {
    const patch: Record<string, unknown> = { whatsapp_bloqueio_ate: travado ? ate : null };
    if (novoStatus !== statusAtual) {
      patch.status = novoStatus;
      patch.saude = { ...(chip.saude ?? {}), pausado_pelo_bloqueio: true };
    }
    await admin.from("chips").update(patch).eq("id", chip.id);
  }
  return { travado, ate: travado ? ate : null, tipo: doChatwoot.tipo ?? tipoGravado };
}

/** O erro que o gatilho do banco levanta quando alguém tenta ativar um chip bloqueado. */
export function ehErroChipBloqueado(erro: { message?: string } | null | undefined): boolean {
  return !!erro?.message?.includes("chip_bloqueado_whatsapp");
}
