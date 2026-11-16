// O que cada tela nova desenha, separado de onde o dado vem. A página monta isto a partir do banco;
// o teste de pior caso (lib/dev/pior-caso.ts) monta o mesmo formato com dados inventados.

// ---------- Central de recuperação ----------
export type TomAtencao = "atraso" | "atencao" | "neutro";
export type Frente = { t: string; s: string; n: number; tom: TomAtencao; href: string; acao: string };
export type MotivoAtencao = { rotulo: string; tom: TomAtencao; passo: string; quando: string; peso: number };
export type PessoaAtencao = { id: number; nome: string; carteira: string; saldo: number; motivos: MotivoAtencao[]; conversa: number | null };
export type LinhaFunil = {
  id: number; nome: string; emAberto: number; saldoAberto: number; acionados: number; responderam: number; promessas: number;
  acordos: number; valorAcordos: number; pagaram: number; recuperado: number;
};
export type VistaRecuperacao = {
  frentes: Frente[];
  fila: PessoaAtencao[];
  promessas: { vencida: number; hoje: number; amanha: number; futura: number; cumpridas: number; quebradas: number };
  tabela: LinhaFunil[];
};

// ---------- Atraso / prescrição ----------
export type LinhaAtraso = {
  id: number; nome: string; cpf_cnpj: string; processo: string | null; saldo: number; vencimento: string | null; prescricao_em: string | null;
  status_cobranca: string; carteira_id: number; carteiras: { nome: string } | null;
};
export type VistaAtraso = { contagens: Record<string, number>; linhas: LinhaAtraso[]; total: number };

// ---------- Disparos e automação ----------
export type CarteiraDisparo = {
  id: number; nome: string; status: string; acionaveis: number; higienizar: number; naFila: number; falhas: number; linhas: number;
  leitura: string; saindo: boolean;
};
export type LinhaDisparo = { id: number; nome: string; numero_e164: string | null; status: string; enviadosHoje: number; carteiras: number };
export type VistaDisparos = { ligada: boolean; simulacao: boolean; carteiras: CarteiraDisparo[]; linhas: LinhaDisparo[] };
