"use client";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { brl } from "@/lib/utils";
import { useTheme } from "@/components/ThemeToggle";

export function RecuperacaoChart({ data }: { data: { dia: string; valor: number }[] }) {
  const tema = useTheme();
  const c = tema === "light"
    ? { grid: "#E6EAF0", axis: "#5A6374", area: "#10A36A", tip: "#FFFFFF", tipB: "#E0E4EC", tipT: "#0F131E" }
    : { grid: "#1F2330", axis: "#8A91A6", area: "#2BD98C", tip: "#13151D", tipB: "#1F2330", tipT: "#E7EAF2" };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.area} stopOpacity={0.45} />
            <stop offset="100%" stopColor={c.area} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis dataKey="dia" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false}
               tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={56} />
        <Tooltip
          contentStyle={{ background: c.tip, border: `1px solid ${c.tipB}`, borderRadius: 12, color: c.tipT }}
          labelStyle={{ color: c.axis }}
          formatter={(v: number) => [brl(v), "Recuperado"]}
        />
        <Area type="monotone" dataKey="valor" stroke={c.area} strokeWidth={2.5} fill="url(#g)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Funil({ etapas }: { etapas: { nome: string; valor: number; cor: string }[] }) {
  const max = Math.max(...etapas.map((e) => e.valor), 1);
  return (
    <div className="flex flex-col gap-3">
      {etapas.map((e) => (
        <div key={e.nome}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-mist">{e.nome}</span>
            <span className="font-mono font-600 text-chalk tabnums">{e.valor.toLocaleString("pt-BR")}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full transition-all duration-700"
                 style={{ width: `${Math.max(2, (e.valor / max) * 100)}%`, background: e.cor }} />
          </div>
        </div>
      ))}
    </div>
  );
}
