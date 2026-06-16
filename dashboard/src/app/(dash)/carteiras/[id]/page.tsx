import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CarteiraPainel } from "./painel";

export const dynamic = "force-dynamic";

export default async function CarteiraPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const sb = await supabaseServer();

  const { data: carteira } = await sb.from("carteiras").select("*").eq("id", Number(id)).maybeSingle();
  if (!carteira) notFound();

  const { data: importacoes } = await sb.from("importacoes")
    .select("id, arquivo_nome, status, linhas_total, linhas_importadas, linhas_ignoradas, criado_em")
    .eq("carteira_id", Number(id)).order("criado_em", { ascending: false });

  const { data: cfgRows } = await sb.from("configuracoes").select("chave, valor")
    .in("chave", ["bot_persona", "bot_contexto", "bot_guardrails", "faixas_desconto", "validade_proposta_dias", "ia"]);
  const padrao: Record<string, any> = {};
  for (const r of cfgRows ?? []) padrao[r.chave] = r.valor;

  return (
    <>
      <Link href="/carteiras" className="mb-3 inline-flex items-center gap-1.5 text-sm text-mist hover:text-chalk">
        <ArrowLeft className="h-4 w-4" /> Carteiras
      </Link>
      <SectionTitle title={carteira.nome} sub={carteira.credor ? `Credor: ${carteira.credor}` : "Configure os envios e o robô desta carteira."} />
      <CarteiraPainel carteira={carteira} importacoes={importacoes ?? []} padrao={padrao} tabInicial={tab as any} />
    </>
  );
}
