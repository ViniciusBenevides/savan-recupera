"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Switch, Input, Label, Button } from "@/components/ui/primitives";
import { CalendarioEnvio } from "@/components/CalendarioEnvio";
import { Clock, Save, CheckCircle2, CalendarDays, CalendarOff, CalendarRange, ChevronDown } from "lucide-react";

// Dias da semana (0=dom..6=sáb), ordenados começando na segunda p/ destacar os dias úteis.
const DIAS_SEMANA = [
  { n: 1, label: "Seg" }, { n: 2, label: "Ter" }, { n: 3, label: "Qua" }, { n: 4, label: "Qui" },
  { n: 5, label: "Sex" }, { n: 6, label: "Sáb" }, { n: 0, label: "Dom" },
];

/**
 * Ajustes de envio cuidam somente do calendário. O ritmo pertence a cada chip e é editado
 * na aba Chips; por isso esta tela nunca salva nem sobrescreve limites de hora/dia.
 */
export function RegrasEnvio({ cfg, conta, ehGlobal }: {
  cfg: Record<string, any>; conta: string; ehGlobal: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [janela, setJanela] = useState<any>(() => ({
    inicio: "08:00", fim: "20:00", dias: [1, 2, 3, 4, 5], pular_feriados: true,
    ...(cfg.janela_envio ?? {}),
  }));
  const [mostrarCal, setMostrarCal] = useState(false);
  const [ok, setOk] = useState(false);
  const [porDia, setPorDia] = useState<boolean>(() => !!(cfg.janela_envio?.faixas_por_dia));

  const diasAtivos: number[] = porDia
    ? DIAS_SEMANA.filter((d) => faixasDia(janela, d.n).length > 0).map((d) => d.n)
    : (janela.dias ?? []);
  const resumoQuando = porDia
    ? `${resumirDias(diasAtivos)} · horários personalizados`
    : `${resumirDias(diasAtivos)} · ${janela.inicio}–${janela.fim}`;

  function alternarModoHorario() {
    if (porDia) {
      setPorDia(false);
      return;
    }
    setJanela((atual: any) => {
      const mapa: Record<string, [string, string][]> = {};
      for (const d of DIAS_SEMANA) mapa[String(d.n)] = faixasDia(atual, d.n);
      return { ...atual, faixas_por_dia: mapa };
    });
    setPorDia(true);
  }

  async function salvarJanela(janelaFinal: Record<string, any>) {
    const r = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: [{ chave: "janela_envio", valor: janelaFinal }], conta }),
    });
    return r.ok;
  }

  function salvarRegras() {
    start(async () => {
      // Os dois formatos não podem coexistir: faixas_por_dia tem precedência no disparador.
      const janelaFinal: any = { ...cfg.janela_envio, ...janela };
      if (porDia) {
        const mapa: Record<string, [string, string][]> = {};
        for (const d of DIAS_SEMANA) mapa[String(d.n)] = faixasDia(janela, d.n);
        janelaFinal.faixas_por_dia = mapa;
      } else {
        delete janelaFinal.faixas_por_dia;
      }
      if (await salvarJanela(janelaFinal)) {
        setOk(true);
        setTimeout(() => setOk(false), 2500);
        router.refresh();
      }
    });
  }

  const escopoNota = ehGlobal
    ? "Horário-padrão da plataforma para contas que não personalizaram."
    : "Este calendário vale só para esta conta.";

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald/20 bg-emerald/10 text-emerald">
            <CalendarDays className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h4 className="font-display text-base font-600 text-chalk">Quando enviar</h4>
            <p className="mt-0.5 text-sm text-mist">{resumoQuando}</p>
            <p className="mt-1 text-[11px] text-mist/80">{escopoNota}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alternarModoHorario}
            className="rounded-lg px-2.5 py-1.5 text-xs text-emerald transition hover:bg-emerald/10"
          >
            {porDia ? "Usar horário único" : "Personalizar por dia"}
          </button>
          <Button size="sm" onClick={salvarRegras} disabled={pending}>
            {ok ? <><CheckCircle2 className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar</>}
          </Button>
        </div>
      </div>

      {!porDia ? (
        <div className="grid gap-5 border-t border-line pt-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Label><Clock className="mr-1 inline h-3.5 w-3.5" /> Horário</Label>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input aria-label="Horário inicial" type="time" value={janela.inicio} onChange={(e) => setJanela({ ...janela, inicio: e.target.value })} />
              <span className="text-xs text-mist">até</span>
              <Input aria-label="Horário final" type="time" value={janela.fim} onChange={(e) => setJanela({ ...janela, fim: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => {
                const on = (janela.dias ?? []).includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setJanela((j: any) => {
                      const atual: number[] = j.dias ?? [];
                      const novo = on ? atual.filter((x) => x !== d.n) : [...atual, d.n].sort((a, b) => a - b);
                      return { ...j, dias: novo };
                    })}
                    className={`h-10 min-w-12 rounded-xl border px-3 text-sm font-medium transition ${
                      on ? "border-emerald/60 bg-emerald/12 text-emerald" : "border-line bg-ink-850 text-mist hover:border-ink-500 hover:text-chalk"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-line pt-5">
          <div className="grid gap-2 lg:grid-cols-2">
            {DIAS_SEMANA.map((d) => (
              <FaixasDoDia
                key={d.n}
                label={d.label}
                faixas={faixasDia(janela, d.n)}
                onChange={(fx) => setJanela((j: any) => ({
                  ...j,
                  faixas_por_dia: { ...(j.faixas_por_dia ?? {}), [String(d.n)]: fx },
                }))}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-mist">Dia sem faixa não envia. Adicione outra faixa para pausar no almoço.</p>
        </div>
      )}

      <div className="grid gap-2 border-t border-line pt-4 md:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-ink-850 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <CalendarOff className="h-4 w-4 shrink-0 text-emerald" />
            <div>
              <div className="text-sm font-medium text-chalk">Pular feriados</div>
              <p className="text-[11px] text-mist">Feriados nacionais e datas adicionadas</p>
            </div>
          </div>
          <Switch checked={janela.pular_feriados !== false} onChange={(v) => setJanela((j: any) => ({ ...j, pular_feriados: v }))} />
        </div>
        <button
          type="button"
          aria-expanded={mostrarCal}
          onClick={() => setMostrarCal((v) => !v)}
          className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-850 px-3.5 py-3 text-left transition hover:border-ink-500"
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-emerald" />
          <span>
            <span className="block text-sm font-medium text-chalk">Ver calendário</span>
            <span className="block text-[11px] text-mist">Confira os próximos dias de envio</span>
          </span>
          <ChevronDown className={`ml-auto h-4 w-4 text-mist transition-transform ${mostrarCal ? "rotate-180" : ""}`} />
        </button>
      </div>

      {mostrarCal && (
        <CalendarioEnvio
          janela={janela}
          onChangeFeriadosExtra={(lista) => setJanela((j: any) => ({ ...j, feriados_extra: lista }))}
        />
      )}
    </Card>
  );
}

function resumirDias(dias: number[]): string {
  const ativos = new Set(dias);
  if (ativos.size === 0) return "Nenhum dia";
  if (DIAS_SEMANA.every((d) => ativos.has(d.n))) return "Todos os dias";
  if ([1, 2, 3, 4, 5].every((d) => ativos.has(d)) && !ativos.has(6) && !ativos.has(0)) return "Seg–Sex";
  return DIAS_SEMANA.filter((d) => ativos.has(d.n)).map((d) => d.label).join(", ");
}

// Faixas configuradas para um dia — lê o formato novo e deriva do horário único como fallback.
function faixasDia(janela: any, dow: number): [string, string][] {
  const mapa = janela?.faixas_por_dia;
  if (mapa && typeof mapa === "object" && Array.isArray(mapa[String(dow)])) {
    return mapa[String(dow)] as [string, string][];
  }
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5];
  if (!dias.includes(dow)) return [];
  return [[janela?.inicio ?? "08:00", janela?.fim ?? "20:00"]];
}

function FaixasDoDia({ label, faixas, onChange }: {
  label: string; faixas: [string, string][]; onChange: (f: [string, string][]) => void;
}) {
  const ligado = faixas.length > 0;
  return (
    <div className={`rounded-xl border p-3 ${ligado ? "border-line bg-ink-850" : "border-line/60 bg-ink-900"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${ligado ? "text-chalk" : "text-mist"}`}>{label}</span>
        <div className="flex items-center gap-2">
          {ligado && (
            <button type="button" onClick={() => onChange([...faixas, ["14:00", "18:00"]])}
                    className="text-[11px] text-emerald underline-offset-2 hover:underline">+ faixa</button>
          )}
          <Switch checked={ligado} onChange={(v) => onChange(v ? [["08:00", "18:00"]] : [])} />
        </div>
      </div>
      {ligado && (
        <div className="mt-2 flex flex-col gap-2">
          {faixas.map(([ini, fim], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="time" value={ini} className="h-8"
                     onChange={(e) => { const c = [...faixas]; c[i] = [e.target.value, fim]; onChange(c); }} />
              <span className="text-xs text-mist">até</span>
              <Input type="time" value={fim} className="h-8"
                     onChange={(e) => { const c = [...faixas]; c[i] = [ini, e.target.value]; onChange(c); }} />
              {faixas.length > 1 && (
                <button type="button" onClick={() => onChange(faixas.filter((_, k) => k !== i))}
                        className="text-xs text-mist hover:text-rose" aria-label="remover faixa">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
