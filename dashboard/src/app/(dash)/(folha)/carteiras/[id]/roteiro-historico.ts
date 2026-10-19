"use client";
import * as React from "react";
import type { EtapaRoteiro } from "./roteiro-layout";

// Estado do fluxo em edição, com desfazer/refazer. Vive fora dos editores porque há dois — o guiado
// (fluxo-simples) e o desenho (roteiro) — e trocar de um para o outro não pode perder o que foi
// digitado e ainda não salvo.

export type DocumentoRoteiro = { ativo: boolean; etapas: EtapaRoteiro[]; pos_inicio?: { x: number; y: number } };
type Atualizador<T> = T | ((anterior: T) => T);

/** Histórico local inspirado no editor da Virtus; o banco continua recebendo o mesmo `roteiro`. */
export function useHistoricoRoteiro(inicial: DocumentoRoteiro) {
  const [documento, setDocumento] = React.useState(inicial);
  const documentoRef = React.useRef(inicial);
  const passados = React.useRef<DocumentoRoteiro[]>([]);
  const futuros = React.useRef<DocumentoRoteiro[]>([]);
  const ultimoGrupo = React.useRef<{ nome: string; em: number } | null>(null);
  const [salvo, setSalvo] = React.useState(() => assinatura(inicial));

  const aplicar = React.useCallback((atualizador: Atualizador<DocumentoRoteiro>, grupo?: string) => {
    const anterior = documentoRef.current;
    const proximo = typeof atualizador === "function"
      ? (atualizador as (valor: DocumentoRoteiro) => DocumentoRoteiro)(anterior)
      : atualizador;
    if (assinatura(anterior) === assinatura(proximo)) return;

    const agora = Date.now();
    const agrupado = !!grupo && ultimoGrupo.current?.nome === grupo && agora - ultimoGrupo.current.em < 900;
    if (!agrupado) passados.current = [...passados.current.slice(-59), anterior];
    futuros.current = [];
    ultimoGrupo.current = grupo ? { nome: grupo, em: agora } : null;
    documentoRef.current = proximo;
    setDocumento(proximo);
  }, []);

  const setEtapas = React.useCallback((atualizador: Atualizador<EtapaRoteiro[]>, grupo?: string) => {
    aplicar((atual) => ({
      ...atual,
      etapas: typeof atualizador === "function"
        ? (atualizador as (valor: EtapaRoteiro[]) => EtapaRoteiro[])(atual.etapas)
        : atualizador,
    }), grupo);
  }, [aplicar]);

  const setAtivo = React.useCallback((ativo: boolean) => aplicar((atual) => ({ ...atual, ativo })), [aplicar]);
  const setPosInicio = React.useCallback((pos_inicio?: { x: number; y: number }) =>
    aplicar((atual) => ({ ...atual, pos_inicio })), [aplicar]);
  const substituir = React.useCallback((roteiro: DocumentoRoteiro) => aplicar(roteiro), [aplicar]);

  const desfazer = React.useCallback(() => {
    const anterior = passados.current.pop();
    if (!anterior) return;
    futuros.current = [documentoRef.current, ...futuros.current].slice(0, 60);
    documentoRef.current = anterior;
    ultimoGrupo.current = null;
    setDocumento(anterior);
  }, []);

  const refazer = React.useCallback(() => {
    const proximo = futuros.current.shift();
    if (!proximo) return;
    passados.current = [...passados.current.slice(-59), documentoRef.current];
    documentoRef.current = proximo;
    ultimoGrupo.current = null;
    setDocumento(proximo);
  }, []);

  const marcarSalvo = React.useCallback(() => {
    setSalvo(assinatura(documentoRef.current));
    ultimoGrupo.current = null;
  }, []);

  return {
    documento,
    setAtivo,
    setEtapas,
    setPosInicio,
    substituir,
    desfazer,
    refazer,
    marcarSalvo,
    podeDesfazer: passados.current.length > 0,
    podeRefazer: futuros.current.length > 0,
    alterado: assinatura(documento) !== salvo,
  };
}

export type HistoricoRoteiro = ReturnType<typeof useHistoricoRoteiro>;

function assinatura(documento: DocumentoRoteiro): string {
  return JSON.stringify(documento);
}
