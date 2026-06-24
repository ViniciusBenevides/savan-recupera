import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import { parsePlanilha, lerGrade, CAMPOS_OBRIGATORIOS, type Receita } from "@/lib/import/parse-planilha";
import { validarReceita } from "@/lib/import/mapear-ia";

export const runtime = "nodejs";

function pedacos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// POST (multipart): recebe o arquivo .xlsx, valida nome único, importa devedores/telefones/fila
// para a carteira. Idempotente por (carteira_id, cpf_cnpj). Devolve o relatório do import.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);

  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const user = g.sessao.user;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const admin = supabaseAdmin();
  const { data: carteira } = await admin.from("carteiras").select("id, nome").eq("id", carteiraId).maybeSingle();
  if (!carteira) return NextResponse.json({ erro: "carteira_nao_encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("arquivo");
  if (!(file instanceof File)) return NextResponse.json({ erro: "arquivo_ausente" }, { status: 400 });
  const arquivoNome = file.name;

  // receita opcional (planilha "fora do padrão" organizada pela IA, já revisada no front)
  const buf = Buffer.from(await file.arrayBuffer());
  let receita: Receita | undefined;
  const receitaForm = form.get("receita");
  if (typeof receitaForm === "string" && receitaForm.trim()) {
    try {
      const nColunas = lerGrade(buf).linhas.reduce((m, r) => Math.max(m, (r ?? []).length), 0);
      receita = validarReceita(JSON.parse(receitaForm), nColunas);
    } catch {
      return NextResponse.json({ erro: "receita_invalida" }, { status: 400 });
    }
    const faltando = CAMPOS_OBRIGATORIOS.filter((c) => !receita!.campos[c]);
    if (faltando.length) {
      return NextResponse.json({ erro: `campos_obrigatorios_ausentes: ${faltando.join(", ")}` }, { status: 400 });
    }
  }

  // trava de duplicidade: registra a importação (arquivo_nome é UNIQUE global)
  const { data: imp, error: impErr } = await admin.from("importacoes")
    .insert({ carteira_id: carteiraId, arquivo_nome: arquivoNome, status: "processando", criado_por: user.id })
    .select("id").single();
  if (impErr) {
    if (impErr.code === "23505") {
      return NextResponse.json({ erro: `Já existe uma planilha importada com o nome "${arquivoNome}". Renomeie o arquivo para subir uma nova versão.` }, { status: 409 });
    }
    return NextResponse.json({ erro: impErr.message }, { status: 400 });
  }

  try {
    const { devedores, stats, erros } = parsePlanilha(buf, receita);

    if (devedores.length === 0) {
      await admin.from("importacoes").update({
        status: "falhou", linhas_total: stats.total, erros: erros.slice(0, 200),
      }).eq("id", imp.id);
      return NextResponse.json({ erro: erros[0]?.motivo ?? "nenhuma_linha_valida", relatorio: { stats, erros } }, { status: 400 });
    }

    // 1) devedores (upsert idempotente por (carteira_id, cpf_cnpj))
    const cpfParaId = new Map<string, number>();
    for (const lote of pedacos(devedores, 500)) {
      const linhas = lote.map((d) => ({
        carteira_id: carteiraId, cpf_cnpj: d.cpf_cnpj, nome: d.nome, saldo: d.saldo,
        processo: d.processo, vencimento: d.vencimento, cidade: d.cidade, uf: d.uf,
        emails: d.emails, prioridade: d.prioridade, status_cobranca: d.status_cobranca,
      }));
      const { data, error } = await admin.from("devedores")
        .upsert(linhas, { onConflict: "carteira_id,cpf_cnpj" })
        .select("id, cpf_cnpj");
      if (error) throw new Error(`devedores: ${error.message}`);
      for (const r of data ?? []) cpfParaId.set(r.cpf_cnpj, r.id);
    }

    // 2) telefones (ignora duplicados por (devedor_id, telefone_e164))
    const telefones: any[] = [];
    for (const d of devedores) {
      const devId = cpfParaId.get(d.cpf_cnpj);
      if (!devId) continue;
      for (const t of d.telefones) {
        telefones.push({ devedor_id: devId, telefone_e164: t.telefone_e164, telefone_raw: t.telefone_raw, ordem: t.ordem, tipo: t.tipo });
      }
    }
    for (const lote of pedacos(telefones, 500)) {
      const { error } = await admin.from("telefones_devedor")
        .upsert(lote, { onConflict: "devedor_id,telefone_e164", ignoreDuplicates: true });
      if (error) throw new Error(`telefones: ${error.message}`);
    }

    // 3) fila: 1º telefone móvel por devedor — só p/ quem ainda não tem fila (idempotente)
    const devIds = [...cpfParaId.values()];
    const jaNaFila = new Set<number>();
    for (const lote of pedacos(devIds, 500)) {
      const { data } = await admin.from("fila_envios").select("devedor_id").in("devedor_id", lote);
      for (const r of data ?? []) jaNaFila.add(r.devedor_id);
    }
    // recupera os telefones inseridos (com ids) para montar a fila
    const fila: any[] = [];
    for (const lote of pedacos(devIds.filter((x) => !jaNaFila.has(x)), 500)) {
      const { data: tels } = await admin.from("telefones_devedor")
        .select("id, devedor_id, ordem, tipo").in("devedor_id", lote)
        .eq("tipo", "movel").order("ordem");
      const primeiro = new Map<number, number>();
      for (const t of tels ?? []) if (!primeiro.has(t.devedor_id)) primeiro.set(t.devedor_id, t.id);
      for (const d of devedores) {
        const devId = cpfParaId.get(d.cpf_cnpj);
        if (devId && primeiro.has(devId)) {
          fila.push({ carteira_id: carteiraId, devedor_id: devId, telefone_id: primeiro.get(devId), prioridade: d.prioridade });
        }
      }
    }
    for (const lote of pedacos(fila, 500)) {
      const { error } = await admin.from("fila_envios").insert(lote);
      if (error) throw new Error(`fila: ${error.message}`);
    }

    // 4) totais da carteira + status (pausada: importada, aguardando ativação) + importação concluída
    const { count } = await admin.from("devedores").select("id", { count: "exact", head: true }).eq("carteira_id", carteiraId);
    const somaSaldo = devedores.reduce((s, d) => s + d.saldo, 0);

    await admin.from("carteiras").update({
      num_devedores: count ?? devedores.length,
      soma_saldo: somaSaldo,
      status: "pausada",
    }).eq("id", carteiraId);

    await admin.from("importacoes").update({
      status: "concluida",
      linhas_total: stats.total,
      linhas_importadas: devedores.length,
      linhas_ignoradas: stats.total - devedores.length,
      erros: erros.slice(0, 200),
    }).eq("id", imp.id);

    return NextResponse.json({
      ok: true,
      relatorio: {
        importados: devedores.length,
        com_celular: stats.com_movel,
        sem_celular: devedores.length - stats.com_movel,
        telefones: stats.telefones,
        telefones_invalidos: stats.tel_invalidos,
        sem_cpf: stats.sem_cpf,
        cpf_duplicado: stats.dup_cpf,
        soma_saldo: somaSaldo,
        erros: erros.slice(0, 50),
      },
    });
  } catch (e: any) {
    await admin.from("importacoes").update({ status: "falhou", erros: [{ linha: 0, motivo: String(e?.message ?? e) }] }).eq("id", imp.id);
    return NextResponse.json({ erro: String(e?.message ?? e) }, { status: 500 });
  }
}
