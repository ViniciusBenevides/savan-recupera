import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import { parsePlanilha, lerGrade, CAMPOS_OBRIGATORIOS, type Receita, type DevedorRec } from "@/lib/import/parse-planilha";
import { validarReceita } from "@/lib/import/mapear-ia";

export const runtime = "nodejs";
const BUCKET_IMPORTACOES = "importacoes-carteiras";

function pedacos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// POST (multipart): recebe o arquivo .xlsx, valida nome único, importa devedores/telefones/fila
// para a carteira. Idempotente por (carteira_id, cpf_cnpj). Devolve o relatório do import.
// Com modo=enriquecer (V5.6.16), só acrescenta contatos de quem já existe: ver enriquecer().
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
  const modo = form.get("modo") === "enriquecer" ? "enriquecer" : "carga";

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
  const { data: impCriada, error: impErr } = await admin.from("importacoes")
    .insert({ carteira_id: carteiraId, arquivo_nome: arquivoNome, status: "processando", criado_por: user.id, modo })
    .select("id").single();
  let imp = impCriada;
  if (impErr) {
    if (impErr.code === "23505") {
      const { data: antiga } = await admin.from("importacoes")
        .select("id, carteira_id, arquivo_path")
        .eq("arquivo_nome", arquivoNome)
        .maybeSingle();
      if (antiga?.carteira_id === carteiraId && !antiga.arquivo_path) {
        imp = { id: antiga.id };
        await admin.from("importacoes").update({ status: "processando" }).eq("id", antiga.id);
      } else {
        return NextResponse.json({ erro: `Já existe uma planilha importada com o nome "${arquivoNome}". Renomeie o arquivo para subir uma nova versão.` }, { status: 409 });
      }
    } else {
      return NextResponse.json({ erro: impErr.message }, { status: 400 });
    }
  }
  if (!imp) return NextResponse.json({ erro: "nao_foi_possivel_registrar_importacao" }, { status: 500 });

  try {
    const nomeSeguro = arquivoNome.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "planilha.xlsx";
    const arquivoPath = `${carteiraId}/${imp.id}/${nomeSeguro}`;
    const mime = file.type || "application/octet-stream";
    const { error: storageError } = await admin.storage.from(BUCKET_IMPORTACOES).upload(arquivoPath, buf, {
      contentType: mime,
      upsert: false,
    });
    if (storageError) throw new Error(`arquivo_original: ${storageError.message}`);
    await admin.from("importacoes").update({
      arquivo_path: arquivoPath,
      arquivo_tamanho: file.size,
      arquivo_mime: mime,
    }).eq("id", imp.id);

    const { devedores: lidos, stats, erros } = parsePlanilha(buf, receita);

    if (modo === "enriquecer") {
      const resumo = await enriquecer(admin, carteiraId, lidos);
      await admin.from("importacoes").update({
        status: "concluida", linhas_total: stats.total, linhas_importadas: resumo.localizados,
        linhas_ignoradas: stats.total - resumo.localizados, erros: erros.slice(0, 200), resumo,
      }).eq("id", imp.id);
      return NextResponse.json({ ok: true, modo, relatorio: { ...resumo, erros: erros.slice(0, 50) } });
    }

    // Quem foi inativado pelo administrador não volta para a operação por uma planilha nova
    const inativos = new Set<string>();
    for (const lote of pedacos(lidos.map((d) => d.cpf_cnpj), 500)) {
      const { data } = await admin.from("devedores").select("cpf_cnpj").eq("carteira_id", carteiraId).in("cpf_cnpj", lote).not("inativo_em", "is", null);
      for (const r of data ?? []) inativos.add(r.cpf_cnpj);
    }
    const devedores = lidos.filter((d) => !inativos.has(d.cpf_cnpj));

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
        inativos_ignorados: inativos.size,
        soma_saldo: somaSaldo,
        erros: erros.slice(0, 50),
      },
    });
  } catch (e: any) {
    await admin.from("importacoes").update({ status: "falhou", erros: [{ linha: 0, motivo: String(e?.message ?? e) }] }).eq("id", imp.id);
    return NextResponse.json({ erro: String(e?.message ?? e) }, { status: 500 });
  }
}

/**
 * "Somente enriquecer clientes existentes" (V5.6.16). Processo e CPF/CNPJ servem só para achar a
 * ficha que já está nesta carteira; entram apenas os telefones, e-mails e cidade/UF que faltam.
 * Nunca cria devedor, nunca mexe em saldo, vencimento, situação ou fila do robô. Telefone que a
 * equipe excluiu continua excluído (o par devedor+número já existe e é ignorado).
 */
async function enriquecer(admin: ReturnType<typeof supabaseAdmin>, carteiraId: number, lidos: DevedorRec[]) {
  type Existente = { id: number; processo: string | null; cpf_cnpj: string; emails: string[] | null; cidade: string | null; uf: string | null };
  const porProcesso = new Map<string, Existente>();
  const porCpf = new Map<string, Existente>();
  const processos = lidos.map((d) => d.processo).filter((p): p is string => !!p);
  const cpfs = lidos.map((d) => d.cpf_cnpj).filter((c) => c && c !== "00000000000");
  for (const lote of pedacos(processos, 300)) {
    const { data } = await admin.from("devedores").select("id, processo, cpf_cnpj, emails, cidade, uf").eq("carteira_id", carteiraId).in("processo", lote);
    for (const r of (data ?? []) as Existente[]) if (r.processo) porProcesso.set(r.processo, r);
  }
  for (const lote of pedacos(cpfs, 300)) {
    const { data } = await admin.from("devedores").select("id, processo, cpf_cnpj, emails, cidade, uf").eq("carteira_id", carteiraId).in("cpf_cnpj", lote);
    for (const r of (data ?? []) as Existente[]) porCpf.set(r.cpf_cnpj, r);
  }

  const achados = new Map<number, { dev: Existente; linhas: DevedorRec[] }>();
  let naoLocalizados = 0;
  for (const d of lidos) {
    const dev = (d.processo && porProcesso.get(d.processo)) || porCpf.get(d.cpf_cnpj);
    if (!dev) { naoLocalizados++; continue; }
    const a = achados.get(dev.id) ?? { dev, linhas: [] };
    a.linhas.push(d);
    achados.set(dev.id, a);
  }

  // Telefones que já existem (inclusive os excluídos) e a última ordem de cada devedor
  const ids = [...achados.keys()];
  const jaTem = new Set<string>();
  const ultimaOrdem = new Map<number, number>();
  for (const lote of pedacos(ids, 300)) {
    const { data } = await admin.from("telefones_devedor").select("devedor_id, telefone_e164, ordem").in("devedor_id", lote);
    for (const t of data ?? []) {
      jaTem.add(`${t.devedor_id}|${t.telefone_e164}`);
      ultimaOrdem.set(t.devedor_id, Math.max(ultimaOrdem.get(t.devedor_id) ?? 0, t.ordem ?? 0));
    }
  }

  const novosTelefones: { devedor_id: number; telefone_e164: string; telefone_raw: string; ordem: number; tipo: string }[] = [];
  let emails = 0, enderecos = 0, fichas = 0;
  for (const { dev, linhas } of achados.values()) {
    let mexeu = false;
    for (const l of linhas) {
      for (const t of l.telefones) {
        const k = `${dev.id}|${t.telefone_e164}`;
        if (jaTem.has(k)) continue;
        jaTem.add(k);
        const ordem = (ultimaOrdem.get(dev.id) ?? 0) + 1;
        ultimaOrdem.set(dev.id, ordem);
        novosTelefones.push({ devedor_id: dev.id, telefone_e164: t.telefone_e164, telefone_raw: t.telefone_raw, ordem, tipo: t.tipo });
        mexeu = true;
      }
    }
    const atuais = new Set((dev.emails ?? []).map((e) => e.toLowerCase()));
    const somar = linhas.flatMap((l) => l.emails ?? []).filter((e) => {
      const k = e.toLowerCase();
      if (atuais.has(k)) return false;
      atuais.add(k);
      return true;
    });
    const patch: Record<string, unknown> = {};
    if (somar.length) { patch.emails = [...(dev.emails ?? []), ...somar]; emails += somar.length; }
    const cidade = linhas.find((l) => l.cidade)?.cidade;
    const uf = linhas.find((l) => l.uf)?.uf;
    if (!dev.cidade && cidade) patch.cidade = cidade;
    if (!dev.uf && uf) patch.uf = uf;
    if (patch.cidade || patch.uf) enderecos++;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("devedores").update(patch).eq("id", dev.id);
      if (error) throw new Error(`devedores: ${error.message}`);
      mexeu = true;
    }
    if (mexeu) fichas++;
  }
  for (const lote of pedacos(novosTelefones, 500)) {
    const { error } = await admin.from("telefones_devedor").upsert(lote, { onConflict: "devedor_id,telefone_e164", ignoreDuplicates: true });
    if (error) throw new Error(`telefones: ${error.message}`);
  }
  return {
    localizados: achados.size, nao_localizados: naoLocalizados, fichas_enriquecidas: fichas,
    telefones_novos: novosTelefones.length, emails_novos: emails, enderecos_preenchidos: enderecos,
  };
}
