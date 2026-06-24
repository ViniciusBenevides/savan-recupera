"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Tooltip } from "@/components/ui/primitives";
import { Upload, Trash2, Loader2 } from "lucide-react";

// Ações rápidas por linha da lista de carteiras: continuar o envio e excluir.
export function CarteiraAcoes({ id, nome, status }: { id: number; nome: string; status: string }) {
  const router = useRouter();
  const [apagando, setApagando] = React.useState(false);

  async function apagar() {
    if (!confirm(`Apagar a carteira "${nome}" e todos os seus devedores? Esta ação não pode ser desfeita.`)) return;
    setApagando(true);
    const r = await fetch(`/api/carteiras/${id}`, { method: "DELETE" });
    setApagando(false);
    if (r.ok) router.refresh();
    else { const d = await r.json().catch(() => ({})); alert(d.erro ?? "Não foi possível apagar (apenas admin pode)."); }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === "importando" && (
        <Tooltip text="Retomar: enviar a planilha para concluir a criação desta carteira.">
          <Link href={`/carteiras/${id}?tab=historico`}>
            <Button size="sm" variant="outline"><Upload className="h-3.5 w-3.5" /> Continuar envio</Button>
          </Link>
        </Tooltip>
      )}
      <Tooltip text="Editar informações e configurações desta carteira.">
        <Link href={`/carteiras/${id}`}>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-mist transition-colors hover:bg-emerald/15 hover:text-emerald">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          </button>
        </Link>
      </Tooltip>
      <Tooltip text="Apagar esta carteira e todos os dados dela.">
        <button onClick={apagar} disabled={apagando}
          className="grid h-8 w-8 place-items-center rounded-lg text-mist transition-colors hover:bg-rose/15 hover:text-rose disabled:opacity-40">
          {apagando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </Tooltip>
    </div>
  );
}
