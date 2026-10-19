"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";
import { simularAcordo } from "@/lib/acordo";
import { brl, cn } from "@/lib/utils";
import { diaISO, somarDias } from "@/lib/datas";

type Carteira = {
  id: number; nome: string; tipo_carteira: string; honorarios_pct: number | null; desconto_max_pct: number; parcelas_max: number;
  entrada_min_pct: number; parcela_min_valor: number; dias_sem_contato_max: number;
};

// "Regras de negociação": o Quadro Cobrança do CobCloud, curto. É o que segura o negociador dentro do
// combinado com o dono — o servidor confere de novo em cada acordo.
export function RegrasNegociacao({ carteira, podeEditar }: { carteira: Carteira; podeEditar: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({
    tipo_carteira: carteira.tipo_carteira ?? "propria",
    honorarios_pct: carteira.honorarios_pct != null ? String(carteira.honorarios_pct) : "",
    desconto_max_pct: String(carteira.desconto_max_pct ?? 60),
    parcelas_max: String(carteira.parcelas_max ?? 6),
    entrada_min_pct: String(carteira.entrada_min_pct ?? 0),
    parcela_min_valor: String(carteira.parcela_min_valor ?? 30),
    dias_sem_contato_max: String(carteira.dias_sem_contato_max ?? 15),
  });
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const n = (v: string) => Number(v.replace(",", ".")) || 0;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const exemplo = useMemo(() => {
    const lim = { desconto_max_pct: n(f.desconto_max_pct), parcelas_max: Math.max(1, n(f.parcelas_max)), entrada_min_pct: n(f.entrada_min_pct), parcela_min_valor: n(f.parcela_min_valor) };
    const vista = simularAcordo({ valor_divida: 400, desconto_pct: lim.desconto_max_pct, parcelas: 1, entrada: 0, primeiro_vencimento: diaISO(somarDias(new Date(), 3)) }, lim);
    let maxParc = lim.parcelas_max;
    while (maxParc > 1 && 400 / maxParc < lim.parcela_min_valor) maxParc--;
    return { vista: vista.valor_total, maxParc, parcela: Math.ceil((400 / maxParc) * 100) / 100 };
  }, [f]);

  async function salvar() {
    setSalvando(true); setAviso(null);
    const r = await fetch(`/api/carteiras/${carteira.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_carteira: f.tipo_carteira, honorarios_pct: f.tipo_carteira === "terceiros" && f.honorarios_pct !== "" ? n(f.honorarios_pct) : null,
        desconto_max_pct: n(f.desconto_max_pct), parcelas_max: Math.round(n(f.parcelas_max)), entrada_min_pct: n(f.entrada_min_pct),
        parcela_min_valor: n(f.parcela_min_valor), dias_sem_contato_max: Math.round(n(f.dias_sem_contato_max)),
      }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível salvar." }); return; }
    setAviso({ tipo: "ok", msg: "Regras salvas. Valem para os próximos acordos." });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <fieldset disabled={!podeEditar} className="space-y-5">
        <div>
          <p className="mb-2 text-sm2 font-600">De quem é a carteira</p>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {[["propria", "Própria — a MC CRED comprou"], ["terceiros", "De terceiros — cobra para um credor"]].map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={f.tipo_carteira === k} onClick={() => setF({ ...f, tipo_carteira: k })}
                className={cn("rounded-full border px-3.5 py-2 text-sm2 font-600", f.tipo_carteira === k ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte bg-folha text-texto hover:border-tinta/50")}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {f.tipo_carteira === "terceiros" && (
          <div className="max-w-[220px]">
            <Label htmlFor="hon">Honorários da MC CRED (%)</Label>
            <Input id="hon" inputMode="decimal" value={f.honorarios_pct} onChange={set("honorarios_pct")} />
            <p className="mt-1 text-meta text-lapis">O resto vai para o credor (aparece no Financeiro).</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="dmax" rotulo="Maior desconto que o negociador dá sozinho (%)" ajuda="Acima disso, só o dono da operação libera." valor={f.desconto_max_pct} onChange={set("desconto_max_pct")} />
          <Campo id="pmax" rotulo="Máximo de parcelas" ajuda="Sem contar a entrada." valor={f.parcelas_max} onChange={set("parcelas_max")} />
          <Campo id="emin" rotulo="Entrada mínima quando parcelado (%)" ajuda="0 = pode parcelar sem entrada." valor={f.entrada_min_pct} onChange={set("entrada_min_pct")} />
          <Campo id="pmin" rotulo="Valor mínimo da parcela (R$)" ajuda="Parcela menor que isso não grava." valor={f.parcela_min_valor} onChange={set("parcela_min_valor")} />
          <Campo id="dias" rotulo="Dias sem contato até voltar para a fila" ajuda="Quem está em negociação e some por mais que isso volta para o Trabalho de hoje." valor={f.dias_sem_contato_max} onChange={set("dias_sem_contato_max")} />
        </div>
        {aviso && <p role="status" className={cn("rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>}
        {podeEditar && <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar regras"}</Button>}
      </fieldset>
      <aside className="h-fit rounded-painel border border-pauta bg-papel p-4">
        <p className="text-sm2 font-700">Na prática</p>
        <p className="mt-2 text-[0.9375rem]">Numa dívida de <span className="font-mono tabnums">{brl(400)}</span>:</p>
        <ul className="mt-2 space-y-1.5 text-[0.9375rem]">
          <li>À vista, no máximo com {n(f.desconto_max_pct)}% de desconto: <span className="font-mono font-600 tabnums text-pago">{brl(exemplo.vista)}</span></li>
          <li>Parcelado sem desconto: até {exemplo.maxParc}x de <span className="font-mono tabnums">{brl(exemplo.parcela)}</span></li>
          <li>Sem contato há {Math.round(n(f.dias_sem_contato_max))} dias → volta para a fila do dia.</li>
        </ul>
      </aside>
    </div>
  );
}

function Campo({ id, rotulo, ajuda, valor, onChange }: { id: string; rotulo: string; ajuda: string; valor: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} inputMode="decimal" value={valor} onChange={onChange} />
      <p className="mt-1 text-meta text-lapis">{ajuda}</p>
    </div>
  );
}
