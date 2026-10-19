// Linha nova de WhatsApp (chip de bot) só depois que o MC COB tiver o próprio atendimento: Chatwoot e
// baileys-api exclusivos. Os de hoje não são exclusivos do MC COB, e num Chatwoot o número de uma
// linha é único na instância inteira. Quem libera é LINHAS_WHATSAPP_LIBERADAS=1, posta junto com as
// credenciais do atendimento próprio. O escalador humano (papel "equipe") não conecta em nada e segue livre.
export function linhasLiberadas(): boolean {
  return process.env.LINHAS_WHATSAPP_LIBERADAS?.trim() === "1";
}

export const AVISO_LINHAS_BLOQUEADAS =
  "Conectar linha nova fica liberado quando a central de atendimento do MC COB estiver configurada.";
