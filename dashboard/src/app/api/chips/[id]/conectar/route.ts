import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { criarInstancia, estadoInstancia, ligarChatwoot } from "@/lib/evolution";
import { nomeInstanciaEvolution } from "@/lib/conector";

// POST — provisiona a instância do chip na Evolution e devolve o QR para escanear.
// Idempotente: apertar de novo (o QR expira em segundos) devolve um QR novo da mesma instância.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chipId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, chipId))) return erroDono();

  const admin = supabaseAdmin();
  const { data: chip } = await admin
    .from("chips").select("id, nome, conector, papel, instancia_evolution, numero_e164")
    .eq("id", chipId).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "Chip não encontrado." }, { status: 404 });

  if (chip.conector !== "baileys") {
    return NextResponse.json(
      { erro: "Este chip não usa o canal Baileys. O canal oficial da Meta está suspenso desde 17/08/2026." },
      { status: 400 },
    );
  }
  if (chip.papel === "equipe") {
    return NextResponse.json(
      { erro: "Chip de equipe é só um número de escalação — não conecta ao sistema." },
      { status: 400 },
    );
  }

  // Chips cadastrados antes desta fatia podem não ter nome de instância ainda.
  let instancia = chip.instancia_evolution as string | null;
  if (!instancia) {
    instancia = nomeInstanciaEvolution(chip.nome as string, chipId);
    await admin.from("chips").update({ instancia_evolution: instancia }).eq("id", chipId);
  }

  const r = await criarInstancia({ instancia, numeroE164: chip.numero_e164 as string | null });
  if (!r.ok) return NextResponse.json({ erro: r.mensagem, motivo: r.motivo }, { status: 502 });

  // Liga o Chatwoot já no provisionamento: a inbox tem que existir antes da primeira resposta
  // chegar, senão a mensagem entra sem lugar para ir. Falha aqui não invalida o QR — o dono
  // conecta o número e a gente reaplica depois.
  const cw = await ligarChatwoot({ instancia, nomeInbox: chip.nome as string });

  return NextResponse.json({
    ok: true,
    instancia,
    qr: r.qr,
    pairing_code: r.pairing_code,
    ja_existia: r.ja_existia,
    chatwoot: cw.ok ? { ok: true } : { ok: false, mensagem: cw.mensagem },
  });
}

// GET — estado atual da conexão, para a tela saber se o QR já foi escaneado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chipId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, chipId))) return erroDono();

  const admin = supabaseAdmin();
  const { data: chip } = await admin
    .from("chips").select("id, instancia_evolution").eq("id", chipId).maybeSingle();
  if (!chip?.instancia_evolution) {
    return NextResponse.json({ ok: true, estado: "sem_instancia", status: "cadastrado" });
  }

  const r = await estadoInstancia(chip.instancia_evolution as string);
  if (!r.ok) return NextResponse.json({ erro: r.mensagem, motivo: r.motivo }, { status: 502 });

  // 401 = sessão revogada. Reconectar não resolve (§8 do guia do Baileys) — o chip morreu e o
  // failover precisa saber disso, então gravamos 'banido' e não 'desconectado'.
  const status = r.estado === "open"
    ? "conectado"
    : r.estado === "connecting"
    ? "cadastrado"
    : r.codigo === 401
    ? "banido"
    : "desconectado";

  await admin.from("chips").update({ status }).eq("id", chipId);

  return NextResponse.json({ ok: true, estado: r.estado, status });
}
