// Modo de demonstração: só vale com NEXT_PUBLIC_MODO_DEMO=1 E apontando para um Supabase local.
// Nele, "enviar mensagem" e "gerar Pix" gravam no banco como se tivessem saído, sem chamar WhatsApp,
// Chatwoot nem Asaas. Em produção (URL do Supabase na nuvem) é sempre falso, mesmo com a variável ligada.
export function modoDemoLocal(): boolean {
  return (
    process.env.NEXT_PUBLIC_MODO_DEMO === "1" &&
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  );
}
