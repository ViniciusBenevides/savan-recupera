"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Switch, Input, Label, Button } from "@/components/ui/primitives";
import { CalendarioEnvio } from "@/components/CalendarioEnvio";
import { avaliarRitmo, ritmoPorIntervalo } from "@/lib/ritmo";
import { Clock, Timer, Flame, Save, CheckCircle2, CalendarDays, CalendarOff, CalendarRange, ChevronDown, Gauge, ShieldCheck, ShieldAlert, TriangleAlert } from "lucide-react";

// Dias da semana (0=dom..6=sáb), ordenados começando na segunda p/ destacar os dias úteis.
const DIAS_SEMANA = [
  { n: 1, label: "Seg" }, { n: 2, label: "Ter" }, { n: 3, label: "Qua" }, { n: 4, label: "Qui" },
  { n: 5, label: "Sex" }, { n: 6, label: "Sáb" }, { n: 0, label: "Dom" },
];

/**
 * Regras de envio: horário, ritmo, dias, feriados e aquecimento. Isto se ajusta uma vez e
 * esquece — por isso mora em Ajustes. A chave liga/desliga e o modo simulação, que se mexe
 * todo dia, ficaram no Início junto do número que eles movem.
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
  const [minMinutos, setMinMinutos] = useState<string>(() => segundosParaMinutosInput(Number(cfg.intervalo_min_segundos ?? 30)));
  const [maxMinutos, setMaxMinutos] = useState<string>(() => segundosParaMinutosInput(Number(cfg.intervalo_max_segundos ?? 90)));
  const [aquec, setAquec] = useState<any[]>(cfg.aquecimento ?? []);
  const [mostrarCal, setMostrarCal] = useState(false);
  const [ok, setOk] = useState(false);
  // modo "horários diferentes por dia" (§33): liga sozinho se a config já usa faixas_por_dia
  const [porDia, setPorDia] = useState<boolean>(() => !!(cfg.janela_envio?.faixas_por_dia));

  const intMin = minutosInputParaSegundos(minMinutos, Number(cfg.intervalo_min_segundos ?? 30));
  const intMaxInformado = minutosInputParaSegundos(maxMinutos, Number(cfg.intervalo_max_segundos ?? 90));
  const intMax = Math.max(intMin, intMaxInformado);
  const limitesDia = aquec.map((a) => Number(a.limite)).filter(Number.isFinite);
  const limiteDiaMin = limitesDia.length ? Math.min(...limitesDia) : 0;
  const limiteDiaMax = limitesDia.length ? Math.max(...limitesDia) : 0;
  const limiteDiaFixo = limitesDia.length > 0 && limiteDiaMin === limiteDiaMax;
  const diasAtivos: number[] = porDia
    ? DIAS_SEMANA.filter((d) => faixasDia(janela, d.n).length > 0).map((d) => d.n)
    : (janela.dias ?? []);
  const resumoQuando = porDia
    ? `${resumirDias(diasAtivos)} · horários personalizados`
    : `${resumirDias(diasAtivos)} · ${janela.inicio}–${janela.fim}`;
  const resumoRitmo = `${formatarFaixaMinutos(intMin, intMax)} entre mensagens · ${formatarLimiteDia(limiteDiaMin, limiteDiaMax)}`;

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

  // envia ajustes para o escopo certo (cobrador edita os seus; admin pode mirar uma conta)
  async function salvar(itens: { chave: string; valor: any }[]) {
    const r = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens, conta }),
    });
    return r.ok;
  }

  function salvarRegras() {
    start(async () => {
      const minSeg = Math.max(5, intMin);
      const maxSeg = Math.max(minSeg, intMax); // o máximo nunca fica abaixo do mínimo
      // Os dois formatos de janela não podem coexistir: `faixas_por_dia` tem precedência nos gates,
      // então ao voltar para o horário único ele precisa sair da config (senão a UI mostra uma coisa
      // e o disparador obedece outra).
      const janelaFinal: any = { ...cfg.janela_envio, ...janela };
      if (porDia) {
        const mapa: Record<string, [string, string][]> = {};
        for (const d of DIAS_SEMANA) mapa[String(d.n)] = faixasDia(janela, d.n);
        janelaFinal.faixas_por_dia = mapa;
      } else {
        delete janelaFinal.faixas_por_dia;
      }
      const sucesso = await salvar([
        { chave: "janela_envio", valor: janelaFinal },
        { chave: "intervalo_min_segundos", valor: minSeg },
        { chave: "intervalo_max_segundos", valor: maxSeg },
        { chave: "aquecimento", valor: aquec },
      ]);
      if (sucesso) { setOk(true); setTimeout(() => setOk(false), 2500); router.refresh(); }
    });
  }

  const escopoNota = ehGlobal
    ? "Estes são os valores-padrão da plataforma (fallback para quem não personalizar)."
    : "Estes ajustes valem só para esta conta.";

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 px-1 pb-1">
        <div>
          <h4 className="font-display text-base font-600 text-chalk">Regras de envio</h4>
          <p className="mt-0.5 text-xs text-mist">{escopoNota}</p>
        </div>
        <Button size="sm" onClick={salvarRegras} disabled={pending}>
          {ok ? <><CheckCircle2 className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar alterações</>}
        </Button>
      </div>

      <section aria-labelledby="quando-enviar" className="rounded-2xl border border-line bg-ink-900/55 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald/20 bg-emerald/10 text-emerald">
              <CalendarDays className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald/75">01</span>
                <h5 id="quando-enviar" className="font-display text-base font-600 text-chalk">Quando enviar</h5>
              </div>
              <p className="mt-0.5 text-sm text-mist">{resumoQuando}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={alternarModoHorario}
            className="rounded-lg px-2.5 py-1.5 text-xs text-emerald transition hover:bg-emerald/10"
          >
            {porDia ? "Usar horário único" : "Personalizar por dia"}
          </button>
        </div>

        {!porDia ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
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
          <div className="mt-5">
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

        <div className="mt-5 grid gap-2 border-t border-line pt-4 md:grid-cols-2">
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
          <div className="mt-3">
            <CalendarioEnvio
              janela={janela}
              onChangeFeriadosExtra={(lista) => setJanela((j: any) => ({ ...j, feriados_extra: lista }))}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="ritmo-envio" className="rounded-2xl border border-line bg-ink-900/55 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue/20 bg-blue/10 text-blue">
              <Gauge className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue/75">02</span>
                <h5 id="ritmo-envio" className="font-display text-base font-600 text-chalk">Ritmo de envio</h5>
              </div>
              <p className="mt-0.5 text-sm text-mist">{resumoRitmo}</p>
            </div>
          </div>
          <StatusRitmo intMin={intMin} intMax={intMax} limiteDia={limiteDiaMax} />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-ink-850 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-chalk">
              <Timer className="h-4 w-4 text-blue" /> Tempo entre mensagens
            </div>
            <p className="mt-1 text-xs text-mist">O sistema sorteia um tempo diferente a cada envio.</p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <Label htmlFor="intervalo-min">De</Label>
                <div className="relative">
                  <Input id="intervalo-min" type="number" min="0.08" step="0.1" value={minMinutos} onChange={(e) => setMinMinutos(e.target.value)} className="pr-12 tabnums" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist">min</span>
                </div>
              </div>
              <span className="pb-3 text-xs text-mist">até</span>
              <div>
                <Label htmlFor="intervalo-max">Até</Label>
                <div className="relative">
                  <Input id="intervalo-max" type="number" min="0.08" step="0.1" value={maxMinutos} onChange={(e) => setMaxMinutos(e.target.value)} className="pr-12 tabnums" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist">min</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-ink-850 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-chalk">
              <Flame className="h-4 w-4 text-amber" /> Novos contatos por dia
            </div>
            <p className="mt-1 text-xs text-mist">Teto diário por chip para evitar aumento brusco de volume.</p>
            {limiteDiaFixo ? (
              <div className="mt-3 max-w-48">
                <Label htmlFor="limite-dia">Até</Label>
                <div className="relative">
                  <Input
                    id="limite-dia"
                    type="number"
                    min={1}
                    value={limiteDiaMax}
                    onChange={(e) => {
                      const limite = Math.max(1, Number(e.target.value));
                      setAquec((curva) => curva.map((a) => ({ ...a, limite })));
                    }}
                    className="pr-20 tabnums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist">por chip</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-amber/20 bg-amber/8 px-3 py-2.5 text-sm text-amber">
                {formatarLimiteDia(limiteDiaMin, limiteDiaMax)} conforme a idade do chip
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-xl border border-line/80 bg-ink-850/60 px-3.5 py-3 text-xs text-mist">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
          <p>O sistema ainda respeita automaticamente o teto de segurança de cada chip. Sempre vale o limite mais conservador.</p>
        </div>

        {aquec.length > 0 && (
          <details className="group mt-3 border-t border-line pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-xs text-mist transition hover:bg-ink-850 hover:text-chalk">
              <Flame className="h-3.5 w-3.5 text-amber" />
              Ajuste avançado: variar o limite conforme a idade do chip
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {aquec.map((a, i) => (
                <div key={`${a.de}-${a.ate}`} className="rounded-xl border border-line bg-ink-850 p-3">
                  <div className="text-[11px] text-mist">Dias {a.de}–{a.ate === 9999 ? "∞" : a.ate}</div>
                  <input
                    aria-label={`Limite dos dias ${a.de} a ${a.ate === 9999 ? "em diante" : a.ate}`}
                    type="number"
                    min={1}
                    value={a.limite}
                    onChange={(e) => {
                      const c = [...aquec]; c[i] = { ...a, limite: Math.max(1, Number(e.target.value)) }; setAquec(c);
                    }}
                    className="mt-1 w-full bg-transparent font-mono text-lg font-600 text-emerald outline-none tabnums"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 px-2 text-[11px] text-mist">Use somente se quiser começar com um teto menor e aumentá-lo gradualmente.</p>
          </details>
        )}
      </section>
    </Card>
  );
}

function segundosParaMinutosInput(segundos: number): string {
  const minutos = Math.max(5, segundos) / 60;
  return String(Math.round(minutos * 100) / 100);
}

function minutosInputParaSegundos(valor: string, fallback: number): number {
  const minutos = Number(valor.replace(",", "."));
  if (!Number.isFinite(minutos) || minutos <= 0) return Math.max(5, fallback);
  return Math.max(5, Math.round(minutos * 60));
}

function formatarTempoCurto(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  const minutos = segundos / 60;
  const arredondado = minutos < 3 ? Math.round(minutos * 10) / 10 : Math.round(minutos);
  return `${String(arredondado).replace(".", ",")} min`;
}

function formatarFaixaMinutos(minSeg: number, maxSeg: number): string {
  const de = formatarTempoCurto(minSeg);
  const ate = formatarTempoCurto(maxSeg);
  if (de === ate) return de;
  if (de.endsWith(" min") && ate.endsWith(" min")) return `${de.replace(" min", "")}–${ate}`;
  return `${de}–${ate}`;
}

function formatarLimiteDia(minimo: number, maximo: number): string {
  if (maximo <= 0) return "sem teto diário configurado";
  if (minimo === maximo) return `até ${maximo} novos contatos/dia`;
  return `${minimo}–${maximo} novos contatos/dia`;
}

function resumirDias(dias: number[]): string {
  const ativos = new Set(dias);
  if (ativos.size === 0) return "Nenhum dia";
  if (DIAS_SEMANA.every((d) => ativos.has(d.n))) return "Todos os dias";
  if ([1, 2, 3, 4, 5].every((d) => ativos.has(d)) && !ativos.has(6) && !ativos.has(0)) return "Seg–Sex";
  return DIAS_SEMANA.filter((d) => ativos.has(d.n)).map((d) => d.label).join(", ");
}

// Faixas configuradas para um dia — lê o formato novo e, se ainda não existir, deriva do antigo
// (inicio/fim + dias) para o usuário não começar com a tela em branco ao trocar de modo.
function faixasDia(janela: any, dow: number): [string, string][] {
  const mapa = janela?.faixas_por_dia;
  if (mapa && typeof mapa === "object" && Array.isArray(mapa[String(dow)])) {
    return mapa[String(dow)] as [string, string][];
  }
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5];
  if (!dias.includes(dow)) return [];
  return [[janela?.inicio ?? "08:00", janela?.fim ?? "20:00"]];
}

// Editor das faixas de um dia da semana.
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

// Feedback compacto, derivado dos campos acima. Não é uma terceira configuração.
function StatusRitmo({ intMin, intMax, limiteDia }: { intMin: number; intMax: number; limiteDia: number }) {
  const porHora = ritmoPorIntervalo(Math.max(1, intMin));
  const porHoraLento = ritmoPorIntervalo(Math.max(1, intMax));
  const v = avaliarRitmo({ msgsHora: porHora, limiteDia, intervaloMinSegundos: intMin });

  const estilo = {
    seguro: { cor: "border-emerald/25 bg-emerald/10 text-emerald", Icone: ShieldCheck },
    atencao: { cor: "border-amber/25 bg-amber/10 text-amber", Icone: ShieldAlert },
    risco: { cor: "border-rose/25 bg-rose/10 text-rose", Icone: TriangleAlert },
  }[v.nivel];
  const { Icone } = estilo;

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${estilo.cor}`}>
      <Icone className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{v.titulo}</span>
      <span className="opacity-70">·</span>
      <span className="tabnums opacity-80">{porHoraLento}–{porHora} msg/h</span>
    </div>
  );
}
