"use client";
import { Label, HelpHint } from "@/components/ui/primitives";
import { Snowflake, Flame, Gauge, ShieldCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { avaliarRitmo, minutosAteEsgotar, formatarDuracao } from "@/lib/ritmo";

export type MaturidadeValor = {
  maturidade: "novo" | "aquecido";
  limite_dia_override: number | null;
  limite_hora_override: number | null;
};

// Sugestão do sistema por maturidade — espelha o seed `ritmo` da migration 026 (§33).
const SUGESTAO_HORA: Record<string, number> = { novo: 8, aquecido: 25 };

// Seletor de maturidade do chip + ritmo de envio (por hora e por dia).
// Usado no cadastro (novo/flow.tsx) e na edição (chip-card.tsx).
// O usuário decide; o sistema sugere, explica e avisa quando a configuração fica arriscada.
export function MaturidadeField({ value, onChange }: {
  value: MaturidadeValor;
  onChange: (v: MaturidadeValor) => void;
}) {
  const aquecido = value.maturidade === "aquecido";
  const sugestaoHora = SUGESTAO_HORA[value.maturidade] ?? 8;
  const horaEfetiva = value.limite_hora_override ?? sugestaoHora;
  // O teto diário não é mais editável aqui: quem manda é a curva por idade do chip. O valor só
  // aparece no veredicto quando algum chip antigo ainda carrega um override gravado.
  const diaEfetivo = value.limite_dia_override;

  const veredicto = avaliarRitmo({
    msgsHora: horaEfetiva,
    limiteDia: diaEfetivo,
    idadeDias: value.maturidade === "novo" ? 1 : undefined,
  });
  const estilo = {
    seguro: { cor: "border-emerald/30 bg-emerald/10 text-emerald", Icone: ShieldCheck },
    atencao: { cor: "border-amber/30 bg-amber/10 text-amber", Icone: ShieldAlert },
    risco: { cor: "border-rose/30 bg-rose/10 text-rose", Icone: TriangleAlert },
  }[veredicto.nivel];
  const { Icone } = estilo;
  const esgota = minutosAteEsgotar(diaEfetivo ?? 0, horaEfetiva);

  return (
    <div>
      <Label>
        Maturidade do chip
        <HelpHint text="Diz ao sistema se o número já vinha sendo usado no WhatsApp (aquecido) ou se é novo/recém-comprado (frio). Isso muda a velocidade de envio para evitar bloqueio." />
      </Label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, maturidade: "novo" })}
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
          onClick={() => onChange({ ...value, maturidade: "aquecido" })}
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

      {/* Ritmo de envio deste chip — só o teto por hora, com veredicto */}
      <div className="mt-3 rounded-xl border border-line bg-ink-850 p-3">
        <Label className="text-xs">
          <Gauge className="mr-1 inline h-3.5 w-3.5" /> Ritmo de envio deste chip
          <HelpHint text="Em branco = usa os limites seguros sugeridos pelo sistema para a maturidade e a idade deste chip. Preencher aqui personaliza somente este chip." />
        </Label>

        <div className="mt-2">
          <span className="mb-1 block text-[11px] text-mist">Mensagens por hora</span>
          <input
            type="number"
            min={1}
            placeholder={`em branco = ${sugestaoHora}`}
            value={value.limite_hora_override ?? ""}
            onChange={(e) => onChange({
              ...value,
              limite_hora_override: e.target.value === "" ? null : Number(e.target.value),
            })}
            className="h-10 w-full rounded-xl border border-line bg-ink-900 px-3.5 font-mono text-sm text-chalk placeholder:text-mist/50 outline-none focus:border-ink-500"
          />
        </div>

        <div className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 ${estilo.cor}`}>
          <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-600">{veredicto.titulo}</div>
            <p className="mt-0.5 text-[11px] leading-snug opacity-90">{veredicto.explicacao}</p>
            {esgota && (
              <p className="mt-1 text-[11px] opacity-70">
                No ritmo de {horaEfetiva}/h, a cota de {diaEfetivo} mensagens do dia se esgota em{" "}
                <b>{formatarDuracao(esgota)}</b>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
