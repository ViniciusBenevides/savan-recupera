import { Card } from "@/components/ui/primitives";
import { num } from "@/lib/utils";
import { minutosAteEsgotar, formatarDuracao } from "@/lib/ritmo";
import { faixasDoDia } from "@/lib/feriados";
import { Clock, Layers, Gauge, Radio } from "lucide-react";

export type DadosFilaHoje = {
  pendentes: number;
  enviadosHoje: number;
  tetoHoje: number;
  chipsTotal: number;
  chipsConectados: number;
  msgsHoraTotal: number;
  janela: any;
};

/**
 * "Quanto ainda cabe hoje e até que horas a fila anda" (§33).
 *
 * Depois da §30 ("diz que mandou pra +30, mas cada chip só mandou 1") ficou claro que os números
 * existiam espalhados mas ninguém conseguia ler a operação de relance. Este card responde de uma vez:
 * fila pendente, cota do dia, ritmo, quando a cota acaba e quando a janela fecha.
 */
export function FilaHoje({ dados }: { dados: DadosFilaHoje }) {
  const { pendentes, enviadosHoje, tetoHoje, chipsTotal, chipsConectados, msgsHoraTotal, janela } = dados;
  const restante = Math.max(0, tetoHoje - enviadosHoje);
  const pct = tetoHoje > 0 ? Math.min(100, (enviadosHoje / tetoHoje) * 100) : 0;

  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: janela?.tz ?? "America/Sao_Paulo" }));
  const faixas = faixasDoDia(janela, agora.getDay());
  const fechaAs = faixas.length ? faixas[faixas.length - 1][1] : null;
  const minutos = minutosAteEsgotar(Math.min(restante, pendentes), msgsHoraTotal);

  const aberta = faixas.some(([ini, fim]) => {
    const m = agora.getHours() * 60 + agora.getMinutes();
    const emMin = (s: string) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1] ?? 0);
    return m >= emMin(ini) && m < emMin(fim);
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-base font-600 text-chalk">Fila de hoje</h4>
        <span className={`flex items-center gap-1.5 text-xs ${aberta ? "text-emerald" : "text-mist"}`}>
          <Clock className="h-3.5 w-3.5" />
          {aberta && fechaAs
            ? <>A fila anda até <b className="tabnums">{fechaAs}</b></>
            : faixas.length === 0
              ? "Hoje não envia"
              : "Fora da janela agora"}
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-mist">
          <span>
            <span className="font-mono text-chalk tabnums">{num(enviadosHoje)}</span> de{" "}
            <span className="font-mono tabnums">{num(tetoHoje)}</span> envios de hoje
          </span>
          <span className="font-mono tabnums">{num(restante)} restantes</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-800">
          <div className={`h-full rounded-full transition-all duration-700 ${pct >= 90 ? "bg-amber" : "bg-emerald"}`}
               style={{ width: `${Math.max(1, pct)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Item icone={<Layers className="h-3.5 w-3.5" />} rotulo="Na fila" valor={num(pendentes)} />
        <Item icone={<Radio className="h-3.5 w-3.5" />} rotulo="Conexões"
              valor={`${num(chipsConectados)} / ${num(chipsTotal)}`}
              alerta={chipsConectados === 0 && chipsTotal > 0} />
        <Item icone={<Gauge className="h-3.5 w-3.5" />} rotulo="Ritmo" valor={`${num(msgsHoraTotal)}/h`} />
        <Item icone={<Clock className="h-3.5 w-3.5" />} rotulo="Cota acaba em"
              valor={minutos ? formatarDuracao(minutos) : "—"} />
      </div>

      {chipsConectados === 0 && chipsTotal > 0 && (
        <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          Nenhum chip conectado — nada sai da fila até religar pelo menos um.
        </p>
      )}
    </Card>
  );
}

function Item({ icone, rotulo, valor, alerta }: {
  icone: React.ReactNode; rotulo: string; valor: string; alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-ink-850 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-mist">{icone} {rotulo}</span>
      <span className={`mt-0.5 block font-mono text-base font-600 tabnums ${alerta ? "text-amber" : "text-chalk"}`}>
        {valor}
      </span>
    </div>
  );
}
