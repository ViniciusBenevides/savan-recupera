import { cn, brl } from "@/lib/utils";
import { dataCurta, diaISO } from "@/lib/datas";

export type ParcelaCarne = { id: number; numero: number; vencimento: string; valor: number; status: string; pago_em?: string | null };

// Até 10 canhotos cabem numa linha da lista de acordos; acima disso o canhoto vira número (na ficha)
// ou uma régua fina com o resumo (na lista), para nenhuma linha passar da largura da tela.
const CABEM = 10;

type Estado = "paga" | "cancelada" | "atrasada" | "vence hoje" | "a vencer";

// A tira de canhotos do acordo: cada parcela é um canhoto. Paga = riscada; atrasada = vermelho da
// margem; vence hoje = tinta; futura = neutra. Lê bem por leitor de tela (aria-label por canhoto).
export function Carne({ parcelas, total, compacto = false }: { parcelas: ParcelaCarne[]; total: number; compacto?: boolean }) {
  const hoje = diaISO();
  const itens = [...parcelas].sort((a, b) => a.numero - b.numero).map((p) => {
    const estado: Estado = p.status === "paga" ? "paga" : p.status === "cancelada" ? "cancelada"
      : p.vencimento < hoje ? "atrasada" : p.vencimento === hoje ? "vence hoje" : "a vencer";
    const nome = p.numero === 0 ? "Entrada" : `Parcela ${p.numero} de ${total}`;
    return { p, estado, nome, dica: `${nome} · ${brl(p.valor)} · ${dataCurta(p.vencimento)} · ${estado}` };
  });

  if (compacto && itens.length > CABEM) {
    const pagas = itens.filter((i) => i.estado === "paga").length;
    const atrasadas = itens.filter((i) => i.estado === "atrasada").length;
    return (
      <div className="min-w-0">
        <ol className="flex h-2.5 gap-px overflow-hidden rounded-full" aria-hidden="true">
          {itens.map(({ p, estado, dica }) => (
            <li key={p.id} title={dica} className={cn("min-w-0 flex-1", {
              paga: "bg-pago", atrasada: "bg-margem", "vence hoje": "bg-tinta", cancelada: "bg-pauta", "a vencer": "bg-pauta-forte",
            }[estado])} />
          ))}
        </ol>
        <p className="mt-1.5 text-meta text-lapis">
          <span className="font-600 text-pago">{pagas} de {itens.length} pagas</span>
          {atrasadas > 0 && <> · <span className="font-600 text-margem">{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span></>}
        </p>
      </div>
    );
  }

  const pequeno = compacto || itens.length > CABEM;
  return (
    <ol
      className={cn("grid min-w-0", pequeno ? "grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))] gap-1" : "grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1.5")}
      aria-label="Parcelas do acordo"
    >
      {itens.map(({ p, estado, nome, dica }) => {
        const paga = estado === "paga";
        const atrasada = estado === "atrasada";
        const hojeVence = estado === "vence hoje";
        return (
          <li
            key={p.id}
            title={dica}
            aria-label={`${nome}, ${brl(p.valor)}, vence ${dataCurta(p.vencimento)}, ${estado}`}
            className={cn(
              "relative flex flex-col justify-center rounded-[6px] border border-dashed",
              pequeno ? "h-8 px-1" : "min-h-[52px] px-2 py-1.5",
              paga && "border-pago/40 bg-pago-fundo",
              atrasada && "border-margem/50 bg-margem-fundo",
              hojeVence && "border-tinta bg-tinta-clara",
              estado === "cancelada" && "border-pauta bg-ink-800 opacity-60",
              estado === "a vencer" && "border-pauta-forte bg-folha",
            )}
            data-riscado={paga ? "true" : "false"}
          >
            {pequeno ? (
              <span className={cn("text-center font-mono text-[0.6875rem] tabnums", paga ? "text-pago" : atrasada ? "text-margem" : hojeVence ? "text-tinta" : "text-lapis")}>
                {p.numero === 0 ? "E" : p.numero}
              </span>
            ) : (
              <>
                <span className={cn("text-meta font-600", atrasada ? "text-margem" : hojeVence ? "text-tinta" : "text-lapis")}>
                  {p.numero === 0 ? "Entrada" : `${p.numero}/${total}`} · {dataCurta(p.vencimento)}
                </span>
                <span className={cn("font-mono text-sm2 tabnums", paga ? "text-pago" : "text-texto")}>{brl(p.valor)}</span>
              </>
            )}
            {paga && <span className="risco opacity-70" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
