import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, podeEditarChip, erroDono } from "@/lib/auth";

// Quais chips atendem esta carteira. Sem vínculo o chip não recebe item nenhum dela — nem pelo pool
// livre nem por designação (ver `fn_selecionar_lote` na migration 20260831120000).

// GET — todos os chips de bot que o usuário pode editar, marcando quais já estão vinculados.
// Devolve a lista inteira, e não só os vinculados, porque a tela é de escolha: quem abre precisa ver
// o que existe para poder ligar.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const admin = supabaseAdmin();
  const [{ data: chips }, { data: vinculos }] = await Promise.all([
    admin.from("chips")
      .select("id, nome, numero_e164, conector, status, papel, cobrador_id")
      // chip papel='equipe' é número de escalação humana: nunca dispara, então não entra na escolha
      .neq("papel", "equipe").order("id"),
    admin.from("carteira_chips").select("chip_id").eq("carteira_id", carteiraId),
  ]);

  const ligados = new Set((vinculos ?? []).map((v) => v.chip_id));
  const visiveis = g.sessao.role === "admin"
    ? (chips ?? [])
    : (chips ?? []).filter((c) => c.cobrador_id === g.sessao.user.id);

  return NextResponse.json({
    ok: true,
    chips: visiveis.map((c) => ({
      id: c.id, nome: c.nome, numero_e164: c.numero_e164,
      conector: c.conector ?? "meta_cloud", status: c.status,
      vinculado: ligados.has(c.id),
    })),
  });
}

// PUT — define o conjunto inteiro de chips da carteira. Conjunto, e não "adiciona um": a tela mostra
// caixas de seleção e salva o estado que está na tela, então mandar o total evita a divergência
// clássica entre o que o usuário vê marcado e o que ficou gravado.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const body = await req.json().catch(() => ({}));
  const pedidos: number[] = Array.isArray(body?.chip_ids)
    ? [...new Set<number>(
        (body.chip_ids as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0),
      )]
    : [];

  // Ligar chip alheio faria o número de outro cobrador abrir conversa em nome desta operação.
  for (const chipId of pedidos) {
    if (!(await podeEditarChip(g.sessao, chipId))) return erroDono();
  }

  const admin = supabaseAdmin();
  if (pedidos.length) {
    const { data: validos } = await admin.from("chips").select("id, papel").in("id", pedidos);
    const equipe = (validos ?? []).find((c) => c.papel === "equipe");
    if (equipe) {
      return NextResponse.json(
        { erro: "Chip de equipe é número de escalação humana — ele não dispara campanha e não pode ser vinculado a uma carteira." },
        { status: 400 },
      );
    }
    if ((validos ?? []).length !== pedidos.length) {
      return NextResponse.json({ erro: "Algum chip informado não existe." }, { status: 400 });
    }
  }

  // Apaga o que saiu e insere o que entrou, em vez de limpar tudo e regravar: assim o vínculo que
  // permaneceu mantém o `criado_em`, e uma falha no meio não deixa a carteira sem chip nenhum.
  const { data: atuais } = await admin.from("carteira_chips").select("chip_id").eq("carteira_id", carteiraId);
  const antes = new Set((atuais ?? []).map((v) => v.chip_id));
  const depois = new Set(pedidos);
  const remover = [...antes].filter((c) => !depois.has(c));
  const inserir = [...depois].filter((c) => !antes.has(c));

  if (remover.length) {
    const { error } = await admin.from("carteira_chips").delete()
      .eq("carteira_id", carteiraId).in("chip_id", remover);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  if (inserir.length) {
    const { error } = await admin.from("carteira_chips")
      .insert(inserir.map((chip_id) => ({ carteira_id: carteiraId, chip_id })));
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, vinculados: pedidos.length, adicionados: inserir.length, removidos: remover.length });
}
