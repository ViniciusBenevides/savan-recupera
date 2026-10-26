// O Jurídico ligado ao banco: sincroniza as fontes oficiais (texto guardado no Storage, histórico de
// versões), monta o contexto do devedor e grava a análise. As regras moram em motor.ts e fontes.ts;
// aqui só o que depende do Supabase.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sessao } from "@/lib/auth";
import { getSegredo } from "@/lib/segredos";
import { getConfigEscopo } from "@/lib/config";
import { diaISO } from "@/lib/datas";
import { FONTES_OFICIAIS, VERSAO_MOTOR, artigosAlterados, buscarFonteOficial, extrairArtigos, fontePorChave } from "@/lib/juridico/fontes";
import {
  chavesDasFontes, minutaPadrao, montarFatos, triagemDeterministica,
  type ContextoJuridico, type DocumentoJuridico, type Fundamento, type TituloJuridico, type Trecho,
} from "@/lib/juridico/motor";
import { pesquisarJurisprudencia, raciocinioJuridico, type PesquisaJurisprudencia, type PrecedenteCadastrado } from "@/lib/juridico/ia";

const BUCKET = "juridico-fontes";
const caminhoAtual = (chave: string) => `${chave}/atual.txt`;

export type EstadoFonte = { chave: string; nome: string; url: string; status: string; ok_em: string | null; alterada: boolean; resumo: string; fresca: boolean };

// "Verificada hoje" é no dia de Brasília, como na V5.
const deHoje = (iso: string | null | undefined) => !!iso && diaISO(new Date(iso)) === diaISO();

async function lerTextoAtual(adm: SupabaseClient, chave: string): Promise<string> {
  const { data } = await adm.storage.from(BUCKET).download(caminhoAtual(chave));
  return data ? await data.text() : "";
}

/**
 * Consulta as fontes oficiais e registra o resultado. Sem `forcar`, fonte já confirmada hoje é
 * pulada. O hash é do texto normalizado: o HTML do Planalto muda a cada leitura (o mesmo texto
 * vinha com bytes diferentes) e cada sincronização viraria uma "versão nova".
 */
export async function sincronizarFontes(adm: SupabaseClient, o: { chaves?: string[]; forcar?: boolean } = {}) {
  const alvo = (o.chaves?.length ? o.chaves : FONTES_OFICIAIS.map((f) => f.chave)).map(fontePorChave).filter((f): f is NonNullable<typeof f> => !!f);
  const { data: linhas } = await adm.from("juridico_fontes").select("*").in("chave", alvo.map((f) => f.chave));
  const atual = new Map((linhas ?? []).map((l) => [l.chave as string, l]));

  // Cadastro das fontes acompanha o código (nome e URL podem mudar entre versões do motor)
  await adm.from("juridico_fontes").upsert(alvo.map((f) => ({ chave: f.chave, nome: f.nome, tipo: f.tipo, nivel: f.nivel, url: f.url, critica: f.critica })), { onConflict: "chave" });

  const pendentes = alvo.filter((f) => o.forcar || !deHoje(atual.get(f.chave)?.ok_em));
  const resultados: { chave: string; ok: boolean; limitada: boolean; alterada: boolean; status: string; erro?: string }[] = [];
  for (const f of alvo.filter((x) => !pendentes.includes(x))) {
    const l = atual.get(f.chave);
    resultados.push({ chave: f.chave, ok: true, limitada: false, alterada: !!l?.alterada, status: l?.status ?? "OK" });
  }

  // Até 6 de uma vez, como na V5: o Planalto responde bem e a rota tem tempo contado.
  const fila = [...pendentes];
  const trabalhar = async () => {
    for (let f = fila.shift(); f; f = fila.shift()) {
      const r = await buscarFonteOficial(f, 15000);
      const agora = new Date().toISOString();
      const l = atual.get(f.chave);
      if (r.ok) {
        const hash = createHash("sha256").update(r.texto, "utf8").digest("hex");
        const anteriorHash: string | null = l?.sha256 ?? null;
        let alterados: string[] = [];
        if (f.acompanharMudancas && anteriorHash && anteriorHash !== hash) {
          alterados = artigosAlterados(await lerTextoAtual(adm, f.chave), r.texto);
        }
        const alterada = f.acompanharMudancas && alterados.length > 0;
        await adm.storage.from(BUCKET).upload(caminhoAtual(f.chave), r.texto, { contentType: "text/plain; charset=utf-8", upsert: true });
        if (anteriorHash !== hash) {
          const caminhoVersao = `${f.chave}/versoes/${hash.slice(0, 16)}.txt`;
          await adm.storage.from(BUCKET).upload(caminhoVersao, r.texto, { contentType: "text/plain; charset=utf-8", upsert: true });
          await adm.from("juridico_fontes_versoes").upsert({ chave: f.chave, sha256: hash, sha256_anterior: anteriorHash, snapshot_path: caminhoVersao, artigos_alterados: alterados, verificada_em: agora }, { onConflict: "chave,sha256", ignoreDuplicates: true });
        }
        await adm.from("juridico_fontes").update({
          status: alterada ? "ALTERAÇÃO DETECTADA" : "OK", http_status: r.httpStatus, sha256: hash,
          sha256_anterior: anteriorHash !== hash ? anteriorHash : l?.sha256_anterior ?? null,
          // Alerta de alteração só some quando a equipe sincroniza de novo e o texto não mudou mais
          alterada: alterada || (anteriorHash === hash && !!l?.alterada),
          artigos_alterados: alterada ? alterados.slice(0, 200) : anteriorHash === hash ? l?.artigos_alterados ?? [] : [],
          erro: null, verificada_em: agora, ok_em: agora, snapshot_path: caminhoAtual(f.chave), atualizado_em: agora,
        }).eq("chave", f.chave);
        resultados.push({ chave: f.chave, ok: true, limitada: false, alterada, status: alterada ? "ALTERAÇÃO DETECTADA" : "OK" });
      } else {
        // 401/403/429 em portal de jurisprudência é bloqueio da leitura automática, não tribunal fora do
        // ar: a pesquisa do caso continua pelo web search restrito ao domínio oficial.
        const limitada = f.tipo === "JURISPRUDENCIA" && [401, 403, 429].includes(r.httpStatus);
        const status = limitada ? "CONSULTA VIA PESQUISA" : "INDISPONÍVEL";
        await adm.from("juridico_fontes").update({
          status, http_status: r.httpStatus || null, verificada_em: agora, atualizado_em: agora,
          erro: limitada ? "O portal oficial recusou a leitura automática; a jurisprudência é consultada pela pesquisa oficial de cada caso." : r.erro,
        }).eq("chave", f.chave);
        resultados.push({ chave: f.chave, ok: false, limitada, alterada: false, status, erro: r.erro });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, pendentes.length) }, trabalhar));
  return resultados;
}

/** A legislação usada na fundamentação foi confirmada hoje? (sem isso, a aprovação fica travada) */
export async function fontesFrescas(adm: SupabaseClient, chaves: string[]): Promise<{ ok: boolean; estado: EstadoFonte[] }> {
  if (!chaves.length) return { ok: true, estado: [] };
  const { data } = await adm.from("juridico_fontes").select("chave, nome, url, status, ok_em, alterada, artigos_alterados").in("chave", chaves);
  const mapa = new Map((data ?? []).map((l) => [l.chave as string, l]));
  const estado = chaves.map((chave) => {
    const l = mapa.get(chave);
    const f = fontePorChave(chave);
    const fresca = !!l && deHoje(l.ok_em) && ["OK", "ALTERAÇÃO DETECTADA"].includes(l.status);
    return {
      chave, nome: l?.nome ?? f?.nome ?? chave, url: l?.url ?? f?.url ?? "", status: l?.status ?? "NUNCA_VERIFICADA", ok_em: l?.ok_em ?? null,
      alterada: !!l?.alterada, resumo: l?.alterada && l.artigos_alterados?.length ? `Artigos ou blocos alterados: ${(l.artigos_alterados as string[]).slice(0, 30).join(", ")}` : "",
      fresca,
    };
  });
  return { ok: estado.every((e) => e.fresca), estado };
}

/** Os artigos citados na fundamentação, no texto oficial guardado da última sincronização */
export async function materializarTrechos(adm: SupabaseClient, fundamentos: Fundamento[]): Promise<Trecho[]> {
  const trechos: Trecho[] = [];
  const vistos = new Set<string>();
  const textos = new Map<string, string>();
  for (const f of fundamentos) {
    if (!f.chave || !f.artigos?.length) continue;
    if (!textos.has(f.chave)) textos.set(f.chave, await lerTextoAtual(adm, f.chave));
    const fonte = fontePorChave(f.chave);
    for (const b of extrairArtigos(textos.get(f.chave) ?? "", f.artigos)) {
      const k = `${f.chave}|${b.artigo}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      trechos.push({ chave: f.chave, fonte: fonte?.nome ?? f.chave, url: fonte?.url ?? "", artigo: b.artigo, texto: b.texto });
    }
  }
  return trechos;
}

type DevedorJuridico = {
  id: number; nome: string; cpf_cnpj: string; saldo: number; vencimento: string | null; uf: string | null; cidade: string | null;
  status_cobranca: string; titulo_especie: string | null; titulo_emissao: string | null; prescricao_em: string | null;
  carteira_id: number | null; carteiras: { nome: string; credor: string | null; cobrador_id: string | null } | null;
};

/**
 * O caso como o motor lê. No nosso cadastro cada devedor é um título (o processo da planilha):
 * espécie, emissão e prescrição vêm da aba Jurídico da ficha; vencimento e saldo, da planilha.
 */
export async function montarContexto(adm: SupabaseClient, devedorId: number) {
  const { data: d } = await adm.from("devedores")
    .select("id, nome, cpf_cnpj, saldo, vencimento, uf, cidade, status_cobranca, titulo_especie, titulo_emissao, prescricao_em, carteira_id, carteiras(nome, credor, cobrador_id)")
    .eq("id", devedorId).maybeSingle();
  if (!d) return null;
  const dev = d as unknown as DevedorJuridico;
  const { data: docs } = await adm.from("devedor_documentos").select("id, tipo, nome, observacao, texto_extraido, arquivo_path").eq("devedor_id", devedorId).order("criado_em");

  const credor = dev.carteiras?.credor || dev.carteiras?.nome || "Credor";
  const emAberto = Number(dev.saldo) > 0 && dev.status_cobranca !== "pago";
  // A descrição vai para a IA: fica vazia de propósito, para nenhum dado pessoal sair por ela.
  const titulos: TituloJuridico[] = emAberto ? [{
    especie: dev.titulo_especie ?? "", descricao: "", origem: dev.carteiras?.nome ?? "", emissao: dev.titulo_emissao,
    vencimento: dev.vencimento, valorOriginal: Number(dev.saldo), valorAtual: Number(dev.saldo), prescricao: dev.prescricao_em, situacao: "Em cobrança",
  }] : [];
  const documentos: DocumentoJuridico[] = (docs ?? []).map((x) => ({
    id: x.id, tipo: x.tipo ?? "", nome: x.nome ?? "", observacao: x.observacao ?? "", texto: x.texto_extraido ?? "", temArquivo: !!x.arquivo_path,
  }));
  const hoje = diaISO();
  const digitos = (dev.cpf_cnpj ?? "").replace(/\D/g, "");
  const ctx: ContextoJuridico = {
    hoje,
    devedor: { id: dev.id, nome: dev.nome, documento: dev.cpf_cnpj ?? "", tipoPessoa: digitos.length === 14 ? "PJ" : "PF", uf: dev.uf, cidade: dev.cidade },
    credor: { nome: credor, uf: null },
    fatos: montarFatos({ saldo: emAberto ? Number(dev.saldo) : 0, titulos, documentos, hoje }),
    titulos,
    documentos,
  };
  return { ctx, carteiraId: dev.carteira_id, cobradorId: dev.carteiras?.cobrador_id ?? null };
}

/**
 * Cria a análise: triagem determinística → fontes do dia → trechos oficiais → (com IA) pesquisa de
 * jurisprudência em domínio oficial e raciocínio → minuta. Sem fonte fresca a IA não é chamada e a
 * análise nasce preliminar, como na V5. Toda análise nasce RASCUNHO: só o advogado aprova.
 */
export async function criarAnalise(adm: SupabaseClient, sessao: Sessao, devedorId: number, usarIA: boolean) {
  const base = await montarContexto(adm, devedorId);
  if (!base) throw new Error("devedor_nao_encontrado");
  const { ctx, carteiraId, cobradorId } = base;
  const triagem = triagemDeterministica(ctx);
  const chaves = chavesDasFontes(triagem.fundamentos);
  await sincronizarFontes(adm, { chaves });
  const frescas = await fontesFrescas(adm, chaves);
  const trechos = await materializarTrechos(adm, triagem.fundamentos);

  let pesquisa: PesquisaJurisprudencia = { ativa: false, resumo: "Pesquisa jurisprudencial não executada.", precedentes: [], fontes: [] };
  let ia: { fundamentacao: string; defesa: string; estrategia: string; minuta: string } | null = null;
  let modeloIA = "sem IA";
  if (usarIA && !frescas.ok) modeloIA = "sem IA (fontes do dia incompletas)";
  if (usarIA && frescas.ok) {
    const apiKey = await getSegredo("OPENAI_API_KEY", cobradorId ?? sessao.tenant);
    if (!apiKey) {
      pesquisa = { ...pesquisa, resumo: "Pesquisa jurisprudencial não executada: falta a chave da IA nas Configurações." };
      modeloIA = "sem IA (sem chave)";
    } else {
      const cfg = await getConfigEscopo(cobradorId ?? sessao.tenant);
      const modelo = String((cfg.ia as { modelo?: string } | undefined)?.modelo ?? "gpt-4.1-mini");
      modeloIA = modelo;
      try {
        // Pesquisa e raciocínio somam no máximo ~45 s: a rota tem 60 s na Vercel e ainda pode ter de ler
        // uma fonte oficial antes. Estourou, segue com a triagem determinística, como na V5.
        pesquisa = await pesquisarJurisprudencia({ apiKey, modelo, ctx, triagem, timeoutMs: 20_000 });
      } catch (e) {
        pesquisa = { ativa: false, resumo: `Pesquisa jurisprudencial oficial indisponível agora (${e instanceof Error ? e.name : "erro"}).`, precedentes: [], fontes: [] };
      }
      const { data: precs } = await adm.from("juridico_precedentes").select("tribunal, processo, tema, tese, nivel, publicado_em, url_oficial")
        .eq("ativo", true).order("nivel").order("publicado_em", { ascending: false, nullsFirst: false }).limit(20);
      try {
        const r = await raciocinioJuridico({ apiKey, modelo, ctx, triagem, trechos, precedentes: (precs ?? []) as PrecedenteCadastrado[], pesquisa, timeoutMs: 25_000 });
        ia = r.dados;
        modeloIA = r.modelo + (pesquisa.ativa ? " + pesquisa oficial" : "");
      } catch (e) {
        modeloIA = `erro da IA: ${e instanceof Error ? e.name : "desconhecido"}`;
      }
    }
  }

  let minuta = minutaPadrao(ctx, triagem, trechos);
  if (ia?.minuta) {
    // A IA escreve com marcadores; o nome e o documento entram aqui, sem nunca terem saído do sistema.
    minuta = "MINUTA JURÍDICA AUTOMÁTICA — MC COB\nREVISÃO E APROVAÇÃO DO ADVOGADO OBRIGATÓRIAS\n\n" + ia.minuta
      .replaceAll("[CREDOR]", ctx.credor.nome || "[CREDOR]")
      .replaceAll("[DEVEDOR]", ctx.devedor.nome || "[DEVEDOR]")
      .replaceAll("[DOCUMENTO_DEVEDOR]", ctx.devedor.documento || "[DOCUMENTO_DEVEDOR]");
  }

  const f = ctx.fatos;
  const { data, error } = await adm.from("juridico_analises").insert({
    devedor_id: devedorId, carteira_id: carteiraId, versao_motor: VERSAO_MOTOR, status: "RASCUNHO",
    saldo: f.saldo, titulos: f.titulos, primeiro_venc: f.primeiroVenc, ultimo_venc: f.ultimoVenc, anos: f.anos,
    medida: triagem.medida, alternativa: triagem.alternativa, confianca: triagem.confianca, forca_prova: triagem.forca,
    fontes_status: frescas.ok ? "FONTES OFICIAIS VERIFICADAS HOJE" : "BASE OFICIAL INCOMPLETA OU NÃO ATUALIZADA",
    fontes_verificadas_em: frescas.ok ? new Date().toISOString() : null, fontes: frescas.estado, fatos: f, sinais: triagem.sinais,
    pendencias: triagem.pendencias, riscos: triagem.riscos, fundamentos: triagem.fundamentos, jurisprudencia: pesquisa,
    fundamentacao: ia?.fundamentacao || "Triagem determinística concluída. A camada de IA jurídica não foi usada ou não respondeu; revise os fundamentos e os documentos antes de aprovar.",
    defesa: ia?.defesa || "Simulação de defesa não gerada pela IA. Conferir pagamento, novação, prescrição, inexigibilidade, excesso de cobrança e requisitos formais do título.",
    estrategia: ia?.estrategia || "Conferir as pendências documentais, validar prescrição e competência, revisar a medida sugerida e só então aprovar a minuta.",
    minuta, modelo_ia: modeloIA.slice(0, 80), criado_por: sessao.user.id, criado_por_nome: sessao.nome,
  }).select("id, medida, confianca, fontes_verificadas_em").single();
  if (error) throw new Error(error.message);
  return data;
}
