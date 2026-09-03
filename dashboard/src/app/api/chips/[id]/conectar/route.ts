import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { criarInstancia, estadoInstancia, ligarChatwoot } from "@/lib/evolution";
import { buscarInboxPorNome, nomeDoInbox } from "@/lib/chatwoot";
import { nomeInstanciaEvolution } from "@/lib/conector";

type Admin = ReturnType<typeof supabaseAdmin>;

/**
 * Garante que o chip conheça o id do inbox que a Evolution criou no Chatwoot.
 *
 * A Evolution cria o inbox durante o `chatwoot/set` e não devolve o id, então procuramos pelo nome.
 * Uma tentativa por chamada, de propósito: no POST o que o dono espera é o QR, e ficar tentando em
 * laço aqui gastaria segundos de um código que expira em menos de um minuto. O GET do polling
 * repete a tentativa a cada 3 segundos — se o inbox ainda não existia na primeira, existe na
 * terceira, e o chip fica curado sem ninguém apertar nada.
 */
async function garantirInbox(
  admin: Admin, chipId: number, nomeInbox: string, atual: number | null,
): Promise<number | null> {
  if (atual) return atual;
  const id = await buscarInboxPorNome(nomeInbox);
  if (!id) return null;
  await admin.from("chips").update({ chatwoot_inbox_id: id }).eq("id", chipId);
  return id;
}

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
    .from("chips").select("id, nome, conector, papel, instancia_evolution, numero_e164, chatwoot_inbox_id")
    .eq("id", chipId).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "Chip não encontrado." }, { status: 404 });

  // Estrito à Evolution: é o único provedor que este endpoint provisiona por QR. O baileys_chatwoot
  // é Baileys também, mas pareia pelo baileys-api, fora do painel — dizer "não é Baileys" ali
  // mandaria o dono procurar o problema no lugar errado.
  if (chip.conector !== "baileys") {
    return NextResponse.json(
      {
        erro: chip.conector === "baileys_chatwoot"
          ? "Este chip está no baileys-api (Chatwoot), e o pareamento por QR dele não passa pelo painel."
          : "Este chip não usa o canal Baileys. O canal oficial da Meta está suspenso desde 17/08/2026.",
      },
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
  // O inbox já vinculado manda no nome. Se o chip foi renomeado depois de conectado, usar o nome
  // novo faria a Evolution criar um inbox segundo e espelhar as conversas lá — o chip continuaria
  // apontando para o antigo e o bot ficaria surdo, sem erro nenhum na tela.
  const inboxAtual = chip.chatwoot_inbox_id as number | null;
  const nomeInbox = (inboxAtual ? await nomeDoInbox(inboxAtual) : null) ?? (chip.nome as string);

  const cw = await ligarChatwoot({ instancia, nomeInbox });
  const inboxId = cw.ok
    ? await garantirInbox(admin, chipId, nomeInbox, inboxAtual)
    : inboxAtual;

  return NextResponse.json({
    ok: true,
    instancia,
    qr: r.qr,
    pairing_code: r.pairing_code,
    ja_existia: r.ja_existia,
    inbox_id: inboxId,
    chatwoot: cw.ok ? { ok: true, inbox_id: inboxId } : { ok: false, mensagem: cw.mensagem },
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
    .from("chips").select("id, nome, status, instancia_evolution, chatwoot_inbox_id")
    .eq("id", chipId).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "Chip não encontrado." }, { status: 404 });
  if (!chip.instancia_evolution) {
    return NextResponse.json({ ok: true, estado: "sem_instancia", status: "cadastrado", inbox_id: chip.chatwoot_inbox_id ?? null });
  }

  const r = await estadoInstancia(chip.instancia_evolution as string);
  if (!r.ok) return NextResponse.json({ erro: r.mensagem, motivo: r.motivo }, { status: 502 });

  const atual = String(chip.status ?? "cadastrado");
  // Estados em que o chip está EM OPERAÇÃO. Importam duas vezes aqui: para não rebaixar um chip
  // ativo a "conectado" a cada 3 segundos de polling (ele sairia do `campanha-lote`, que só olha
  // 'ativo' e 'aquecendo'), e para saber quando uma queda é notícia.
  const operando = ["conectado", "ativo", "aquecendo", "pausado"].includes(atual);

  let status = atual;
  if (r.codigo === 401) {
    // `statusCode: 401` NO CORPO = sessão revogada pelo WhatsApp. Reconectar não resolve (§8 do
    // guia do Baileys) — o chip morreu e o failover precisa saber, então é 'banido' e não
    // 'desconectado'. Um HTTP 401 da Evolution é outra coisa e nem chega aqui: vira erro de
    // credencial do painel, sem mexer no status de ninguém.
    status = "banido";
  } else if (r.estado === "open") {
    if (!operando) status = "conectado";
  } else if (r.estado === "connecting" || r.estado === "nao_existe") {
    // Ainda pareando, ou instância que sumiu da Evolution: só é queda se ele estava operando.
    if (operando) status = "desconectado";
  } else {
    if (operando) status = "desconectado";
  }

  if (status !== atual) await admin.from("chips").update({ status }).eq("id", chipId);

  // Autocura do vínculo com o Chatwoot: o inbox nasce durante o `chatwoot/set` e pode não existir
  // ainda quando o POST respondeu. Sem esse id o chip conecta e mesmo assim não fala com ninguém.
  const inboxId = await garantirInbox(
    admin, chipId, chip.nome as string, chip.chatwoot_inbox_id as number | null,
  );

  return NextResponse.json({ ok: true, estado: r.estado, status, inbox_id: inboxId });
}
