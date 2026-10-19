"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { simularAcordo, type LimitesCarteira } from "@/lib/acordo";
import { brl, cn } from "@/lib/utils";
import { dataCurta, diaISO, somarDias } from "@/lib/datas";

// A calculadora do MC COB, sem as contas de juros que ninguém usava: parte da proposta à vista,
// o negociador mexe em desconto, entrada e parcelas, e a tela mostra o carnê na hora. Os limites
// da carteira valem aqui e de novo no servidor.
export function FazerAcordo({
  devedorId, divida, descontoSugerido, limites, papel, onFeito,
}: {
  devedorId: number;
  divida: number;
  descontoSugerido: number;
  limites: LimitesCarteira;
  papel: string;
  onFeito?: () => void;
}) {
  const router = useRouter();
  const [desconto, setDesconto] = useState(String(Math.min(descontoSugerido, limites.desconto_max_pct)));
  const [parcelas, setParcelas] = useState("1");
  const [entrada, setEntrada] = useState("");
  const [primeiro, setPrimeiro] = useState(diaISO(somarDias(new Date(), 3)));
  const [forma, setForma] = useState("pix");
  const [obs, setObs] = useState("");
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sim = useMemo(() => simularAcordo({
    valor_divida: divida, desconto_pct: Number(desconto.replace(",", ".")) || 0, parcelas: Number(parcelas) || 1,
    entrada: Number(entrada.replace(",", ".")) || 0, primeiro_vencimento: primeiro,
  }, limites), [divida, desconto, parcelas, entrada, primeiro, limites]);

  const bloqueadoNegociador = sim.precisa_liberacao && papel === "negociador";

  async function gravar() {
    setGravando(true); setErro(null);
    const r = await fetch("/api/acordos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        devedor_id: devedorId, desconto_pct: Number(desconto.replace(",", ".")) || 0, parcelas: Number(parcelas) || 1,
        entrada: Number(entrada.replace(",", ".")) || 0, primeiro_vencimento: primeiro, forma_pagamento: forma, observacao: obs || null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setErro(j?.erro ?? "Não foi possível gravar o acordo."); return; }
    onFeito?.();
    router.refresh();
  }

  const opcoesParcelas = Array.from({ length: limites.parcelas_max }, (_, i) => i + 1);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="desc">Desconto (%)</Label>
            <Input id="desc" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            <p className={cn("mt-1 text-meta", sim.precisa_liberacao ? "text-margem" : "text-lapis")}>
              Limite da carteira: {limites.desconto_max_pct}%
            </p>
          </div>
          <div>
            <Label htmlFor="parc">Parcelas</Label>
            <Select id="parc" value={parcelas} onChange={(e) => setParcelas(e.target.value)}>
              {opcoesParcelas.map((n) => <option key={n} value={n}>{n === 1 ? "À vista (1x)" : `${n}x`}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ent">Entrada (R$)</Label>
            <Input id="ent" inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="sem entrada" />
            {limites.entrada_min_pct > 0 && <p className="mt-1 text-meta text-lapis">Mínimo {limites.entrada_min_pct}% quando parcelado</p>}
          </div>
          <div>
            <Label htmlFor="venc">1º pagamento</Label>
            <Input id="venc" type="date" value={primeiro} min={diaISO()} onChange={(e) => setPrimeiro(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="forma">Como vai pagar</Label>
            <Select id="forma" value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="pix">Pix</option>
              <option value="loja">Na loja</option>
              <option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option>
            </Select>
          </div>
          <div className="col-span-2">
            <Label htmlFor="obs-ac">Observação <span className="font-500 text-lapis">(opcional)</span></Label>
            <Textarea id="obs-ac" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: paga sempre depois do dia 5" />
          </div>
        </div>
      </div>

      <div className="rounded-painel border border-pauta bg-papel p-4">
        <p className="text-sm2 text-lapis">Dívida de {brl(divida)}</p>
        <p className="mt-1 text-titulo font-700">
          {sim.parcelas.length <= 1
            ? <>À vista: <span className="font-mono tabnums">{brl(sim.valor_total)}</span></>
            : <>{sim.entrada > 0 && <><span className="font-mono tabnums">{brl(sim.entrada)}</span> + </>}{Number(parcelas)}x de <span className="font-mono tabnums">{brl(sim.valor_parcela)}</span></>}
        </p>
        <p className="text-sm2 text-lapis">Total do acordo {brl(sim.valor_total)} · economia de {brl(divida - sim.valor_total)}</p>
        <ul className="mt-3 divide-y divide-pauta border-y border-pauta">
          {sim.parcelas.map((p) => (
            <li key={p.numero} className="flex items-center justify-between py-1.5 text-[0.9375rem]">
              <span>{p.numero === 0 ? "Entrada" : `Parcela ${p.numero}`} <span className="font-mono text-sm2 text-lapis">· {dataCurta(p.vencimento)}</span></span>
              <span className="font-mono tabnums">{brl(p.valor)}</span>
            </li>
          ))}
        </ul>
        {sim.problemas.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm2 text-margem">{sim.problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {sim.precisa_liberacao && (
          <p className="mt-3 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">
            {bloqueadoNegociador
              ? "O desconto passou do limite da carteira. Só o dono da operação pode liberar."
              : "O desconto passou do limite da carteira. Ao gravar, o acordo fica registrado como liberado por você."}
          </p>
        )}
        {erro && <p role="alert" className="mt-3 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">{erro}</p>}
        <Button size="lg" className="mt-4 w-full" onClick={gravar} disabled={gravando || sim.problemas.length > 0 || bloqueadoNegociador}>
          {gravando ? "Gravando…" : "Fechar acordo"}
        </Button>
        <p className="mt-2 text-meta text-lapis">As parcelas entram na Agenda e voltam para o Trabalho de hoje na véspera e no dia.</p>
      </div>
    </div>
  );
}
