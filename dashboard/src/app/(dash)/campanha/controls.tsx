"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Switch, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { num } from "@/lib/utils";
import { Power, FlaskConical, Clock, Timer, Flame, Save, CheckCircle2, Bot, CalendarDays, CalendarOff } from "lucide-react";

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
  const [intervalo, setIntervalo] = useState<number>(Number(cfg.intervalo_min_segundos ?? 12));
  const [aquec, setAquec] = useState<any[]>(cfg.aquecimento ?? []);
  const [nomeBot, setNomeBot] = useState<string>(cfg.ia?.nome_bot ?? "Ana");
  const [modelo, setModelo] = useState<string>(cfg.ia?.modelo ?? "gpt-4.1-mini");
  const [ok, setOk] = useState(false);

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
      const sucesso = await salvar([
        { chave: "janela_envio", valor: { ...cfg.janela_envio, ...janela } },
        { chave: "intervalo_min_segundos", valor: intervalo },
        { chave: "aquecimento", valor: aquec },
      ]);
      if (sucesso) { setOk(true); setTimeout(() => setOk(false), 2500); router.refresh(); }
    });
  }

  function salvarBot() {
    start(async () => {
      const sucesso = await salvar([{ chave: "ia", valor: { ...cfg.ia, nome_bot: nomeBot, modelo } }]);
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

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <Label><Clock className="mr-1 inline h-3.5 w-3.5" /> Início do envio</Label>
            <Input type="time" value={janela.inicio} onChange={(e) => setJanela({ ...janela, inicio: e.target.value })} />
          </div>
          <div>
            <Label><Clock className="mr-1 inline h-3.5 w-3.5" /> Fim do envio</Label>
            <Input type="time" value={janela.fim} onChange={(e) => setJanela({ ...janela, fim: e.target.value })} />
          </div>
          <div>
            <Label><Timer className="mr-1 inline h-3.5 w-3.5" /> Intervalo (segundos)</Label>
            <Input type="number" min={8} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <Label><CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Dias de envio</Label>
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

      {/* Bot (nome + modelo de IA) — por conta */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <Bot className="h-4 w-4 text-emerald" /> Robô
          </h4>
          <Button size="sm" onClick={salvarBot} disabled={pending}>
            {ok ? <><CheckCircle2 className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar</>}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nome do bot</Label>
            <Input value={nomeBot} onChange={(e) => setNomeBot(e.target.value)} />
            <p className="mt-1 text-[11px] text-mist">Usado nas mensagens (variável {"{{nome_bot}}"}) e na apresentação.</p>
          </div>
          <div>
            <Label>Modelo de IA</Label>
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
      </Card>
    </div>
  );
}
