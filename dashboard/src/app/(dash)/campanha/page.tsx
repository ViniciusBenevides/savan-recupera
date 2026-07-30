import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { FilaHoje } from "@/components/FilaHoje";
import { CampanhaControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function CampanhaPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador"].includes(sessao.role)) redirect("/");

  const { conta } = await searchParams;
  const escopo = await resolverEscopoConta(sessao, conta);
  const ehAdmin = sessao.role === "admin";

  const cfg = await getConfigEscopo(escopo.cobradorId);

  // fila do escopo: cobrador vê só as suas carteiras; admin (global) vê tudo; admin numa conta vê as do cobrador
  const admin = supabaseAdmin();
  let carteiraIds: number[] | null = null;
  if (escopo.cobradorId) {
    const { data: carts } = await admin.from("carteiras").select("id").eq("cobrador_id", escopo.cobradorId);
    carteiraIds = (carts ?? []).map((c) => c.id);
  }
  const filtro = (q: any) => (carteiraIds ? q.in("carteira_id", carteiraIds.length ? carteiraIds : [-1]) : q);
  const { count: aguardando } = await filtro(admin.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "aguardando"));
  const { count: enviados } = await filtro(admin.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "enviado"));

  // "Fila de hoje" (§33): cota do dia, ritmo e quando a janela fecha, no escopo da conta.
  const hoje = new Date().toISOString().slice(0, 10);
  const chipsQ = admin.from("chips").select("id, status, maturidade, limite_hora_override, limite_dia_override");
  const { data: chipsEscopo } = escopo.cobradorId ? await chipsQ.eq("cobrador_id", escopo.cobradorId) : await chipsQ;
  const chipsAtivos = (chipsEscopo ?? []).filter((c) => ["ativo", "aquecendo"].includes(c.status));
  const idsAtivos = chipsAtivos.map((c) => c.id);
  const { data: metrHoje } = await admin.from("chip_metricas_diarias")
    .select("chip_id, novos_contatos").eq("dia", hoje).in("chip_id", idsAtivos.length ? idsAtivos : [-1]);
  const ritmoCfg: Record<string, any> = cfg.ritmo ?? {};
  const msgsHoraTotal = chipsAtivos.reduce(
    (s, c) => s + Number(c.limite_hora_override ?? ritmoCfg?.[c.maturidade ?? "novo"]?.msgs_hora ?? 0), 0);
  const tetoHoje = chipsAtivos.reduce((s, c) => {
    const curva: any[] = cfg.aquecimento ?? [];
    const doDia = c.limite_dia_override ?? (curva.length ? Number(curva[curva.length - 1]?.limite ?? 0) : 0);
    return s + Number(doDia);
  }, 0);

  return (
    <>
      <SectionTitle title="Campanha" sub="Ligue, pause e ajuste as regras do disparo automático." />
      {ehAdmin && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}
      <div className="mb-4">
        <FilaHoje dados={{
          pendentes: aguardando ?? 0,
          enviadosHoje: (metrHoje ?? []).reduce((s, m) => s + (m.novos_contatos ?? 0), 0),
          tetoHoje,
          chipsTotal: (chipsEscopo ?? []).length,
          chipsConectados: chipsAtivos.length,
          msgsHoraTotal,
          janela: cfg.janela_envio ?? {},
        }} />
      </div>
      <CampanhaControls
        cfg={cfg}
        aguardando={aguardando ?? 0}
        enviados={enviados ?? 0}
        conta={escopo.cobradorId ? conta ?? "" : "global"}
        ehGlobal={escopo.ehGlobal}
      />
    </>
  );
}
