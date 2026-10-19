"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/utils";

export function GraficoSemanas({ dados }: { dados: { rotulo: string; valor: number }[] }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (!total) return <p className="mt-2 text-[0.9375rem] text-lapis">Nenhum recebimento nas últimas 12 semanas.</p>;
  return (
    <div className="mt-3 h-[220px] w-full" role="img" aria-label={`Recuperado nas últimas 12 semanas: ${brl(total)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--c-line))" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={{ stroke: "rgb(var(--c-line))" }} tick={{ fontSize: 12, fill: "rgb(var(--c-mist))", fontFamily: "var(--font-mono)" }} />
          <YAxis width={64} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "rgb(var(--c-mist))", fontFamily: "var(--font-mono)" }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10} mil` : String(v))} />
          <Tooltip cursor={{ fill: "rgb(var(--c-tinta) / 0.06)" }} formatter={(v: number) => [brl(v), "Recuperado"]} labelFormatter={(l: string) => `Semana de ${l}`} contentStyle={{ borderRadius: 10, border: "1px solid rgb(var(--c-pauta-forte))", fontSize: 13, background: "rgb(var(--c-surface))", color: "rgb(var(--c-chalk))" }} />
          <Bar dataKey="valor" fill="rgb(var(--c-pago))" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
