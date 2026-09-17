import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { conexaoBaileys } from "@/lib/chatwoot";
import { mensagemBloqueio } from "@/lib/bloqueio-whatsapp";
import { ehErroChipBloqueado, sincronizarBloqueioChip } from "@/lib/bloqueio-whatsapp-chip";

// Ativa (inicia aquecimento), pausa ou retoma um chip.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const { acao } = await req.json(); // 'ativar' | 'pausar' | 'retomar'
  const admin = supabaseAdmin();
  const patch: any = {};

  if (acao === "ativar" || acao === "retomar") {
    const { data: chip } = await admin.from("chips")
      .select("id, status, saude, conector, chatwoot_inbox_id, data_ativacao, whatsapp_bloqueio_ate")
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

    // `ativar` inicia o aquecimento a partir de hoje; `retomar` só devolve ao ar.
    patch.status = "aquecendo";
    if (acao === "ativar" && !chip.data_ativacao) patch.data_ativacao = new Date().toISOString().slice(0, 10);
    // A marca de "pausado pelo bloqueio" só faz sentido enquanto ele está pausado.
    if (chip.saude?.pausado_pelo_bloqueio) patch.saude = { ...chip.saude, pausado_pelo_bloqueio: false };
  } else if (acao === "pausar") {
    patch.status = "pausado";
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
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
