"use client";
import { useState } from "react";
import { Card, Label, Input } from "@/components/ui/primitives";
import { calcularCusto, META_TARIFAS_BRL, type CenarioCusto } from "@/lib/meta/precos";
import { brl } from "@/lib/utils";
import { BadgeCheck, Info } from "lucide-react";

function CampoNumero({ label, valor, onChange, sufixo }: { label: string; valor: number; onChange: (v: number) => void; sufixo?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Input type="number" value={Number.isFinite(valor) ? valor : 0} onChange={(e) => onChange(Number(e.target.value))}
               className="pr-12 font-mono text-sm" min={0} />
        {sufixo && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-mist">{sufixo}</span>}
      </div>
    </div>
  );
}

// Calculadora viva do custo mensal na Meta Cloud API — cobrança por mensagem iniciada,
// por categoria. Tarifas de referência editáveis (lib/meta/precos.ts).
export function CalculadoraCusto() {
  const [c, setC] = useState<CenarioCusto>({ numeros: 3, msgsDia: 200, diasMes: 22, pctMarketing: 80, pctUtility: 10 });
  const [tarMkt, setTarMkt] = useState(META_TARIFAS_BRL.marketing);
  const [tarUtl, setTarUtl] = useState(META_TARIFAS_BRL.utility);
  const [avancado, setAvancado] = useState(false);

  const set = (p: Partial<CenarioCusto>) => setC((x) => ({ ...x, ...p }));
  const r = calcularCusto(c, { marketing: tarMkt, utility: tarUtl, authentication: META_TARIFAS_BRL.authentication, service: 0 });
  const pctSvc = Math.max(0, 100 - c.pctMarketing - c.pctUtility);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNumero label="Quantos números" valor={c.numeros} onChange={(v) => set({ numeros: v })} />
          <CampoNumero label="Mensagens iniciadas / número / dia" valor={c.msgsDia} onChange={(v) => set({ msgsDia: v })} />
          <CampoNumero label="Dias de disparo no mês" valor={c.diasMes} onChange={(v) => set({ diasMes: v })} sufixo="dias" />
          <div />
          <CampoNumero label="% que é abordagem fria (marketing)" valor={c.pctMarketing} onChange={(v) => set({ pctMarketing: v })} sufixo="%" />
          <CampoNumero label="% que é utilidade (utility)" valor={c.pctUtility} onChange={(v) => set({ pctUtility: v })} sufixo="%" />
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-mist">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue" />
          O restante ({pctSvc}%) é tratado como resposta dentro da janela de 24h — <b className="text-chalk">grátis na Meta</b>.
        </p>

        <button onClick={() => setAvancado((v) => !v)} className="text-[11px] text-mist underline hover:text-chalk">
          {avancado ? "Esconder" : "Ajustar"} as tarifas de referência
        </button>
        {avancado && (
          <div className="grid gap-3 rounded-xl border border-line bg-ink-850 p-3 sm:grid-cols-2">
            <CampoNumero label="Marketing (R$/msg)" valor={tarMkt} onChange={setTarMkt} sufixo="R$" />
            <CampoNumero label="Utility (R$/msg)" valor={tarUtl} onChange={setTarUtl} sufixo="R$" />
            <p className="col-span-full text-[11px] text-mist">
              Valores de referência (Brasil, jun/2026). A Meta muda a tabela com frequência — confira no painel dela antes de decidir.
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-1.5 border-emerald/30">
          <div className="flex items-center gap-2 text-sm text-mist"><BadgeCheck className="h-4 w-4 text-emerald" /> Custo estimado na Meta</div>
          <div className="font-display text-3xl font-700 text-chalk tabnums">{brl(r.metaMes)}<span className="text-base text-mist">/mês</span></div>
          <p className="text-[11px] text-mist">
            {r.msgsMes.toLocaleString("pt-BR")} msgs iniciadas/mês · marketing {brl(r.metaPorCategoria.marketing)} + utility {brl(r.metaPorCategoria.utility)}.
          </p>
        </Card>
        <Card className="space-y-1.5">
          <div className="text-sm text-mist">Custo médio por mensagem iniciada</div>
          <div className="font-display text-3xl font-700 text-chalk tabnums">{brl(r.custoPorMsg)}</div>
          <p className="text-[11px] text-mist">
            Não há custo fixo por número: a Meta cobra por mensagem iniciada. Quem responde e continua a conversa
            dentro das 24h não gera custo adicional.
          </p>
        </Card>
      </div>
    </div>
  );
}
