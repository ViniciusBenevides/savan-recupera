"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { brl, dataHoraBR } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type Pg = { id: number; valor: number; status: string; criado_em: string; devedor_nome?: string };

export function RealtimeFeed({ inicial }: { inicial: Pg[] }) {
  const [itens, setItens] = useState<Pg[]>(inicial);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb
      .channel("pagamentos-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, (payload) => {
        const novo = payload.new as Pg;
        if (!novo) return;
        setItens((p) => [novo, ...p.filter((x) => x.id !== novo.id)].slice(0, 12));
        if (["recebido", "confirmado"].includes(novo.status)) {
          setFlash(true);
          setTimeout(() => setFlash(false), 1800);
        }
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {flash && (
        <div className="animate-fade-up rounded-xl border border-emerald/40 bg-emerald/10 px-4 py-3 text-sm text-emerald-soft">
          <Sparkles className="mr-2 inline h-4 w-4" /> Pagamento recebido agora!
        </div>
      )}
      {itens.length === 0 && <p className="py-8 text-center text-sm text-mist">Nenhum pagamento ainda.</p>}
      {itens.map((p) => {
        const pago = ["recebido", "confirmado"].includes(p.status);
        return (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-chalk">{p.devedor_nome ?? "Devedor"}</div>
              <div className="text-[11px] text-mist">{dataHoraBR(p.criado_em)}</div>
            </div>
            <div className="text-right">
              <div className={`font-mono text-sm font-600 tabnums ${pago ? "text-emerald" : "text-mist"}`}>{brl(p.valor)}</div>
              <div className="text-[11px] capitalize text-mist">{p.status}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
