/** @type {import('next').NextConfig} */

// A navegação passou de 15 itens de menu para 5 áreas com abas. Estas rotas antigas
// continuam válidas e caem na aba correspondente — links salvos e favoritos não quebram.
const rotasAntigas = [
  ["/pagamentos", "/?aba=dinheiro"],
  ["/relatorios", "/?aba=historico"],
  ["/campanha", "/ajustes?aba=envio"],
  ["/devedores", "/carteiras?aba=devedores"],
  ["/escalacoes", "/conversas?aba=escaladas"],
  ["/templates", "/robo?aba=mensagens"],
  ["/templates-meta", "/robo?aba=mensagens"],
  ["/descontos", "/robo?aba=comportamento"],
  ["/conhecimento", "/robo?aba=conhecimento"],
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
