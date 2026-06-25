"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, CalendarPlus } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { feriadosNacionais, listaFeriados, isoLocal, diaMes, statusDoDia } from "@/lib/feriados";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const ESTILO: Record<string, string> = {
  envia: "bg-emerald/15 text-emerald hover:bg-emerald/25 cursor-pointer",
  feriado: "bg-amber/12 text-amber cursor-default",
  feriado_extra: "bg-violet/15 text-violet hover:bg-violet/25 cursor-pointer",
  fora: "bg-ink-800 text-mist/50 cursor-default",
};

// Calendário visual da janela de envio. Lê dias/pular_feriados/feriados_extra de `janela`
// (somente leitura) e edita os feriados_extra via onChangeFeriadosExtra. Clicar num dia "envia"
// marca folga; clicar numa folga adicionada remove. Feriado nacional e fim de semana não são clicáveis.
export function CalendarioEnvio({ janela, onChangeFeriadosExtra }: {
  janela: any; onChangeFeriadosExtra: (lista: string[]) => void;
}) {
  const hoje = new Date();
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [novaData, setNovaData] = useState("");
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const feriadosAno = useMemo(() => feriadosNacionais(ano), [ano]);
  const extras: string[] = Array.isArray(janela?.feriados_extra) ? janela.feriados_extra : [];
  const hojeIso = isoLocal(hoje);

  const primeiroDow = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas: ({ dia: number; iso: string; dow: number } | null)[] = [];
  for (let i = 0; i < primeiroDow; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mes, d);
    celulas.push({ dia: d, iso: isoLocal(dt), dow: dt.getDay() });
  }

  function toggleExtra(iso: string) {
    const novo = extras.includes(iso) ? extras.filter((x) => x !== iso) : [...extras, iso].sort();
    onChangeFeriadosExtra(novo);
  }
  function adicionarData() {
    if (novaData && !extras.includes(novaData)) onChangeFeriadosExtra([...extras, novaData].sort());
    setNovaData("");
  }

  return (
    <div className="rounded-xl border border-line bg-ink-850 p-4">
      {/* navegação do mês */}
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setRef(new Date(ano, mes - 1, 1))}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-mist transition hover:text-chalk">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-display text-sm font-600 text-chalk">{MESES[mes]} {ano}</div>
        <button type="button" onClick={() => setRef(new Date(ano, mes + 1, 1))}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-mist transition hover:text-chalk">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* grade */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-mist">
        {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((cel, i) => {
          if (!cel) return <div key={i} />;
          const st = statusDoDia(cel.iso, cel.dow, janela, feriadosAno);
          const nome = feriadosAno.get(cel.iso);
          const clicavel = st === "envia" || st === "feriado_extra";
          const titulo = nome
            ? `Feriado nacional: ${nome}`
            : st === "feriado_extra" ? "Folga adicionada — clique para remover"
            : st === "envia" ? "Envia neste dia — clique para marcar folga"
            : "Não envia";
          return (
            <button
              key={i}
              type="button"
              title={titulo}
              onClick={clicavel ? () => toggleExtra(cel.iso) : undefined}
              className={`relative grid aspect-square place-items-center rounded-lg text-xs font-medium transition ${ESTILO[st]} ${
                cel.iso === hojeIso ? "ring-1 ring-chalk/40" : ""
              }`}
            >
              {cel.dia}
              {nome && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-amber" />}
            </button>
          );
        })}
      </div>

      {/* legenda */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mist">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald/40" /> Envia</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber/40" /> Feriado nacional</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet/40" /> Folga adicionada</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-ink-800 ring-1 ring-line" /> Não envia</span>
      </div>

      {/* adicionar folga por data + chips das folgas */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-mist">Adicionar folga (feriado regional/ponto facultativo)</label>
            <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
          </div>
          <Button size="md" variant="outline" onClick={adicionarData} disabled={!novaData}>
            <CalendarPlus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        {extras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[...extras].sort().map((iso) => (
              <span key={iso} className="flex items-center gap-1.5 rounded-lg border border-violet/25 bg-violet/12 px-2 py-1 text-xs text-violet">
                {diaMes(iso)}/{iso.slice(0, 4)}
                <button type="button" onClick={() => toggleExtra(iso)} className="text-violet/70 hover:text-violet" title="Remover folga">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* feriados nacionais do ano exibido (referência) */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-mist">Feriados nacionais em {ano}</div>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {listaFeriados(ano).map((f) => (
            <div key={f.data + f.nome} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-chalk">{f.nome}</span>
              <span className="shrink-0 font-mono text-mist tabnums">{diaMes(f.data)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
