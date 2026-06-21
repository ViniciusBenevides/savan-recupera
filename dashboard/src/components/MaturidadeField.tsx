"use client";
import { Label, HelpHint } from "@/components/ui/primitives";
import { Snowflake, Flame, Info } from "lucide-react";

export type MaturidadeValor = {
  maturidade: "novo" | "aquecido";
  limite_dia_override: number | null;
};

// Seletor de maturidade do chip + explicação transparente + sugestão do sistema.
// Usado no cadastro (novo/flow.tsx) e na edição (chip-card.tsx).
// O usuário decide; o sistema apenas sugere e explica o que cada opção faz.
export function MaturidadeField({ value, onChange }: {
  value: MaturidadeValor;
  onChange: (v: MaturidadeValor) => void;
}) {
  const aquecido = value.maturidade === "aquecido";

  return (
    <div>
      <Label>
        Maturidade do chip
        <HelpHint text="Diz ao sistema se o número já vinha sendo usado no WhatsApp (aquecido) ou se é novo/recém-comprado (frio). Isso muda a velocidade de envio para evitar bloqueio." />
      </Label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ maturidade: "novo", limite_dia_override: null })}
          className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
            !aquecido ? "border-emerald/50 bg-emerald/8" : "border-line bg-ink-850 hover:border-ink-500"
          }`}
        >
          <Snowflake className={`mt-0.5 h-4 w-4 shrink-0 ${!aquecido ? "text-emerald" : "text-mist"}`} />
          <div>
            <div className="text-sm font-medium text-chalk">Número novo</div>
            <div className="mt-0.5 text-[11px] leading-snug text-mist">Frio, recém-comprado. Aquecimento gradual.</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange({ maturidade: "aquecido", limite_dia_override: value.limite_dia_override })}
          className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
            aquecido ? "border-amber/50 bg-amber/8" : "border-line bg-ink-850 hover:border-ink-500"
          }`}
        >
          <Flame className={`mt-0.5 h-4 w-4 shrink-0 ${aquecido ? "text-amber" : "text-mist"}`} />
          <div>
            <div className="text-sm font-medium text-chalk">Já aquecido</div>
            <div className="mt-0.5 text-[11px] leading-snug text-mist">Já vinha operando. Rampa curta.</div>
          </div>
        </button>
      </div>

      {/* Explicação transparente da estratégia escolhida */}
      <div className="mt-2 flex gap-2 rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-[11px] leading-relaxed text-mist">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
        {aquecido ? (
          <span>
            <b className="text-chalk">Sugestão do sistema:</b> rampa curta de segurança —{" "}
            <span className="text-amber">250 contatos/dia nos 3 primeiros dias, depois 500/dia</span>. Mesmo
            aquecido, um número novo para o <i>WhatsApp Business</i> ainda pode ser bloqueado se disparar tudo de
            uma vez. Você pode trocar pelo limite fixo abaixo.
          </span>
        ) : (
          <span>
            <b className="text-chalk">Sugestão do sistema:</b> aquecimento gradual de ~30 dias —{" "}
            <span className="text-emerald-soft">30 → 100 → 250 → 400 → 500 contatos/dia</span>. É o recomendado
            para chips recém-comprados, para reduzir o risco de bloqueio do WhatsApp.
          </span>
        )}
      </div>

      {/* Limite manual (opcional) — vale para qualquer maturidade, mas faz mais sentido no aquecido */}
      {aquecido && (
        <div className="mt-2">
          <Label className="text-xs">
            Limite diário fixo (opcional)
            <HelpHint text="Se preenchido, ignora a rampa e usa este número de novos contatos por dia. Deixe em branco para usar a sugestão do sistema." />
          </Label>
          <input
            type="number"
            min={1}
            placeholder="ex.: 500 — em branco usa a sugestão"
            value={value.limite_dia_override ?? ""}
            onChange={(e) =>
              onChange({
                maturidade: "aquecido",
                limite_dia_override: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="mt-1 h-10 w-full rounded-xl border border-line bg-ink-850 px-3.5 font-mono text-sm text-chalk placeholder:text-mist/50 outline-none focus:border-ink-500"
          />
        </div>
      )}
    </div>
  );
}
