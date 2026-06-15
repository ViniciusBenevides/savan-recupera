"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button } from "@/components/ui/primitives";
import { brl } from "@/lib/utils";
import { Save, CheckCircle2, Calculator, Plus, Trash2 } from "lucide-react";

export function DescontosEditor({ inicial }: { inicial: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [faixas, setFaixas] = useState<any[]>(inicial.faixas ?? []);
  const [minPix, setMinPix] = useState<number>(inicial.valor_minimo_pix ?? 30);
  const [margem, setMargem] = useState<number>(inicial.margem_extra_pp ?? 10);
  const [ok, setOk] = useState(false);

  // simulador
  const [valorSim, setValorSim] = useState(213.45);
  const [anoSim, setAnoSim] = useState(2009);

  function descontoPara(idade: number): { pct: number; valor: number } {
    let pct = 0;
    for (const f of faixas) if (idade >= f.idade_min && f.pct > pct) pct = f.pct;
    let valor = Math.round(valorSim * (1 - pct / 100) * 100) / 100;
    if (valor < minPix) valor = Math.min(valorSim, minPix);
    return { pct, valor };
  }
  const idadeSim = new Date().getFullYear() - anoSim;
  const sim = descontoPara(idadeSim);

  function salvar() {
    start(async () => {
      const r = await fetch("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: "faixas_desconto", valor: { faixas, valor_minimo_pix: minPix, margem_extra_pp: margem } }),
      });
      if (r.ok) { setOk(true); setTimeout(() => setOk(false), 2500); router.refresh(); }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-600 text-chalk">Faixas por idade da dívida</h3>
          <Button size="sm" onClick={salvar} disabled={pending}>
            {ok ? <><CheckCircle2 className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar</>}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {faixas.sort((a, b) => b.idade_min - a.idade_min).map((f, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-ink-850 px-3 py-2.5">
              <span className="text-sm text-mist">Dívida com</span>
              <input type="number" value={f.idade_min}
                     onChange={(e) => { const c = [...faixas]; c[i] = { ...f, idade_min: Number(e.target.value) }; setFaixas(c); }}
                     className="w-16 rounded-lg border border-line bg-ink-900 px-2 py-1 text-center font-mono text-chalk tabnums" />
              <span className="text-sm text-mist">anos ou mais →</span>
              <input type="number" value={f.pct}
                     onChange={(e) => { const c = [...faixas]; c[i] = { ...f, pct: Number(e.target.value) }; setFaixas(c); }}
                     className="w-16 rounded-lg border border-line bg-ink-900 px-2 py-1 text-center font-mono text-emerald tabnums" />
              <span className="text-sm font-medium text-emerald">% off</span>
              <button onClick={() => setFaixas(faixas.filter((_, j) => j !== i))} className="ml-auto text-mist hover:text-rose">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start"
                  onClick={() => setFaixas([...faixas, { idade_min: 0, pct: 30 }])}>
            <Plus className="h-4 w-4" /> Adicionar faixa
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Valor mínimo do Pix (R$)</Label>
            <Input type="number" value={minPix} onChange={(e) => setMinPix(Number(e.target.value))} />
          </div>
          <div>
            <Label>Margem extra de negociação (pontos %)</Label>
            <Input type="number" value={margem} onChange={(e) => setMargem(Number(e.target.value))} />
            <p className="mt-1.5 text-xs text-mist">Desconto adicional que o bot pode dar 1× se o devedor recusar.</p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <Calculator className="h-4 w-4 text-emerald" /> Simulador
        </h3>
        <div>
          <Label>Valor da dívida (R$)</Label>
          <Input type="number" step="0.01" value={valorSim} onChange={(e) => setValorSim(Number(e.target.value))} />
        </div>
        <div>
          <Label>Ano da dívida</Label>
          <Input type="number" value={anoSim} onChange={(e) => setAnoSim(Number(e.target.value))} />
        </div>
        <div className="rounded-xl border border-emerald/25 bg-emerald/8 p-4 text-center">
          <div className="text-xs text-mist">Oferta ({idadeSim} anos · {sim.pct}% off)</div>
          <div className="mt-1 font-mono text-3xl font-600 text-emerald tabnums">{brl(sim.valor)}</div>
          <div className="mt-1 text-xs text-mist line-through">{brl(valorSim)}</div>
        </div>
      </Card>
    </div>
  );
}
