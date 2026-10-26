"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/primitives";
import { Resumo } from "@/components/juridico/analise";
import { cn } from "@/lib/utils";

type Linha = { id: string; nome: string; papel: string; clientes: number; acionamentos: number };

/** Metas por dia de cada pessoa (V5.6.14). 0 = sem meta. */
export function MetasEquipe({ pessoas }: { pessoas: Linha[] }) {
  return (
    <details className="group border-t border-pauta px-5 py-3">
      <Resumo>Metas por dia <span className="font-500 text-lapis">(clientes e acionamentos de cada pessoa)</span></Resumo>
      <ul className="mt-2 divide-y divide-pauta">
        {pessoas.map((p) => <LinhaMeta key={p.id} p={p} />)}
      </ul>
    </details>
  );
}

function LinhaMeta({ p }: { p: Linha }) {
  const router = useRouter();
  const [clientes, setClientes] = useState(String(p.clientes));
  const [acionamentos, setAcionamentos] = useState(String(p.acionamentos));
  const [estado, setEstado] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const mudou = clientes !== String(p.clientes) || acionamentos !== String(p.acionamentos);

  async function salvar() {
    setGravando(true); setEstado(null);
    const r = await fetch("/api/produtividade/metas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario_id: p.id, meta_clientes: Number(clientes) || 0, meta_acionamentos: Number(acionamentos) || 0 }) });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setEstado({ tipo: "erro", msg: j?.erro ?? "Não salvou." }); return; }
    setEstado({ tipo: "ok", msg: "Salvo." });
    router.refresh();
  }

  return (
    <li className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem] sm:items-end">
      <span className="min-w-0 self-center">
        <span className="block truncate font-600 text-texto">{p.nome}</span>
        <span className="block text-meta text-lapis">{p.papel}</span>
      </span>
      <label className="text-meta font-600 text-lapis">
        Clientes por dia
        <Input type="number" min={0} max={1000} inputMode="numeric" value={clientes} onChange={(e) => setClientes(e.target.value)} className="mt-1 font-mono" />
      </label>
      <label className="text-meta font-600 text-lapis">
        Acionamentos por dia
        <Input type="number" min={0} max={1000} inputMode="numeric" value={acionamentos} onChange={(e) => setAcionamentos(e.target.value)} className="mt-1 font-mono" />
      </label>
      <span className="flex items-center gap-2">
        <Button variant="outline" onClick={salvar} disabled={!mudou || gravando}>{gravando ? "Salvando…" : "Salvar"}</Button>
        {estado && <span role="status" className={cn("text-sm2 font-600", estado.tipo === "ok" ? "text-pago" : "text-margem")}>{estado.msg}</span>}
      </span>
    </li>
  );
}
