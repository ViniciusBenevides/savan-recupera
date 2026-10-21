// Linha nova de WhatsApp (chip de bot) só com o MC COB numa conta própria do Chatwoot (§51 do
// contexto-projeto.md): numa conta compartilhada as caixas dele ficariam ao lado das de outro sistema.
// Quem libera é LINHAS_WHATSAPP_LIBERADAS=1; tirar a variável volta a travar. O escalador humano
// (papel "equipe") não conecta em nada e segue livre.
export function linhasLiberadas(): boolean {
  return process.env.LINHAS_WHATSAPP_LIBERADAS?.trim() === "1";
}

export const AVISO_LINHAS_BLOQUEADAS =
  "Conectar linha nova fica liberado quando a central de atendimento do MC COB estiver configurada.";
