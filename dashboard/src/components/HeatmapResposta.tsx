"use client";
import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { num } from "@/lib/utils";

export type CelulaResposta = {
  dia_semana: number;   // 0=dom … 6=sáb
  hora: number;         // 0–23
  enviadas: number;
  respostas: number;
  taxa_resposta_pct: number;
};

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * "Que horas vale abordar?" (§33) — taxa de resposta por dia da semana × hora do dia.
 *
 * Mostra só a faixa de horas em que houve envio, para a grade não virar 24 colunas vazias.
 * A intensidade é relativa ao melhor resultado do próprio período: o que interessa é comparar
 * as faixas entre si, não a taxa absoluta.
 */
export function HeatmapResposta({ dados }: { dados: CelulaResposta[] }) {
  const [foco, setFoco] = useState<CelulaResposta | null>(null);

  if (!dados.length) {
    return (
      <Card>
        <h3 className="mb-1 font-display text-base font-600 text-chalk">Melhor horário para abordar</h3>
        <p className="text-sm text-mist">
          Ainda não há envios suficientes para calcular. O mapa aparece sozinho conforme a campanha roda.
        </p>
      </Card>
    );
  }

  const horas = [...new Set(dados.map((d) => d.hora))].sort((a, b) => a - b);
  const maxTaxa = Math.max(...dados.map((d) => d.taxa_resposta_pct), 1);
  const porChave = new Map(dados.map((d) => [`${d.dia_semana}-${d.hora}`, d]));

  const melhor = [...dados].sort((a, b) => b.taxa_resposta_pct - a.taxa_resposta_pct)[0];

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-600 text-chalk">Melhor horário para abordar</h3>
        {melhor && melhor.enviadas > 0 && (
          <span className="text-xs text-mist">
            Melhor faixa: <b className="text-emerald">{DIAS[melhor.dia_semana]} {String(melhor.hora).padStart(2, "0")}h</b>
            {" "}({melhor.taxa_resposta_pct}% de resposta)
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-mist">
        Percentual de abordagens que receberam resposta, por dia da semana e hora do envio.
      </p>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10" />
              {horas.map((h) => (
                <th key={h} className="min-w-[28px] pb-1 text-center font-mono text-[10px] font-normal text-mist tabnums">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((nome, dow) => (
              <tr key={dow}>
                <td className="pr-1 text-right text-[11px] text-mist">{nome}</td>
                {horas.map((h) => {
                  const c = porChave.get(`${dow}-${h}`);
                  const intensidade = c && c.enviadas > 0 ? c.taxa_resposta_pct / maxTaxa : 0;
                  return (
                    <td key={h}>
                      <div
                        onMouseEnter={() => c && setFoco(c)}
                        onMouseLeave={() => setFoco(null)}
                        title={c ? `${nome} ${String(h).padStart(2, "0")}h — ${c.respostas}/${c.enviadas} responderam (${c.taxa_resposta_pct}%)` : "sem envio"}
                        className={`h-6 min-w-[28px] rounded ${c && c.enviadas > 0 ? "cursor-help" : ""}`}
                        style={{
                          backgroundColor: c && c.enviadas > 0
                            ? `rgb(var(--c-emerald) / ${Math.max(0.12, intensidade)})`
                            : "rgb(var(--c-ink-800))",
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 h-5 text-xs text-mist">
        {foco
          ? <>{DIAS[foco.dia_semana]} às {String(foco.hora).padStart(2, "0")}h — <span className="font-mono text-chalk tabnums">{num(foco.respostas)}</span> respostas em <span className="font-mono text-chalk tabnums">{num(foco.enviadas)}</span> envios (<b className="text-emerald">{foco.taxa_resposta_pct}%</b>)</>
          : "Passe o mouse sobre uma célula para ver os números."}
      </div>
    </Card>
  );
}
