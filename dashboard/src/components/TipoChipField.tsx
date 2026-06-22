"use client";
import { Label, HelpHint } from "@/components/ui/primitives";
import { CreditCard, Smartphone, RadioTower, Cloud, Info, AlertTriangle } from "lucide-react";

export type TipoChip = "fisico" | "esim" | "voip" | "virtual_api";

const TIPOS: { id: TipoChip; nome: string; desc: string; Icon: any }[] = [
  { id: "fisico",      nome: "Chip físico (SIM)", desc: "SIM tradicional de operadora, num aparelho.", Icon: CreditCard },
  { id: "esim",        nome: "eSIM (virtual)",    desc: "Chip de operadora digital, sem cartão físico.", Icon: Smartphone },
  { id: "voip",        nome: "VoIP",              desc: "Número de operadora VoIP.", Icon: RadioTower },
  { id: "virtual_api", nome: "Virtual (só API)",  desc: "Não recebe ligação/SMS. Só para API do WhatsApp.", Icon: Cloud },
];

// Seletor do TIPO de número do chip. É informativo (não muda o disparo): ajuda a
// organizar os chips e a entender o risco de bloqueio / a forma de conexão de cada um.
// Usado no cadastro (novo/flow.tsx) e na edição (chip-card.tsx). Mesmo padrão visual do
// MaturidadeField.
export function TipoChipField({ value, onChange }: {
  value: TipoChip;
  onChange: (v: TipoChip) => void;
}) {
  return (
    <div>
      <Label>
        Tipo de número
        <HelpHint text="Que tipo de linha é este chip. Não muda o disparo — serve para você organizar os chips e saber o risco de bloqueio e a forma de conexão de cada número." />
      </Label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {TIPOS.map(({ id, nome, desc, Icon }) => {
          const sel = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                sel ? "border-emerald/50 bg-emerald/8" : "border-line bg-ink-850 hover:border-ink-500"
              }`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sel ? "text-emerald" : "text-mist"}`} />
              <div>
                <div className="text-sm font-medium text-chalk">{nome}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-mist">{desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* alerta contextual conforme o tipo escolhido */}
      {value === "virtual_api" ? (
        <div className="mt-2 flex gap-2 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2.5 text-[11px] leading-relaxed text-rose">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Número virtual só-API não recebe ligação/SMS e <b>não conecta por QR Code</b> (o Z-API usa o
            protocolo do WhatsApp Web). Ele só funciona na <b>API oficial do WhatsApp (Meta Cloud API)</b>,
            que não é o conector atual — então este chip provavelmente <b>não vai conectar pelo QR</b>.
          </span>
        </div>
      ) : value === "voip" ? (
        <div className="mt-2 flex gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Números <b>VoIP</b> têm risco maior de bloqueio pelo WhatsApp. Se for usar, prefira maturidade{" "}
            <b>novo</b> com aquecimento gradual.
          </span>
        </div>
      ) : (
        <div className="mt-2 flex gap-2 rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-[11px] leading-relaxed text-mist">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
          <span>
            Chips <b className="text-chalk">físico</b> e <b className="text-chalk">eSIM</b> conectam normalmente
            pelo QR Code e têm o menor risco de bloqueio por tipo de número.
          </span>
        </div>
      )}
    </div>
  );
}
