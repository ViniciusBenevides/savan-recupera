import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { Send, Clock, MessagesSquare, HandCoins, ArrowRight } from "lucide-react";

/**
 * Por que "Mensagens" e "Fluxo" não são a mesma coisa.
 *
 * A dúvida é justa — os dois configuram o robô. A diferença é o MOMENTO, e no backend são
 * mecanismos distintos: `templates_mensagem` alimenta os disparos ativos (campanha-lote e
 * campanha-followup, quando ninguém respondeu ainda) e o `roteiro` da carteira guia o
 * bot-turno (a conversa em si, depois que a pessoa respondeu). Este mapa deixa isso explícito
 * em vez de deixar o operador adivinhar por que existem duas telas.
 */
export function LinhaDoTempo({ destaque }: { destaque: "modelos" | "fluxo" }) {
  const etapas = [
    { icon: Send, t: "1. Abordagem", d: "A 1ª mensagem que sai para quem nunca falou com você.", tipo: "modelos" },
    { icon: Clock, t: "2. Follow-ups", d: "Até 3 reenvios para quem não respondeu.", tipo: "modelos" },
    { icon: MessagesSquare, t: "3. A conversa", d: "A partir da resposta, o robô conversa seguindo o fluxo.", tipo: "fluxo" },
    { icon: HandCoins, t: "4. Proposta e Pix", d: "Textos de proposta, Pix, confirmação e quitação.", tipo: "modelos" },
  ] as const;

  return (
    <Card className="mb-5 bg-ink-850/50">
      <p className="mb-4 text-sm text-mist">
        O robô trabalha em quatro momentos. <b className="text-chalk">Modelos de mensagem</b> são textos prontos
        que ele <b className="text-chalk">dispara</b> (ninguém respondeu ainda). O{" "}
        <b className="text-chalk">Fluxo</b> só entra em cena <b className="text-chalk">depois que a pessoa responde</b> —
        e é definido por carteira, porque cada carteira negocia diferente.
      </p>

      <div className="grid gap-2 sm:grid-cols-4">
        {etapas.map(({ icon: Icon, t, d, tipo }, i) => {
          const ativo = tipo === destaque;
          return (
            <div key={t} className="relative">
              <div className={`h-full rounded-xl border p-3 transition-colors ${
                ativo ? "border-emerald/40 bg-emerald/5" : "border-line bg-ink-900"
              }`}>
                <span className={`flex items-center gap-1.5 text-[11px] font-medium ${ativo ? "text-emerald" : "text-mist"}`}>
                  <Icon className="h-3.5 w-3.5" /> {t}
                </span>
                <p className="mt-1 text-[11px] leading-snug text-mist">{d}</p>
                <span className={`mt-2 inline-block rounded-md px-1.5 py-0.5 text-[10px] ${
                  tipo === "modelos" ? "bg-blue/12 text-blue" : "bg-violet/12 text-violet"
                }`}>
                  {tipo === "modelos" ? "modelo de mensagem" : "fluxo da carteira"}
                </span>
              </div>
              {i < etapas.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-line sm:block" />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-mist">
        {destaque === "modelos"
          ? <>Você está editando os textos dos momentos 1, 2 e 4. O momento 3 é o fluxo, que fica em{" "}
             <Link href="/carteiras" className="text-emerald hover:underline">Carteiras → abrir uma carteira → Fluxo</Link>.</>
          : <>Você está editando o momento 3.</>}
      </p>
    </Card>
  );
}
