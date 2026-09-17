"use client";
import * as React from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bloqueioVigente, formatarFimBloqueio } from "@/lib/bloqueio-whatsapp";
import { ArrowRight, ShieldAlert } from "lucide-react";

type Chip = { id: number; nome: string; whatsapp_bloqueio_ate: string | null };

// De quanto em quanto tempo reler: o `chips-monitor` roda a cada 15 min, e o bloqueio também vence
// sozinho — sem reler, o banner continuaria gritando depois do fim.
const RELER_MS = 60_000;

// Banner global: aparece em qualquer tela enquanto o WhatsApp estiver bloqueando algum chip de
// iniciar conversa nova (reach-out time-lock). Só avisa — quem impede a ativação é a API e o banco.
export function BloqueioWhatsappBanner() {
  const [chips, setChips] = React.useState<Chip[]>([]);

  const carregar = React.useCallback(async () => {
    const { data } = await supabaseBrowser().from("chips")
      .select("id, nome, whatsapp_bloqueio_ate")
      .gt("whatsapp_bloqueio_ate", new Date().toISOString())
      .order("whatsapp_bloqueio_ate");
    setChips((data ?? []) as Chip[]);
  }, []);

  React.useEffect(() => {
    carregar();
    const t = setInterval(carregar, RELER_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const vigentes = chips.filter((c) => bloqueioVigente(c.whatsapp_bloqueio_ate));
  if (vigentes.length === 0) return null;

  return (
    <div className="mb-5 space-y-3">
      {vigentes.map((c) => (
        <div key={c.id} className="rounded-2xl border border-rose/40 bg-rose/10 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose/20 text-rose">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-chalk">
                O WhatsApp bloqueou o <b className="text-rose">{c.nome}</b> de iniciar conversas novas
                até <b className="text-chalk">{formatarFimBloqueio(c.whatsapp_bloqueio_ate)}</b>.
              </p>
              <p className="mt-0.5 text-xs text-mist">
                Até lá o chip fica pausado e não pode ser ativado; quem já está conversando continua sendo
                respondido. Reconectar não tira o bloqueio.
              </p>
            </div>
            <Link href="/ajustes?aba=chips"
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-mist hover:text-chalk">
              Ver chip <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
