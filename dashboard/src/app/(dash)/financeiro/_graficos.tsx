"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/utils";

// Uma cor só (a tinta), eixos em português, sem enfeite: o que importa é em que dia o dinheiro entrou.
export function GraficoDias({ dados }: { dados: { dia: string; rotulo: string; valor: number }[] }) {
  const passo = dados.length > 16 ? Math.ceil(dados.length / 8) : 1;
  return (
    <div className="mt-2 h-[240px] w-full" role="img" aria-label={`Recebido por dia: total de ${brl(dados.reduce((s, d) => s + d.valor, 0))}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--c-line))" />
          <XAxis dataKey="rotulo" interval={passo - 1} tickLine={false} axisLine={{ stroke: "rgb(var(--c-line))" }} tick={{ fontSize: 12, fill: "rgb(var(--c-mist))", fontFamily: "var(--font-mono)" }} />
          <YAxis width={64} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "rgb(var(--c-mist))", fontFamily: "var(--font-mono)" }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10} mil` : String(v))} />
          <Tooltip
            cursor={{ fill: "rgb(var(--c-tinta) / 0.06)" }}
            formatter={(v: number) => [brl(v), "Recebido"]}
            labelFormatter={(l: string) => `Dia ${l}`}
            contentStyle={{ borderRadius: 10, border: "1px solid rgb(var(--c-pauta-forte))", fontSize: 13, background: "rgb(var(--c-surface))", color: "rgb(var(--c-chalk))" }}
          />
          <Bar dataKey="valor" fill="rgb(var(--c-tinta))" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
