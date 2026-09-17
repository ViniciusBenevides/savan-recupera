import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { conexaoBaileys } from "@/lib/chatwoot";
import { mensagemBloqueio } from "@/lib/bloqueio-whatsapp";
import { ehErroChipBloqueado, sincronizarBloqueioChip } from "@/lib/bloqueio-whatsapp-chip";
import { DIAS_REPOUSO_MAX, DIAS_REPOUSO_PADRAO, emRepouso, mensagemRepouso } from "@/lib/repouso";

// Ativa (inicia aquecimento), pausa, retoma, põe em repouso ou encerra o repouso de um chip.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  // 'ativar' | 'pausar' | 'retomar' | 'repousar' | 'encerrar_repouso'
  const { acao, dias, motivo } = await req.json();
  const admin = supabaseAdmin();
  const patch: any = {};

  if (acao === "ativar" || acao === "retomar") {
    const { data: chip } = await admin.from("chips")
      .select("id, status, saude, conector, chatwoot_inbox_id, data_ativacao, whatsapp_bloqueio_ate, repouso_ate")
      .eq("id", Number(id)).single();
    if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });

    // Bloqueio de alcance do WhatsApp (16/09/2026): ativar um chip que o WhatsApp proibiu de
    // iniciar conversa só serve para o `campanha-lote` tentar de novo — e cada tentativa conta
    // contra o número. A leitura é a mais fresca que o painel tem: a cópia do Chatwoot, com a
    // coluna do chip como reserva. O gatilho do banco garante o mesmo se alguém chegar antes.
    const doChatwoot = chip.conector === "baileys_chatwoot" && chip.chatwoot_inbox_id
      ? (await conexaoBaileys(Number(chip.chatwoot_inbox_id)))?.bloqueio ?? null
      : null;
    const bloqueio = await sincronizarBloqueioChip(admin, chip, doChatwoot);
    if (bloqueio.travado) {
      return NextResponse.json(
        { erro: mensagemBloqueio(bloqueio.ate), motivo: "chip_bloqueado_whatsapp", bloqueio_ate: bloqueio.ate },
        { status: 409 },
      );
    }
    // Repouso escolhido pelo operador: para ativar antes do fim, ele encerra o repouso primeiro —
    // dois cliques deliberados em vez de um.
    if (emRepouso(chip.repouso_ate)) {
      return NextResponse.json(
        { erro: mensagemRepouso(chip.repouso_ate), motivo: "chip_em_repouso", repouso_ate: chip.repouso_ate },
        { status: 409 },
      );
    }

    // `ativar` inicia o aquecimento a partir de hoje; `retomar` só devolve ao ar.
    patch.status = "aquecendo";
    if (acao === "ativar" && !chip.data_ativacao) patch.data_ativacao = new Date().toISOString().slice(0, 10);
    // A marca de "pausado pelo bloqueio" só faz sentido enquanto ele está pausado.
    if (chip.saude?.pausado_pelo_bloqueio) patch.saude = { ...chip.saude, pausado_pelo_bloqueio: false };
  } else if (acao === "pausar") {
    patch.status = "pausado";
  } else if (acao === "repousar") {
    // Repouso (§43): N dias sem abordagem nenhuma, com contador no card. Chip que estava abordando
    // é pausado na mesma escrita; os outros status ficam como estão (conectado continua conectado).
    const n = Number.isFinite(Number(dias)) ? Math.round(Number(dias)) : DIAS_REPOUSO_PADRAO;
    if (n < 1 || n > DIAS_REPOUSO_MAX) {
      return NextResponse.json({ erro: `O repouso vai de 1 a ${DIAS_REPOUSO_MAX} dias.` }, { status: 400 });
    }
    const { data: chip } = await admin.from("chips").select("status").eq("id", Number(id)).single();
    if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });
    const agora = new Date();
    patch.repouso_desde = agora.toISOString();
    patch.repouso_ate = new Date(agora.getTime() + n * 86_400_000).toISOString();
    patch.repouso_motivo = typeof motivo === "string" && motivo.trim() ? motivo.trim().slice(0, 300) : null;
    if (["ativo", "aquecendo"].includes(String(chip.status))) patch.status = "pausado";
  } else if (acao === "encerrar_repouso") {
    // Só tira o repouso: o chip fica no status em que está, e ativar continua sendo outro clique.
    patch.repouso_desde = null;
    patch.repouso_ate = null;
    patch.repouso_motivo = null;
  } else {
    return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });
  }

  const { error } = await admin.from("chips").update(patch).eq("id", Number(id));
  if (ehErroChipBloqueado(error)) {
    return NextResponse.json(
      { erro: error?.details || mensagemBloqueio(null), motivo: "chip_bloqueado_whatsapp" },
      { status: 409 },
    );
  }
  if (error?.message?.includes("chip_em_repouso")) {
    return NextResponse.json(
      { erro: error.details || mensagemRepouso(null), motivo: "chip_em_repouso" },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
