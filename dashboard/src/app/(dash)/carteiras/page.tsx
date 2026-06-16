import { supabaseServer } from "@/lib/supabase-server";
import { Card, SectionTitle, Badge, Button, HelpHint } from "@/components/ui/primitives";
import { brl, num, dataBR } from "@/lib/utils";
import { FolderUp, Plus } from "lucide-react";
import Link from "next/link";
import { CarteiraAcoes } from "./acoes";

export const dynamic = "force-dynamic";

const STATUS_CARTEIRA: Record<string, { tone: any; label: string; ajuda: string }> = {
  importando: { tone: "amber", label: "Importando", ajuda: "Carteira criada, aguardando o envio da planilha. Não dispara mensagens." },
  ativa: { tone: "green", label: "Ativa (enviando)", ajuda: "O robô está enviando mensagens para os devedores desta carteira (respeitando a janela e os limites)." },
  pausada: { tone: "neutral", label: "Pausada", ajuda: "Importada, mas sem disparar. Ative quando quiser começar os envios." },
  arquivada: { tone: "rose", label: "Arquivada", ajuda: "Guardada como histórico. Não dispara e não aparece nas campanhas." },
};

export default async function CarteirasPage() {
  const sb = await supabaseServer();
  const { data: carteiras } = await sb.from("carteiras")
    .select("id, nome, credor, status, num_devedores, soma_saldo, criado_em")
    .order("criado_em", { ascending: false });

  return (
    <>
      <SectionTitle
        title="Carteiras"
        sub="Cada planilha que você sobe vira uma carteira de cobrança independente."
        action={
          <Link href="/carteiras/nova">
            <Button><Plus className="h-4 w-4" /> Nova carteira</Button>
          </Link>
        }
      />

      {(carteiras ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald/12 text-emerald"><FolderUp className="h-6 w-6" /></div>
          <div>
            <p className="font-display text-lg text-chalk">Nenhuma carteira ainda</p>
            <p className="mt-1 text-sm text-mist">Crie a primeira carteira e suba uma planilha de devedores para começar.</p>
          </div>
          <Link href="/carteiras/nova"><Button><Plus className="h-4 w-4" /> Nova carteira</Button></Link>
        </Card>
      ) : (
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
                  <th className="px-5 py-3 text-right font-medium">Ações</th>
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
                      <td className="px-5 py-3 font-mono text-chalk tabnums">{num(c.num_devedores)}</td>
                      <td className="px-5 py-3 font-mono text-chalk tabnums">{brl(c.soma_saldo)}</td>
                      <td className="px-5 py-3 text-mist">{dataBR(c.criado_em)}</td>
                      <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td className="px-5 py-3"><CarteiraAcoes id={c.id} nome={c.nome} status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
