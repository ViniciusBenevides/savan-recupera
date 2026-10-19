import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao, podeOperar } from "@/lib/auth";
import { montarFilaHoje } from "@/lib/fila-hoje";
import { porExtenso } from "@/lib/datas";
import { TrabalhoDeHoje } from "./_hoje/trabalho-de-hoje";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trabalho de hoje" };

export default async function Page() {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  // Credor só acompanha: a tela dele é o resultado, não a fila.
  if (sessao.role === "credor") redirect("/relatorios");

  const sb = await supabaseServer();
  const [fila, { data: carteiras }] = await Promise.all([
    montarFilaHoje(sb),
    sb.from("carteiras").select("nome").eq("status", "ativa").order("nome"),
  ]);

  return (
    <TrabalhoDeHoje
      fila={fila}
      dataExtenso={porExtenso()}
      carteiras={(carteiras ?? []).map((c) => c.nome)}
      podeOperar={podeOperar(sessao.role)}
    />
  );
}
