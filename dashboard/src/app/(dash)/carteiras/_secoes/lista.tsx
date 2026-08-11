import { supabaseServer } from "@/lib/supabase-server";
import { Card, Badge, Button, HelpHint } from "@/components/ui/primitives";
import { brl, num, dataBR } from "@/lib/utils";
import { FolderUp, Plus } from "lucide-react";
import Link from "next/link";
import { CarteiraAcoes } from "../acoes";

const STATUS_CARTEIRA: Record<string, { tone: any; label: string }> = {
  importando: { tone: "amber", label: "Importando" },
  ativa: { tone: "green", label: "Ativa (enviando)" },
  pausada: { tone: "neutral", label: "Pausada" },
  arquivada: { tone: "rose", label: "Arquivada" },
};

/** Aba "Carteiras" — a lista de planilhas importadas. */
export async function ListaCarteiras({ role }: { role: string }) {
  const sb = await supabaseServer();
  const ehAdmin = role === "admin";
  const podeEditar = role === "admin" || role === "cobrador";

  const { data: carteiras } = await sb.from("carteiras")
    .select("id, nome, credor, status, num_devedores, soma_saldo, criado_em, cobrador_id, credor_id")
    .order("criado_em", { ascending: false });

  // atribuição (só admin): mapa id->nome dos donos/credores
  let nomes = new Map<string, string>();
  if (ehAdmin) {
    const ids = [...new Set((carteiras ?? []).flatMap((c) => [c.cobrador_id, c.credor_id]).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: us } = await sb.from("usuarios_app").select("id, nome").in("id", ids);
      nomes = new Map((us ?? []).map((u) => [u.id, u.nome ?? "—"]));
    }
  }

  if ((carteiras ?? []).length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald/12 text-emerald"><FolderUp className="h-6 w-6" /></div>
        <div>
          <p className="font-display text-lg text-chalk">Nenhuma carteira ainda</p>
          <p className="mt-1 text-sm text-mist">
            {podeEditar ? "Crie a primeira carteira e suba uma planilha de devedores para começar." : "Ainda não há carteiras para acompanhar."}
          </p>
        </div>
        {podeEditar && <Link href="/carteiras/nova"><Button><Plus className="h-4 w-4" /> Nova carteira</Button></Link>}
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
              <th className="px-5 py-3 font-medium">Carteira</th>
              <th className="px-5 py-3 font-medium">Devedores</th>
              <th className="px-5 py-3 font-medium">Total da carteira</th>
              <th className="px-5 py-3 font-medium">Criada em</th>
              <th className="px-5 py-3 font-medium">
                <span className="inline-flex items-center gap-1">Status <HelpHint text="Importando: aguardando planilha. Pausada: importada, sem enviar. Ativa: enviando. Arquivada: histórico." /></span>
              </th>
              {ehAdmin && <th className="px-5 py-3 font-medium">Responsável</th>}
              {podeEditar && <th className="px-5 py-3 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {(carteiras ?? []).map((c) => {
              const s = STATUS_CARTEIRA[c.status] ?? STATUS_CARTEIRA.pausada;
              return (
                <tr key={c.id} className="border-b border-line/50 transition-colors hover:bg-ink-850">
                  <td className="px-5 py-3">
                    <Link href={`/carteiras/${c.id}`} className="font-medium text-chalk hover:text-emerald">{c.nome}</Link>
                    {c.credor && <div className="text-[11px] text-mist">Credor: {c.credor}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/carteiras?aba=devedores&carteira=${c.id}`} className="font-mono text-chalk tabnums hover:text-emerald">
                      {num(c.num_devedores)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-chalk tabnums">{brl(c.soma_saldo)}</td>
                  <td className="px-5 py-3 text-mist">{dataBR(c.criado_em)}</td>
                  <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                  {ehAdmin && (
                    <td className="px-5 py-3 text-xs text-mist">
                      <div>Cobrador: <span className="text-chalk">{c.cobrador_id ? (nomes.get(c.cobrador_id) ?? "—") : "—"}</span></div>
                      {c.credor_id && <div>Credor: <span className="text-chalk">{nomes.get(c.credor_id) ?? "—"}</span></div>}
                    </td>
                  )}
                  {podeEditar && <td className="px-5 py-3"><CarteiraAcoes id={c.id} nome={c.nome} status={c.status} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
