"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AlertTriangle, ArrowRight, Loader2, X } from "lucide-react";

type Evento = { id: number; chip_caido_id: number; resumo: any; detectado_em: string };
type Chip = { id: number; nome: string; status: string };

const USAVEIS = ["cadastrado", "conectado", "aquecendo", "ativo"];

// Banner global: aparece em qualquer tela quando um chip cai e há fila/conversas presas.
// O operador escolhe o chip destino e confirma — nada é migrado automaticamente.
export function FailoverBanner() {
  const router = useRouter();
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [chips, setChips] = React.useState<Chip[]>([]);
  const [destino, setDestino] = React.useState<Record<number, string>>({});
  const [pend, setPend] = React.useState<number | null>(null);

  const carregar = React.useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: evs }, { data: chs }] = await Promise.all([
      sb.from("failover_eventos").select("id, chip_caido_id, resumo, detectado_em").eq("status", "pendente").order("detectado_em", { ascending: false }),
      sb.from("chips").select("id, nome, status"),
    ]);
    setEventos(evs ?? []);
    setChips(chs ?? []);
  }, []);

  React.useEffect(() => {
    carregar();
    const sb = supabaseBrowser();
    const ch = sb.channel("failover-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "failover_eventos" }, () => carregar())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [carregar]);

  async function agir(ev: Evento, acao: "aplicar" | "ignorar") {
    setPend(ev.id);
    await fetch(`/api/failover/${ev.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, chip_destino_id: destino[ev.id] || null }),
    });
    setPend(null);
    await carregar();
    router.refresh();
  }

  if (eventos.length === 0) return null;

  const nome = (id: number) => chips.find((c) => c.id === id)?.nome ?? `Chip #${id}`;

  return (
    <div className="mb-5 space-y-3">
      {eventos.map((ev) => {
        const r = ev.resumo ?? {};
        const opcoes = chips.filter((c) => USAVEIS.includes(c.status) && c.id !== ev.chip_caido_id);
        return (
          <div key={ev.id} className="rounded-2xl border border-rose/40 bg-rose/10 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose/20 text-rose">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-chalk">
                  O chip <b className="text-rose">{nome(ev.chip_caido_id)}</b> caiu — há trabalho preso nele.
                </p>
                <p className="mt-0.5 text-xs text-mist">
                  {r.aguardando ?? 0} na fila · {r.conversas_ativas ?? 0} conversa(s) em andamento · {r.escaladas ?? 0} escalada(s) com humano.
                  As escaladas continuam com o atendente (não voltam ao bot); o histórico é preservado.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={destino[ev.id] ?? ""}
                    onChange={(e) => setDestino((d) => ({ ...d, [ev.id]: e.target.value }))}
                    className="h-9 rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none focus:border-ink-500"
                  >
                    <option value="">Pool livre (qualquer chip pega)</option>
                    {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <button
                    onClick={() => agir(ev, "aplicar")} disabled={pend === ev.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald px-3.5 text-sm font-semibold text-[#04140c] hover:bg-emerald-soft disabled:opacity-40"
                  >
                    {pend === ev.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Reatribuir e confirmar
                  </button>
                  <button
                    onClick={() => agir(ev, "ignorar")} disabled={pend === ev.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm text-mist hover:text-chalk disabled:opacity-40"
                  >
                    <X className="h-4 w-4" /> Ignorar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
