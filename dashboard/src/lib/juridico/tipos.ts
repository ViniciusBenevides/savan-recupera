// Linhas do Jurídico como as telas recebem do banco (juridico_analises, juridico_casos…).
import type { Fundamento } from "@/lib/juridico/motor";
import type { PesquisaJurisprudencia } from "@/lib/juridico/ia";
import type { EstadoFonte } from "@/lib/juridico/servico";

export type Analise = {
  id: number; devedor_id: number; carteira_id: number | null; versao_motor: string; status: "RASCUNHO" | "APROVADA";
  saldo: number; titulos: number; primeiro_venc: string | null; ultimo_venc: string | null; anos: number[];
  medida: string; alternativa: string | null; confianca: number; forca_prova: string | null;
  fontes_status: string; fontes_verificadas_em: string | null; fontes: EstadoFonte[];
  fatos: { valoresDocumentos?: number[]; datasDocumentos?: string[]; anosDocumentos?: number[] } & Record<string, unknown>;
  pendencias: string[]; riscos: string[]; fundamentos: Fundamento[]; jurisprudencia: PesquisaJurisprudencia;
  fundamentacao: string | null; defesa: string | null; estrategia: string | null; minuta: string | null; modelo_ia: string | null;
  criado_por_nome: string | null; aprovado_por_nome: string | null; aprovado_em: string | null; criado_em: string;
};

export type Caso = {
  id: number; devedor_id: number; analise_id: number | null; etapa: string; prioridade: string; acao: string; cnj: string | null;
  tribunal: string | null; comarca: string | null; vara: string | null; valor_causa: number | null; custas: number | null;
  responsavel: string | null; proxima_acao: string | null; prazo: string | null; status: string; observacao: string | null; criado_em: string;
};

export type Documento = {
  id: number; tipo: string; nome: string; observacao: string | null; arquivo_path: string | null; arquivo_tamanho: number | null;
  texto_lido: boolean; criado_por_nome: string | null; criado_em: string;
};

// Tipos de documento que a triagem reconhece (os sinais do motor saem do tipo, do nome e do texto)
export const TIPOS_DOCUMENTO = [
  "Contrato", "Confissão de dívida", "Nota promissória", "Cheque", "Duplicata", "Nota fiscal", "Boleto",
  "Comprovante de entrega", "Protesto", "Acordo assinado", "Comprovante de pagamento parcial", "Outro documento da dívida",
];

export const ESPECIES_TITULO = ["Crediário", "Duplicata", "Cheque", "Nota promissória", "Contrato", "Confissão de dívida", "Boleto", "Outro"];
