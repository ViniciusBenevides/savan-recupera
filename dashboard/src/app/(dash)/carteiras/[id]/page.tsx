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

  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user!.id).maybeSingle();
  const podeEditar = perfil?.role === "admin" || perfil?.role === "cobrador";

  const { data: carteira } = await sb.from("carteiras").select("*").eq("id", Number(id)).maybeSingle();
  if (!carteira) notFound();

  const { data: importacoes } = await sb.from("importacoes")
    .select("id, arquivo_nome, status, linhas_total, linhas_importadas, linhas_ignoradas, criado_em")
    .eq("carteira_id", Number(id)).order("criado_em", { ascending: false });

  // padrão global do robô/asaas só é necessário para quem edita; credor/visualizador não veem chaves
  const padrao: Record<string, any> = {};
  if (podeEditar) {
    const { data: cfgRows } = await sb.from("configuracoes").select("chave, valor")
      .in("chave", ["bot_persona", "bot_contexto", "bot_guardrails", "faixas_desconto", "validade_proposta_dias", "ia", "asaas"])
      .is("cobrador_id", null);
    for (const r of cfgRows ?? []) padrao[r.chave] = r.valor;
  }

  // para credor/visualizador, remove config sensível (wallet/keys/prompt) antes de enviar ao browser
  const carteiraView = podeEditar ? carteira : {
    id: carteira.id, nome: carteira.nome, credor: carteira.credor, status: carteira.status,
    num_devedores: carteira.num_devedores, soma_saldo: carteira.soma_saldo,
  };

  return (
    <>
      <Link href="/carteiras" className="mb-3 inline-flex items-center gap-1.5 text-sm text-mist hover:text-chalk">
        <ArrowLeft className="h-4 w-4" /> Carteiras
      </Link>
      <SectionTitle title={carteira.nome} sub={carteira.credor ? `Credor: ${carteira.credor}` : "Acompanhe os envios e o robô desta carteira."} />
      <CarteiraPainel carteira={carteiraView} importacoes={importacoes ?? []} padrao={padrao} tabInicial={tab as any} podeEditar={podeEditar} />
    </>
  );
}
