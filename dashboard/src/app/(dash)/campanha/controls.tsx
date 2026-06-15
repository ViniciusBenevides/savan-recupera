"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Switch, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { num } from "@/lib/utils";
import { Power, FlaskConical, Clock, Timer, Flame, Save, CheckCircle2 } from "lucide-react";

async function salvar(itens: { chave: string; valor: any }[]) {
  const r = await fetch("/api/config", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itens }),
  });
  return r.ok;
}

export function CampanhaControls({ cfg, aguardando, enviados }: {
  cfg: Record<string, any>; aguardando: number; enviados: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ativa, setAtiva] = useState<boolean>(cfg.campanha_ativa === true);
  const [sim, setSim] = useState<boolean>(cfg.modo_simulacao === true);
  const [janela, setJanela] = useState(cfg.janela_envio ?? { inicio: "08:00", fim: "20:00" });
  const [intervalo, setIntervalo] = useState<number>(Number(cfg.intervalo_min_segundos ?? 12));
  const [aquec, setAquec] = useState<any[]>(cfg.aquecimento ?? []);
  const [ok, setOk] = useState(false);

  function toggle(chave: string, v: boolean) {
    start(async () => {
      await salvar([{ chave, valor: v }]);
      router.refresh();
    });
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

  const totalFila = aguardando + enviados;
  const progresso = totalFila ? (enviados / totalFila) * 100 : 0;

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
