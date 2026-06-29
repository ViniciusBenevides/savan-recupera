import Link from "next/link";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { Card, SectionTitle, Button } from "@/components/ui/primitives";
import { getSessao } from "@/lib/auth";
import { ChipCard } from "./chip-card";
import { TesteCard } from "./teste-card";
import { Plus, Smartphone, Calculator } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChipsPage() {
  const sb = await supabaseServer();
  const sessao = await getSessao();
  const hoje = new Date().toISOString().slice(0, 10);
  const [{ data: chips }, { data: metr }, { data: cfgTeste }] = await Promise.all([
    sb.from("chips").select("*").order("id"),
    sb.from("chip_metricas_diarias").select("chip_id, novos_contatos, msgs_enviadas").eq("dia", hoje),
    sb.from("configuracoes").select("valor").eq("chave", "numero_teste").is("cobrador_id", null).maybeSingle(),
  ]);
  const porChip: Record<number, any> = {};
  for (const m of metr ?? []) porChip[m.chip_id] = m;

  // admin vê de quem é cada chip (separação): mapa cobrador_id -> nome
  const donoPorChip: Record<number, string | null> = {};
  if (sessao?.role === "admin") {
    const { data: us } = await supabaseAdmin().from("usuarios_app").select("id, nome, email");
    const nomeDe = new Map((us ?? []).map((u) => [u.id, u.nome || u.email]));
    for (const c of chips ?? []) donoPorChip[c.id] = c.cobrador_id ? (nomeDe.get(c.cobrador_id) ?? "—") : null;
  }
  // numero_teste: formato novo {numeros:[{e164,label,ativo}]} com compat do antigo {e164,ativo}
  const ntRaw = (cfgTeste?.valor as any) ?? {};
  const numerosTeste: { e164: string; label: string; ativo: boolean }[] = Array.isArray(ntRaw.numeros)
    ? ntRaw.numeros
    : ntRaw.e164
      ? [{ e164: ntRaw.e164, label: "Principal", ativo: ntRaw.ativo ?? false }]
      : [];

  return (
    <>
      <SectionTitle
        title="Chips"
        sub="Cada chip é um número de WhatsApp — conectado via Z-API (QR) ou pela API oficial da Meta."
        action={
          <div className="flex gap-2">
            <Link href="/chips/custos"><Button variant="outline"><Calculator className="h-4 w-4" /> Custos</Button></Link>
            <Link href="/chips/novo"><Button><Plus className="h-4 w-4" /> Adicionar chip</Button></Link>
          </div>
        }
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(chips ?? []).map((c) => (
              <ChipCard key={c.id} chip={c} metrica={porChip[c.id]} donoNome={donoPorChip[c.id]} />
            ))}
          </div>
          <div className="mt-4">
            <TesteCard numerosIniciais={numerosTeste} chips={chips ?? []} />
          </div>
        </>
      )}
    </>
  );
}
