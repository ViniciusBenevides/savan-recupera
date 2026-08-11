/** @type {import('next').NextConfig} */

// A navegação passou de 15 itens de menu para 4 áreas com abas. Estas rotas antigas
// continuam válidas e caem na aba correspondente — links salvos e favoritos não quebram.
// O que era a área /robo virou o fluxo de cada carteira (§35), então cai na lista de carteiras:
// não há mais uma tela única de mensagens/comportamento/conhecimento para onde apontar.
const rotasAntigas = [
  ["/pagamentos", "/?aba=dinheiro"],
  ["/relatorios", "/?aba=historico"],
  ["/campanha", "/ajustes?aba=envio"],
  ["/devedores", "/carteiras?aba=devedores"],
  ["/escalacoes", "/conversas?aba=escaladas"],
  ["/robo", "/carteiras"],
  ["/robo/:resto*", "/carteiras"],
  ["/templates", "/carteiras"],
  ["/descontos", "/carteiras"],
  ["/conhecimento", "/carteiras"],
  ["/templates-meta", "/ajustes?aba=integracoes"],
  ["/configuracoes", "/ajustes?aba=integracoes"],
  ["/conta", "/ajustes?aba=conta"],
  ["/ajuda", "/ajustes?aba=ajuda"],
  ["/chips", "/ajustes?aba=chips"],
  ["/chips/custos", "/ajustes?aba=chips"],
];

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async redirects() {
    return rotasAntigas.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
};
export default nextConfig;
