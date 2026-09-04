import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { criarInstancia, estadoInstancia, ligarChatwoot } from "@/lib/evolution";
import {
  abrirConexaoBaileys, buscarInboxPorNome, conexaoBaileys, criarInboxBaileys, nomeDoInbox,
} from "@/lib/chatwoot";
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

// POST — provisiona a conexão do chip no provedor dele e devolve o QR para escanear.
// Idempotente: apertar de novo (o QR expira em segundos) devolve um QR novo da mesma conexão.
// Os dois transportes Baileys entram aqui, por caminhos que não se parecem: a Evolution é
// provisionada por instância e pareada por nós; o baileys_chatwoot é pareado pelo Chatwoot, que é
// quem fala com o baileys-api.
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

  if (chip.papel === "equipe") {
    return NextResponse.json(
      { erro: "Chip de equipe é só um número de escalação — não conecta ao sistema." },
      { status: 400 },
    );
  }

  // ── baileys_chatwoot: quem pareia é o Chatwoot ────────────────────────────────────────
  // Nada aqui fala com o baileys-api. O inbox nativo é o dono da conexão: nós criamos o inbox,
  // pedimos a abertura e lemos o QR que o provedor empurrou para lá. Ver `lib/chatwoot.ts`.
  if (chip.conector === "baileys_chatwoot") {
    const numero = String(chip.numero_e164 ?? "").trim();
    if (!numero) {
      return NextResponse.json(
        { erro: "Este chip está sem número gravado, e no baileys-api o número É o endereço da conexão." },
        { status: 400 },
      );
    }

    let inboxId = chip.chatwoot_inbox_id as number | null;
    if (!inboxId) {
      const cw = await criarInboxBaileys({ chipId, nome: chip.nome as string, numeroE164: numero });
      if (!cw.ok) return NextResponse.json({ erro: `Chatwoot: ${cw.mensagem}` }, { status: 502 });
      inboxId = cw.inbox_id;
    }

    const abriu = await abrirConexaoBaileys(inboxId);
    if (!abriu.ok) return NextResponse.json({ erro: `Chatwoot: ${abriu.mensagem}`, inbox_id: inboxId }, { status: 502 });

    // O QR não nasce junto com a resposta: ele chega ao Chatwoot pelo webhook do baileys-api, um
    // instante depois. Damos alguns segundos para poupar a tela de abrir vazia — e se não vier,
    // o polling do GET traz assim que aparecer, sem ninguém apertar nada.
    let conexao = await conexaoBaileys(inboxId);
    for (let i = 0; i < 6 && !conexao?.qr && conexao?.connection !== "open"; i++) {
      await new Promise((r) => setTimeout(r, 800));
      conexao = await conexaoBaileys(inboxId);
    }

    return NextResponse.json({
      ok: true,
      conector: "baileys_chatwoot",
      qr: conexao?.qr ?? null,
      pairing_code: null,
      conexao: conexao?.connection ?? null,
      inbox_id: inboxId,
      // O baileys-api troca o QR sozinho enquanto ninguém escaneia, e o Chatwoot atualiza o
      // `qr_data_url`. Pedir outro daqui recriaria o socket e mataria o pareamento em andamento.
      auto_renova_qr: true,
      chatwoot: { ok: true, inbox_id: inboxId },
    });
  }

  // Daqui para baixo é Evolution — o outro transporte Baileys, provisionado por instância.
  if (chip.conector !== "baileys") {
    return NextResponse.json(
      { erro: "Este chip não usa um canal Baileys. O canal oficial da Meta está suspenso desde 17/08/2026." },
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
    .from("chips").select("id, nome, status, conector, instancia_evolution, chatwoot_inbox_id")
    .eq("id", chipId).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "Chip não encontrado." }, { status: 404 });

  const atualDb = String(chip.status ?? "cadastrado");
  // Estados em que o chip está EM OPERAÇÃO. Importam duas vezes: para não rebaixar um chip ativo a
  // "conectado" a cada 3 segundos de polling (ele sairia do `campanha-lote`, que só olha 'ativo' e
  // 'aquecendo'), e para saber quando uma queda é notícia.
  const emOperacao = ["conectado", "ativo", "aquecendo", "pausado"].includes(atualDb);

  // ── baileys_chatwoot: o estado do pareamento mora no inbox nativo ─────────────────────
  if (chip.conector === "baileys_chatwoot") {
    const inboxId = chip.chatwoot_inbox_id as number | null;
    if (!inboxId) {
      return NextResponse.json({ ok: true, estado: "sem_instancia", status: atualDb, inbox_id: null });
    }

    const c = await conexaoBaileys(inboxId);
    // Consulta falhou: não mexer em status nenhum. Chatwoot fora do ar não é chip caído (§36).
    if (!c) return NextResponse.json({ ok: true, estado: null, status: atualDb, inbox_id: inboxId });

    let status = atualDb;
    if (c.connection === "open") {
      if (!emOperacao) status = "conectado";
    } else if (c.connection === "close" && emOperacao) {
      status = "desconectado";
    }
    if (status !== atualDb) await admin.from("chips").update({ status }).eq("id", chipId);

    return NextResponse.json({
      ok: true,
      estado: c.connection === "open" ? "open" : c.connection,
      status,
      qr: c.qr,
      erro_conexao: c.erro,
      inbox_id: inboxId,
    });
  }

  if (!chip.instancia_evolution) {
    return NextResponse.json({ ok: true, estado: "sem_instancia", status: "cadastrado", inbox_id: chip.chatwoot_inbox_id ?? null });
  }

  const r = await estadoInstancia(chip.instancia_evolution as string);
  if (!r.ok) return NextResponse.json({ erro: r.mensagem, motivo: r.motivo }, { status: 502 });

  const atual = atualDb;
  const operando = emOperacao;

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
