"use client";
import { Label, HelpHint } from "@/components/ui/primitives";
import { QrCode, BadgeCheck, AlertTriangle, Info } from "lucide-react";

export type Conector = "zapi" | "meta_cloud";

const OPCOES: { id: Conector; nome: string; desc: string; Icon: any }[] = [
  { id: "zapi", nome: "Z-API (QR Code)", desc: "Conecta lendo o QR no celular. Rápido e barato, mas é WhatsApp Web não-oficial.", Icon: QrCode },
  { id: "meta_cloud", nome: "Meta oficial (Cloud API)", desc: "API oficial do WhatsApp. Sem QR nem celular: cola as credenciais da Meta.", Icon: BadgeCheck },
];

// Seletor do CONECTOR do chip (como ele fala com o WhatsApp). Aparece só para chip de bot.
// Z-API e Meta oficial coexistem — cada chip usa um. Padrão visual do TipoChipField.
export function ConectorChipField({ value, onChange }: {
  value: Conector;
  onChange: (v: Conector) => void;
}) {
  return (
    <div>
      <Label>
        Como este número conecta
        <HelpHint text="Z-API usa o QR Code (WhatsApp Web não-oficial). Meta oficial é a API de Nuvem do WhatsApp: mais estável e com vários números, mas a 1ª mensagem a um contato novo tem que ser um modelo aprovado pela Meta e há custo por mensagem." />
      </Label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {OPCOES.map(({ id, nome, desc, Icon }) => {
          const sel = value === id;
          return (
            <button key={id} type="button" onClick={() => onChange(id)}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                sel ? "border-emerald/50 bg-emerald/8" : "border-line bg-ink-850 hover:border-ink-500"
              }`}>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sel ? "text-emerald" : "text-mist"}`} />
              <div>
                <div className="text-sm font-medium text-chalk">{nome}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-mist">{desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {value === "meta_cloud" ? (
        <div className="mt-2 flex gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Mais estável que o Z-API (não cai por "WhatsApp Web"), mas <b>não é passe livre para envio frio</b>:
            a 1ª mensagem a um número novo precisa ser um <b>modelo (template) aprovado pela Meta</b>, há
            <b> custo por mensagem</b>, e a <b>qualidade do número</b> cai se as pessoas bloquearem/denunciarem
            (você acompanha isso no painel).
          </span>
        </div>
      ) : (
        <div className="mt-2 flex gap-2 rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-[11px] leading-relaxed text-mist">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
          <span>
            Z-API conecta na hora pelo QR, mas é o protocolo não-oficial do WhatsApp Web — número novo cru
            fazendo cobrança fria tem <b className="text-chalk">risco maior de bloqueio</b>.
          </span>
        </div>
      )}
    </div>
  );
}
