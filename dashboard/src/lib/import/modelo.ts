// Definição do MODELO FIXO de planilha que o usuário baixa e preenche.
// Cabeçalhos amigáveis (casados por nome, sem depender da ordem das colunas).
import * as XLSX from "xlsx";
import { chaveCabecalho } from "./normalizar";

// campo interno -> rótulos aceitos no cabeçalho (o 1º é o oficial do modelo)
export const COLUNAS: { campo: string; rotulos: string[]; obrigatorio: boolean; ajuda: string }[] = [
  { campo: "cpf", rotulos: ["CPF/CNPJ", "CPF", "CNPJ", "Documento"], obrigatorio: true, ajuda: "Só números ou com pontuação. Ex.: 123.456.789-00" },
  { campo: "nome", rotulos: ["Nome", "Nome do cliente", "Devedor"], obrigatorio: true, ajuda: "Nome completo do devedor." },
  { campo: "saldo", rotulos: ["Saldo (R$)", "Saldo", "Valor", "Divida", "Dívida"], obrigatorio: true, ajuda: "Valor da dívida. Ex.: 1500,00" },
  { campo: "telefone", rotulos: ["Telefone", "Celular", "WhatsApp", "Telefone 1"], obrigatorio: true, ajuda: "Com DDD. Pode ter mais de um separado por vírgula." },
  { campo: "telefone2", rotulos: ["Telefone 2", "Telefone 2 (opcional)", "Celular 2"], obrigatorio: false, ajuda: "Opcional. Outro número com DDD." },
  { campo: "telefone3", rotulos: ["Telefone 3", "Celular 3"], obrigatorio: false, ajuda: "Opcional. Outro número com DDD." },
  { campo: "telefone4", rotulos: ["Telefone 4", "Celular 4"], obrigatorio: false, ajuda: "Opcional. Outro número com DDD." },
  { campo: "telefone5", rotulos: ["Telefone 5", "Celular 5"], obrigatorio: false, ajuda: "Opcional. Outro número com DDD." },
  { campo: "telefone6", rotulos: ["Telefone 6", "Celular 6"], obrigatorio: false, ajuda: "Opcional. Outro número com DDD." },
  { campo: "vencimento", rotulos: ["Vencimento", "Data de vencimento", "Data da divida", "Data da dívida"], obrigatorio: false, ajuda: "Data da dívida (dd/mm/aaaa). Define o desconto por idade." },
  { campo: "cidade", rotulos: ["Cidade"], obrigatorio: false, ajuda: "Opcional." },
  { campo: "uf", rotulos: ["UF", "Estado"], obrigatorio: false, ajuda: "Sigla de 2 letras. Ex.: SP" },
  { campo: "referencia", rotulos: ["Referência", "Referencia", "Processo", "Contrato", "Código", "Codigo"], obrigatorio: false, ajuda: "Opcional. Seu número de contrato/processo." },
  { campo: "email", rotulos: ["Email", "E-mail"], obrigatorio: false, ajuda: "Opcional." },
];

// mapa chaveCabecalho(rotulo) -> campo interno (todos os rótulos aceitos)
export const MAPA_CABECALHO: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COLUNAS) for (const r of c.rotulos) m[chaveCabecalho(r)] = c.campo;
  return m;
})();

// Gera o arquivo .xlsx do modelo (com aba de instruções) e devolve um Buffer.
export function gerarModeloXlsx(): Buffer {
  const cabecalho = COLUNAS.map((c) => c.rotulos[0]);
  const exemplo = [
    "123.456.789-00", "Maria da Silva", "1500,00", "(11) 98888-7777",
    "(11) 3222-1111", "10/03/2015", "São Paulo", "SP", "CONTRATO-001", "maria@email.com",
  ];
  const wsDados = XLSX.utils.aoa_to_sheet([cabecalho, exemplo]);
  wsDados["!cols"] = cabecalho.map(() => ({ wch: 20 }));

  const instr = [
    ["COMO PREENCHER ESTA PLANILHA"],
    [""],
    ["1. Preencha uma linha por devedor, começando na linha 2 da aba \"Devedores\"."],
    ["2. Pode apagar a linha de exemplo."],
    ["3. Colunas obrigatórias: CPF/CNPJ, Nome, Saldo (R$) e Telefone."],
    ["4. Não mude os nomes das colunas (o sistema casa pelos títulos)."],
    [""],
    ["Coluna", "Obrigatória?", "Como preencher"],
    ...COLUNAS.map((c) => [c.rotulos[0], c.obrigatorio ? "Sim" : "Não", c.ajuda]),
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instr);
  wsInstr["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDados, "Devedores");
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instruções");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
