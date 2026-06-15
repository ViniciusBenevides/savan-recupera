import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { Card, SectionTitle, Button } from "@/components/ui/primitives";
import { ChipCard } from "./chip-card";
import { Plus, Smartphone } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChipsPage() {
  const sb = await supabaseServer();
  const hoje = new Date().toISOString().slice(0, 10);
  const [{ data: chips }, { data: metr }] = await Promise.all([
    sb.from("chips").select("*").order("id"),
    sb.from("chip_metricas_diarias").select("chip_id, novos_contatos, msgs_enviadas").eq("dia", hoje),
  ]);
  const porChip: Record<number, any> = {};
  for (const m of metr ?? []) porChip[m.chip_id] = m;

  return (
    <>
      <SectionTitle
        title="Chips"
        sub="Cada chip é um número de WhatsApp conectado via Z-API."
        action={<Link href="/chips/novo"><Button><Plus className="h-4 w-4" /> Adicionar chip</Button></Link>}
      />

      {(chips ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-800 text-mist">
            <Smartphone className="h-7 w-7" />
          </span>
          <div>
            <h3 className="font-display text-lg font-600 text-chalk">Nenhum chip cadastrado</h3>
            <p className="mt-1 max-w-sm text-sm text-mist">
              Compre os números na Salvy e as instâncias na Z-API, depois cadastre aqui colando
              o instance-id e o token. Tudo já fica pronto para escanear o QR e ativar.
            </p>
          </div>
          <Link href="/chips/novo"><Button><Plus className="h-4 w-4" /> Adicionar primeiro chip</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(chips ?? []).map((c) => (
            <ChipCard key={c.id} chip={c} metrica={porChip[c.id]} />
          ))}
        </div>
      )}
    </>
  );
}
