// Dados de PIOR CASO para as telas novas. Só existem no ambiente de desenvolvimento
// (?dados=pior | vazio | um): em produção casoDeTeste() devolve sempre null.
// Tudo aqui é inventado (o repositório é público). Cada valor é plausível: o nome mais comprido que
// uma planilha real traz, o saldo de uma carteira agrícola, a carteira de um só devedor.
import type { VistaAtraso, VistaDisparos, VistaRecuperacao } from "@/lib/vistas";

export type Caso = "pior" | "vazio" | "um";
export const CASOS: { k: Caso | ""; t: string }[] = [
  { k: "", t: "Dados reais" }, { k: "pior", t: "Pior caso" }, { k: "vazio", t: "Vazio" }, { k: "um", t: "Um só" },
];

export function casoDeTeste(parametro: string | undefined): Caso | null {
  if (process.env.NODE_ENV !== "development") return null;
  return parametro === "pior" || parametro === "vazio" || parametro === "um" ? parametro : null;
}

const NOME_LONGO = "MARIA APARECIDA DOS SANTOS DE OLIVEIRA ALBUQUERQUE CAVALCANTI E SILVA NETO";
const EMPRESA_LONGA = "COOPERATIVA AGROPECUÁRIA DOS PRODUTORES RURAIS DO VALE DO ARAGUAIA LTDA - EPP";
const CARTEIRA_LONGA = "00034 | COOPERATIVA DE CRÉDITO RURAL DOS PRODUTORES DE SOJA DO NORDESTE MATO-GROSSENSE LTDA";
const CARTEIRA_CURTA = "WG";
const SEM_ESPACO = "TRANSPORTADORAERODOVIARIOINTERESTADUALDECARGASPESADAS";

export function vistaRecuperacao(caso: Caso): VistaRecuperacao {
  const frente = (t: string, n: number, tom: "atraso" | "atencao" | "neutro", acao: string) =>
    ({ t, s: "Texto de apoio do motivo, com o tamanho que as frentes de verdade têm na tela.", n, tom, href: "#", acao });
  if (caso === "vazio") {
    return {
      frentes: [frente("Responderam e esperam você", 0, "atraso", "Responder"), frente("Promessas vencidas", 0, "atraso", "Conferir"),
        frente("Pagamentos para conferir", 0, "atencao", "Ver quem"), frente("Pix pedido e não pago", 0, "atencao", "Chamar de novo"),
        frente("Retornos vencidos", 0, "atraso", "Retornar"), frente("Contestações para conferir", 0, "atencao", "Conferir"),
        frente("Envios do robô com falha", 0, "atraso", "Ver disparos"), frente("Sem telefone que dê para chamar", 0, "neutro", "Higienizar")],
      fila: [], promessas: { vencida: 0, hoje: 0, amanha: 0, futura: 0, cumpridas: 0, quebradas: 0 }, tabela: [],
    };
  }
  if (caso === "um") {
    return {
      frentes: [frente("Responderam e esperam você", 1, "atraso", "Responder"), frente("Promessas vencidas", 1, "atraso", "Conferir"),
        frente("Pagamentos para conferir", 1, "atencao", "Ver quem"), frente("Pix pedido e não pago", 1, "atencao", "Chamar de novo"),
        frente("Retornos vencidos", 1, "atraso", "Retornar"), frente("Contestações para conferir", 1, "atencao", "Conferir"),
        frente("Envios do robô com falha", 1, "atraso", "Ver disparos"), frente("Sem telefone que dê para chamar", 1, "neutro", "Higienizar")],
      fila: [{ id: 1, nome: "JO", carteira: CARTEIRA_CURTA, saldo: 0.01, conversa: 9, motivos: [{ rotulo: "Respondeu agora e espera", tom: "atraso", passo: "Responder", quando: "2026-11-10T12:00:00Z", peso: 0 }] }],
      promessas: { vencida: 1, hoje: 1, amanha: 1, futura: 1, cumpridas: 1, quebradas: 1 },
      tabela: [{ id: 1, nome: CARTEIRA_CURTA, emAberto: 1, saldoAberto: 0.01, acionados: 1, responderam: 1, promessas: 1, acordos: 1, valorAcordos: 0.01, pagaram: 1, recuperado: 0.01 }],
    };
  }
  const motivo = (rotulo: string, tom: "atraso" | "atencao", passo: string, peso: number) => ({ rotulo, tom, passo, quando: `2026-11-0${peso + 1}T12:00:00Z`, peso });
  return {
    frentes: [frente("Responderam e esperam você", 1284, "atraso", "Responder"), frente("Promessas vencidas", 12345, "atraso", "Conferir"),
      frente("Pagamentos para conferir", 1, "atencao", "Ver quem"), frente("Pix pedido e não pago", 99999, "atencao", "Chamar de novo"),
      frente("Retornos vencidos", 0, "atraso", "Retornar"), frente("Contestações para conferir", 6, "atencao", "Conferir"),
      frente("Envios do robô com falha", 1701, "atraso", "Ver disparos"), frente("Sem telefone que dê para chamar", 50577, "neutro", "Higienizar")],
    fila: [
      { id: 1, nome: NOME_LONGO, carteira: CARTEIRA_LONGA, saldo: 12345678.9, conversa: 7, motivos: [
        motivo("Respondeu há 11 dias e espera", "atraso", "Responder", 0), motivo("Promessa de R$ 1.234.567,89 venceu em 28/10", "atraso", "Conferir o pagamento", 1),
        motivo("Disse que já pagou há 29 dias", "atencao", "Pedir o comprovante", 2), motivo("Pediu o Pix de R$ 248.841,44 há 9 dias e não pagou", "atencao", "Chamar de novo", 3),
        motivo("Retorno de 03/10 ficou para trás", "atraso", "Retornar", 4), motivo("Contestou a dívida", "atencao", "Conferir antes de cobrar", 5)] },
      { id: 2, nome: "JO", carteira: CARTEIRA_CURTA, saldo: 0.01, conversa: null, motivos: [motivo("Contestou a dívida", "atencao", "Conferir antes de cobrar", 5)] },
      { id: 3, nome: EMPRESA_LONGA, carteira: "HIPER GLOBO SUPERMERCADO LTDA - ME", saldo: 248841.44, conversa: null, motivos: [motivo("Promessa venceu ontem", "atraso", "Conferir o pagamento", 1)] },
      { id: 4, nome: SEM_ESPACO, carteira: "", saldo: 15, conversa: null, motivos: [motivo("Pediu o Pix de R$ 15,00 há 3 h e não pagou", "atencao", "Chamar de novo", 3)] },
      ...Array.from({ length: 40 }, (_, i) => ({ id: 10 + i, nome: `DEVEDOR DE TESTE ${i + 1}`, carteira: "Brasmat Materiais para Construção", saldo: 100 + i, conversa: null, motivos: [motivo("Retorno de 03/11 ficou para trás", "atraso", "Retornar", 4)] })),
    ],
    promessas: { vencida: 12345, hoje: 1284, amanha: 1, futura: 0, cumpridas: 99999, quebradas: 1701 },
    tabela: [
      { id: 1, nome: CARTEIRA_LONGA, emAberto: 50577, saldoAberto: 10780000.55, acionados: 12345, responderam: 4115, promessas: 1284, acordos: 312, valorAcordos: 1234567.89, pagaram: 97, recuperado: 123456.78 },
      { id: 2, nome: CARTEIRA_CURTA, emAberto: 1, saldoAberto: 0.01, acionados: 1, responderam: 1, promessas: 0, acordos: 0, valorAcordos: 0, pagaram: 0, recuperado: 0 },
      { id: 3, nome: "HIPER GLOBO SUPERMERCADO LTDA - ME", emAberto: 493, saldoAberto: 586990.86, acionados: 0, responderam: 0, promessas: 0, acordos: 0, valorAcordos: 0, pagaram: 0, recuperado: 0 },
      { id: 4, nome: "Brasmat Materiais para Construção", emAberto: 105, saldoAberto: 627340.51, acionados: 3000, responderam: 1, promessas: 1, acordos: 1, valorAcordos: 15, pagaram: 1, recuperado: 12345678.9 },
    ],
  };
}

export function vistaAtraso(caso: Caso): VistaAtraso {
  const l = (id: number, nome: string, cpf: string, processo: string | null, saldo: number, vencimento: string | null, prescricao: string | null, carteira: string | null) =>
    ({ id, nome, cpf_cnpj: cpf, processo, saldo, vencimento, prescricao_em: prescricao, status_cobranca: "pendente", carteira_id: 1, carteiras: carteira ? { nome: carteira } : null });
  if (caso === "vazio") return { contagens: { todas: 0, lt1: 0, "1a2": 0, "2a3": 0, "3a4": 0, "4a5": 0, "5mais": 0, sem: 0 }, linhas: [], total: 0 };
  if (caso === "um") return { contagens: { todas: 1, lt1: 0, "1a2": 0, "2a3": 0, "3a4": 0, "4a5": 1, "5mais": 0, sem: 0 }, linhas: [l(1, "JO", "00000000191", null, 0.01, "2022-06-30", null, CARTEIRA_CURTA)], total: 1 };
  return {
    contagens: { todas: 1234567, lt1: 99999, "1a2": 12345, "2a3": 1284, "3a4": 1, "4a5": 0, "5mais": 1120938, sem: 50577 },
    total: 1234567,
    linhas: [
      l(1, NOME_LONGO, "00000000191", "BRAS-000123/2024-EXECUCAO-DE-TITULO-EXTRAJUDICIAL-0001", 12345678.9, "1900-01-01", "2031-12-31", CARTEIRA_LONGA),
      l(2, "JO", "00000000000191", null, 0.01, null, null, null),
      l(3, EMPRESA_LONGA, "123", "HG-000001", 248841.44, "2028-04-11", null, "HIPER GLOBO SUPERMERCADO LTDA - ME"),
      l(4, SEM_ESPACO, "00000000191", SEM_ESPACO, 15, "2021-11-10", "2020-01-01", CARTEIRA_CURTA),
      l(5, "Seán O'Brien <b>negrito</b> &amp; Cia", "00000000191", "WG-000124", 586990.86, "2026-11-09", null, "WG AGRICULTURE LTDA"),
      l(6, "ANA", "00000000191", "34/19868", 213, "2022-01-15", null, "Brasmat Materiais para Construção"),
    ],
  };
}

export function vistaDisparos(caso: Caso): VistaDisparos {
  if (caso === "vazio") return { ligada: false, simulacao: false, carteiras: [], linhas: [] };
  if (caso === "um") {
    return {
      ligada: true, simulacao: false,
      carteiras: [{ id: 1, nome: CARTEIRA_CURTA, status: "ativa", acionaveis: 1, higienizar: 1, naFila: 1, falhas: 1, linhas: 1, leitura: "O robô abre conversa no ritmo de cada linha.", saindo: true }],
      linhas: [{ id: 1, nome: "A", numero_e164: "+5500000000001", status: "ativo", enviadosHoje: 1, carteiras: 1 }],
    };
  }
  return {
    ligada: true, simulacao: true,
    carteiras: [
      { id: 1, nome: CARTEIRA_LONGA, status: "ativa", acionaveis: 50577, higienizar: 12345, naFila: 99999, falhas: 1701, linhas: 0, leitura: "Ativa, mas sem linha conectada vinculada: nada sai.", saindo: false },
      { id: 2, nome: CARTEIRA_CURTA, status: "pausada", acionaveis: 0, higienizar: 0, naFila: 0, falhas: 0, linhas: 10, leitura: "O robô não abre conversa nesta carteira.", saindo: false },
      { id: 3, nome: "HIPER GLOBO SUPERMERCADO LTDA - ME", status: "importando", acionaveis: 1, higienizar: 1, naFila: 1, falhas: 1, linhas: 1, leitura: "O robô não abre conversa nesta carteira.", saindo: false },
      { id: 4, nome: SEM_ESPACO, status: "situacao_que_ainda_nao_existe", acionaveis: 1284, higienizar: 190, naFila: 1284, falhas: 0, linhas: 2, leitura: "Pronta para enviar, mas a campanha está desligada.", saindo: false },
    ],
    linhas: [
      { id: 1, nome: "WhatsApp Comercial Goiânia - Atendimento Hiper Globo 2 (reserva da linha principal)", numero_e164: "+5500000000001", status: "ativo", enviadosHoje: 12345, carteiras: 10 },
      { id: 2, nome: "A", numero_e164: null, status: "cadastrado", enviadosHoje: 0, carteiras: 0 },
      { id: 3, nome: SEM_ESPACO, numero_e164: "+550000000002", status: "banido", enviadosHoje: 1, carteiras: 1 },
      { id: 4, nome: "Linha 4", numero_e164: "+5500000000004", status: "restrito_pelo_whatsapp", enviadosHoje: 40, carteiras: 2 },
    ],
  };
}
