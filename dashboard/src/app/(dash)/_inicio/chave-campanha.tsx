"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Switch, Badge } from "@/components/ui/primitives";
import { num } from "@/lib/utils";
import { Power, FlaskConical, SlidersHorizontal } from "lucide-react";

/**
 * A chave geral da operação. Antes era uma página inteira ("Campanha") só para dois
 * interruptores; agora ela vive no Início, junto do número que ela move. A janela de
 * envio fica em Ajustes → Envio; o ritmo é definido individualmente em Ajustes → Chips.
 */
export function ChaveCampanha({ ativa: ativa0, simulacao: sim0, aguardando, enviados, conta, podeEditar }: {
  ativa: boolean; simulacao: boolean; aguardando: number; enviados: number; conta: string; podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ativa, setAtiva] = useState(ativa0);
  const [sim, setSim] = useState(sim0);

  function toggle(chave: string, v: boolean) {
    start(async () => {
      await fetch("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [{ chave, valor: v }], conta }),
      });
      router.refresh();
    });
  }

  const totalFila = aguardando + enviados;
  const progresso = totalFila ? (enviados / totalFila) * 100 : 0;

  return (
    <Card glow={ativa} className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${ativa ? "bg-emerald/15 text-emerald" : "bg-ink-800 text-mist"}`}>
            <Power className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-display text-lg font-700 text-chalk">
              {ativa ? "Campanha ligada" : "Campanha desligada"}
            </h3>
            <p className="mt-1 max-w-md text-sm text-mist">
              {ativa
                ? "O robô está enviando nos horários permitidos e no ritmo de cada chip."
                : "Nenhuma mensagem sai enquanto estiver desligada."}
            </p>
            {podeEditar && (
              <Link href="/ajustes" className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald hover:underline">
                <SlidersHorizontal className="h-3 w-3" /> Ajustar dias e horários
              </Link>
            )}
          </div>
        </div>
        {podeEditar && (
          <Switch size="lg" checked={ativa} onChange={(v) => { setAtiva(v); toggle("campanha_ativa", v); }} />
        )}
      </div>

      {podeEditar && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber/12 text-amber">
              <FlaskConical className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-chalk">Modo simulação</span>
                {sim && <Badge tone="amber">Ativo</Badge>}
              </div>
              <p className="text-xs text-mist">Registra tudo, mas <b>não envia</b> mensagem real.</p>
            </div>
          </div>
          <Switch checked={sim} onChange={(v) => { setSim(v); toggle("modo_simulacao", v); }} />
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-mist">
          <span>Progresso da fila</span>
          <span><span className="font-mono text-chalk tabnums">{num(enviados)}</span> / {num(totalFila)} contatados</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-deep to-emerald transition-all duration-700"
               style={{ width: `${Math.max(1, progresso)}%` }} />
        </div>
      </div>

      {pending && <span className="sr-only">salvando…</span>}
    </Card>
  );
}
