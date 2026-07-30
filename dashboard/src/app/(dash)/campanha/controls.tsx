"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Switch, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { CalendarioEnvio } from "@/components/CalendarioEnvio";
import { num } from "@/lib/utils";
import { avaliarRitmo, ritmoPorIntervalo } from "@/lib/ritmo";
import { Power, FlaskConical, Clock, Timer, Flame, Save, CheckCircle2, CalendarDays, CalendarOff, CalendarRange, ChevronDown, ShieldCheck, ShieldAlert, TriangleAlert } from "lucide-react";

// Dias da semana (0=dom..6=sáb), ordenados começando na segunda p/ destacar os dias úteis.
const DIAS_SEMANA = [
  { n: 1, label: "Seg" }, { n: 2, label: "Ter" }, { n: 3, label: "Qua" }, { n: 4, label: "Qui" },
  { n: 5, label: "Sex" }, { n: 6, label: "Sáb" }, { n: 0, label: "Dom" },
];

export function CampanhaControls({ cfg, aguardando, enviados, conta, ehGlobal }: {
  cfg: Record<string, any>; aguardando: number; enviados: number; conta: string; ehGlobal: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ativa, setAtiva] = useState<boolean>(cfg.campanha_ativa === true);
  const [sim, setSim] = useState<boolean>(cfg.modo_simulacao === true);
  const [janela, setJanela] = useState<any>(() => ({
    inicio: "08:00", fim: "20:00", dias: [1, 2, 3, 4, 5], pular_feriados: true,
    ...(cfg.janela_envio ?? {}),
  }));
  const [intMin, setIntMin] = useState<number>(Number(cfg.intervalo_min_segundos ?? 30));
  const [intMax, setIntMax] = useState<number>(Number(cfg.intervalo_max_segundos ?? 90));
  const [aquec, setAquec] = useState<any[]>(cfg.aquecimento ?? []);
  const [mostrarCal, setMostrarCal] = useState(true);
  const [ok, setOk] = useState(false);
  // modo "horários diferentes por dia" (§33): liga sozinho se a config já usa faixas_por_dia
  const [porDia, setPorDia] = useState<boolean>(() => !!(cfg.janela_envio?.faixas_por_dia));

  // envia ajustes para o escopo certo (cobrador edita os seus; admin pode mirar uma conta)
  async function salvar(itens: { chave: string; valor: any }[]) {
    const r = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens, conta }),
    });
    return r.ok;
  }

  function toggle(chave: string, v: boolean) {
    start(async () => { await salvar([{ chave, valor: v }]); router.refresh(); });
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

  const totalFila = aguardando + enviados;
  const progresso = totalFila ? (enviados / totalFila) * 100 : 0;
  const escopoNota = ehGlobal
    ? "Estes são os valores-padrão da plataforma (fallback para quem não personalizar)."
    : "Estes ajustes valem só para esta conta.";

  return (
    <div className="flex flex-col gap-4">
      {/* Controle mestre */}
      <Card glow={ativa} className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className={`grid h-12 w-12 place-items-center rounded-2xl ${ativa ? "bg-emerald/15 text-emerald" : "bg-ink-800 text-mist"}`}>
            <Power className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-display text-lg font-700 text-chalk">
              {ativa ? "Campanha ligada" : "Campanha desligada"}
            </h3>
            <p className="mt-1 max-w-md text-sm text-mist">
              {ativa
                ? "O sistema está enviando mensagens automaticamente dentro das regras abaixo."
                : "Nenhuma mensagem será enviada enquanto estiver desligada."}
            </p>
            <p className="mt-1 text-[11px] text-mist">{escopoNota}</p>
          </div>
        </div>
        <Switch size="lg" checked={ativa} onChange={(v) => { setAtiva(v); toggle("campanha_ativa", v); }} />
      </Card>

      {/* Modo simulação */}
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber/12 text-amber">
            <FlaskConical className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-chalk">Modo simulação</h4>
              {sim && <Badge tone="amber">Ativo</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-mist">Registra tudo, mas <b>não envia</b> mensagens reais. Ideal para testar.</p>
          </div>
        </div>
        <Switch checked={sim} onChange={(v) => { setSim(v); toggle("modo_simulacao", v); }} />
      </Card>

      {/* Progresso da fila */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-display text-base font-600 text-chalk">Progresso da fila</h4>
          <span className="text-xs text-mist">
            <span className="font-mono text-chalk tabnums">{num(enviados)}</span> / {num(totalFila)} contatados
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-deep to-emerald transition-all duration-700"
               style={{ width: `${Math.max(1, progresso)}%` }} />
        </div>
        <div className="mt-3 flex gap-6 text-xs text-mist">
          <span>Aguardando: <span className="font-mono text-chalk tabnums">{num(aguardando)}</span></span>
          <span>Enviados: <span className="font-mono text-emerald tabnums">{num(enviados)}</span></span>
        </div>
      </Card>

      {/* Regras */}
      <Card className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-base font-600 text-chalk">Regras de envio</h4>
          <Button size="sm" onClick={salvarRegras} disabled={pending}>
            {ok ? <><CheckCircle2 className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar</>}
          </Button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label><Clock className="mr-1 inline h-3.5 w-3.5" /> Início do envio</Label>
            <Input type="time" value={janela.inicio} onChange={(e) => setJanela({ ...janela, inicio: e.target.value })} />
          </div>
          <div>
            <Label><Clock className="mr-1 inline h-3.5 w-3.5" /> Fim do envio</Label>
            <Input type="time" value={janela.fim} onChange={(e) => setJanela({ ...janela, fim: e.target.value })} />
          </div>
        </div>

        <div>
          <Label><Timer className="mr-1 inline h-3.5 w-3.5" /> Intervalo entre mensagens (segundos)</Label>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[11px] text-mist">Mínimo</span>
              <Input type="number" min={5} value={intMin} onChange={(e) => setIntMin(Number(e.target.value))} />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-mist">Máximo</span>
              <Input type="number" min={5} value={intMax} onChange={(e) => setIntMax(Number(e.target.value))} />
            </div>
          </div>
          <p className="mt-2 text-xs text-mist">
            Cada mensagem espera um tempo <b>aleatório</b> entre o mínimo e o máximo. Variar o intervalo — junto com o
            tamanho das mensagens — deixa o envio mais humano e reduz o risco de bloqueio do chip. O piso recomendado
            para disparo em massa é de <b>3 minutos (180s)</b>; além disso, cada chip tem um teto de mensagens por hora
            que nunca é ultrapassado, mesmo que o intervalo aqui seja curto.
          </p>
          <VeredictoRitmo intMin={intMin} intMax={intMax} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label><CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Dias de envio</Label>
            <button
              type="button"
              onClick={() => setPorDia((v) => !v)}
              className="text-[11px] text-emerald underline-offset-2 hover:underline"
            >
              {porDia ? "usar horário único" : "horários diferentes por dia"}
            </button>
          </div>

          {!porDia ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {DIAS_SEMANA.map((d) => {
                  const on = (janela.dias ?? []).includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() => setJanela((j: any) => {
                        const atual: number[] = j.dias ?? [];
                        const novo = on ? atual.filter((x) => x !== d.n) : [...atual, d.n].sort((a, b) => a - b);
                        return { ...j, dias: novo };
                      })}
                      className={`h-9 w-14 rounded-xl border text-sm font-medium transition ${
                        on ? "border-emerald bg-emerald/15 text-emerald" : "border-line bg-ink-850 text-mist hover:text-chalk"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-mist">Padrão: dias úteis (seg–sex). Sábado e domingo ficam desmarcados.</p>
            </>
          ) : (
            <>
              <div className="mt-2 flex flex-col gap-2">
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
              <p className="mt-2 text-xs text-mist">
                Cada dia pode ter mais de uma faixa — dá para pular o almoço ou encerrar a sexta mais cedo.
                Dia sem nenhuma faixa não envia.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald/12 text-emerald">
              <CalendarOff className="h-4 w-4" />
            </span>
            <div>
              <div className="font-medium text-chalk">Pular feriados nacionais</div>
              <p className="mt-0.5 text-xs text-mist">
                Não envia em feriado nacional (inclui Carnaval, Sexta-feira Santa e Corpus Christi).
              </p>
            </div>
          </div>
          <Switch checked={janela.pular_feriados !== false} onChange={(v) => setJanela((j: any) => ({ ...j, pular_feriados: v }))} />
        </div>

        {/* Calendário visual: mostra os dias em que a campanha roda + feriados nacionais */}
        <div>
          <button
            type="button"
            onClick={() => setMostrarCal((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3 text-left transition hover:border-line/80"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-chalk">
              <CalendarRange className="h-4 w-4 text-emerald" /> Calendário de envio
              <span className="text-xs font-normal text-mist">— veja os dias e feriados</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-mist transition-transform ${mostrarCal ? "rotate-180" : ""}`} />
          </button>
          {mostrarCal && (
            <div className="mt-3">
              <CalendarioEnvio
                janela={janela}
                onChangeFeriadosExtra={(lista) => setJanela((j: any) => ({ ...j, feriados_extra: lista }))}
              />
            </div>
          )}
        </div>

        <div>
          <Label><Flame className="mr-1 inline h-3.5 w-3.5" /> Aquecimento — novos contatos por chip/dia</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-5">
            {aquec.map((a, i) => (
              <div key={i} className="rounded-xl border border-line bg-ink-850 p-3">
                <div className="text-[11px] text-mist">Dias {a.de}–{a.ate === 9999 ? "∞" : a.ate}</div>
                <input
                  type="number"
                  value={a.limite}
                  onChange={(e) => {
                    const c = [...aquec]; c[i] = { ...a, limite: Number(e.target.value) }; setAquec(c);
                  }}
                  className="mt-1 w-full bg-transparent font-mono text-lg font-600 text-emerald outline-none tabnums"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-mist">
            Limite progressivo anti-bloqueio. Cada chip respeita estes números conforme os dias desde a ativação.
          </p>
        </div>
      </Card>
    </div>
  );
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

// Veredicto de segurança do ritmo (§33). Julga pelo pior caso — o intervalo MÍNIMO, que é a
// velocidade máxima que a configuração permite.
function VeredictoRitmo({ intMin, intMax }: { intMin: number; intMax: number }) {
  const porHora = ritmoPorIntervalo(Math.max(1, intMin));
  const porHoraLento = ritmoPorIntervalo(Math.max(1, intMax));
  const v = avaliarRitmo({ msgsHora: porHora, limiteDia: 0, intervaloMinSegundos: intMin });

  const estilo = {
    seguro: { cor: "border-emerald/30 bg-emerald/10 text-emerald", Icone: ShieldCheck },
    atencao: { cor: "border-amber/30 bg-amber/10 text-amber", Icone: ShieldAlert },
    risco: { cor: "border-rose/30 bg-rose/10 text-rose", Icone: TriangleAlert },
  }[v.nivel];
  const { Icone } = estilo;

  return (
    <div className={`mt-3 flex items-start gap-3 rounded-xl border p-3 ${estilo.cor}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-600">{v.titulo}</div>
        <p className="mt-0.5 text-xs opacity-90">{v.explicacao}</p>
        <p className="mt-1 text-[11px] opacity-70">
          Ritmo estimado: <b className="tabnums">{porHoraLento}</b> a <b className="tabnums">{porHora}</b> mensagens
          por hora, por chip.
        </p>
      </div>
    </div>
  );
}
