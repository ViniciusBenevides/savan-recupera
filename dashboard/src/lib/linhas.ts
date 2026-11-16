import { getSegredo } from "@/lib/segredos";

// Linha nova de WhatsApp (chip de bot) só com o MC COB numa conta própria do Chatwoot (§51 do
// contexto-projeto.md): numa conta compartilhada as caixas dele ficariam ao lado das de outro sistema.
// Quem libera é LINHAS_WHATSAPP_LIBERADAS=1; tirar a variável volta a travar. O escalador humano
// (papel "equipe") não conecta em nada e segue livre.
export function linhasLiberadas(): boolean {
  return process.env.LINHAS_WHATSAPP_LIBERADAS?.trim() === "1";
}

// O baileys-api é um servidor só para este projeto e para o Virtus Apex, e lá a conexão é endereçada
// pelo número. Se um número já está conectado nele, ele é de outro projeto (ou de outra conta), e
// conectá-lo aqui faz os dois brigarem: excluir a linha num lado desconecta o número no outro
// (§49 do contexto-projeto.md). Por isso a linha nova só conecta número que o servidor não conhece.
export type SituacaoNoServidor = "livre" | "em_uso" | "sem_resposta";

export async function situacaoNoServidor(e164: string): Promise<SituacaoNoServidor> {
  const url = (await getSegredo("BAILEYS_API_URL", null)).replace(/\/+$/, "");
  const chave = await getSegredo("BAILEYS_API_KEY", null);
  if (!url || !chave) return "sem_resposta";
  try {
    const r = await fetch(`${url}/connections/${encodeURIComponent(e164)}/health`, {
      headers: { "x-api-key": chave }, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404) return "livre";
    return r.ok ? "em_uso" : "sem_resposta";
  } catch {
    return "sem_resposta";
  }
}

export const AVISO_NUMERO_EM_USO =
  "Este número já está conectado no servidor de WhatsApp por outro sistema (por exemplo, o Virtus Apex). " +
  "Use um número que não esteja em nenhum outro projeto: se os dois usarem o mesmo número, desligar a linha num deles derruba no outro.";
export const AVISO_SERVIDOR_SEM_RESPOSTA =
  "Não deu para conferir se este número já está em uso no servidor de WhatsApp. Nada foi conectado. Tente de novo em alguns minutos.";

export const AVISO_LINHAS_BLOQUEADAS =
  "Conectar linha nova fica liberado quando a central de atendimento do MC COB estiver configurada.";
