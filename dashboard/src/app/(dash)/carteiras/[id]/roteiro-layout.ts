// Conversão entre o fluxo salvo (etapas + casos) e o grafo do canvas (nós + arestas), §33.1/§35.
//
// O formato do banco continua sendo o que as Edge Functions leem — o canvas é só a forma de editar.
// As posições viajam junto em `etapas[].pos`; campos extras são ignorados, então dá para guardar o
// layout sem tocar no contrato.
//
// Desde a §35 o fluxo cobre a linha do tempo inteira, não só a conversa:
//   disparo       → a 1ª mensagem (texto fixo, campanha-lote)
//   followup      → reenvios para quem não respondeu, na ordem (campanha-followup)
//   conversa      → as etapas guiadas por IA depois da resposta (bot-turno)
//   pos_pagamento → o que sai quando o Pix é confirmado (webhook-asaas)
// Blocos de mensagem carregam TEXTO PRONTO (`textos`, sorteado entre as variações); blocos de
// conversa carregam INSTRUÇÃO para o modelo. É a diferença que fazia existirem duas telas.

export type TipoEtapa = "disparo" | "followup" | "conversa" | "pos_pagamento";
export type CasoRoteiro = { quando: string; vai_para: string };
export type EtapaRoteiro = {
  id: string;
  tipo?: TipoEtapa;          // ausente = "conversa" (formato anterior à §35)
  objetivo?: string;
  instrucao?: string;        // blocos de conversa
  textos?: string[];         // blocos de mensagem (variações sorteadas)
  espera_horas?: number;     // follow-up: tempo desde a última mensagem
  casos?: CasoRoteiro[];
  pos?: { x: number; y: number };
};
export type Roteiro = { ativo?: boolean; etapas: EtapaRoteiro[] };
export type ProblemaRoteiro = { mensagem: string; etapaId?: string };
export type ResultadoImportacaoRoteiro =
  | { ok: true; roteiro: Roteiro }
  | { ok: false; erro: string };

export const FORMATO_TRANSFERENCIA_ROTEIRO = "savan-recupera/carteira-fluxo@1";

export const LARGURA_NO = 260;
const GAP_X = 340;
const GAP_Y = 190;
const COLUNA_MENSAGENS = -GAP_X * 2;

export const tipoDe = (e: EtapaRoteiro): TipoEtapa => e.tipo ?? "conversa";
export const ehMensagem = (e: EtapaRoteiro): boolean => tipoDe(e) !== "conversa";

export const ROTULO: Record<TipoEtapa, string> = {
  disparo: "Disparo",
  followup: "Follow-up",
  conversa: "Conversa",
  pos_pagamento: "Pós-pagamento",
};

/** Follow-ups na ordem em que o backend os usa (1º, 2º, 3º reenvio). */
export const followups = (etapas: EtapaRoteiro[]): EtapaRoteiro[] =>
  etapas.filter((e) => tipoDe(e) === "followup");

/**
 * Onde a conversa começa quando a pessoa responde: o destino do caminho "respondeu" do disparo,
 * ou a primeira etapa de conversa. Mesma regra do `bot-turno` — se as duas divergissem, o desenho
 * mentiria sobre o que o robô faz.
 */
export function etapaDeEntrada(etapas: EtapaRoteiro[]): string | null {
  const disparo = etapas.find((e) => tipoDe(e) === "disparo");
  const alvo = (disparo?.casos ?? []).find((c) => c.vai_para)?.vai_para;
  if (alvo && etapas.some((e) => e.id === alvo)) return alvo;
  return etapas.find((e) => tipoDe(e) === "conversa")?.id ?? null;
}

/**
 * Arestas que o desenho mostra mas o JSON não guarda: a corrente disparo → follow-up 1 → 2 → 3 é
 * a ORDEM dos blocos, não um caminho editável. Guardar isso em `casos` deixaria montar um grafo que
 * o backend não sabe executar (follow-up voltando para o disparo, por exemplo).
 */
export function cadeiaDeDisparo(etapas: EtapaRoteiro[]): { origem: string; destino: string; rotulo: string }[] {
  const disparo = etapas.find((e) => tipoDe(e) === "disparo");
  const fus = followups(etapas);
  const encadeados = [...(disparo ? [disparo] : []), ...fus];
  const arestas: { origem: string; destino: string; rotulo: string }[] = [];
  for (let i = 0; i < encadeados.length - 1; i++) {
    const prox = encadeados[i + 1];
    arestas.push({
      origem: encadeados[i].id,
      destino: prox.id,
      rotulo: `sem resposta · ${prox.espera_horas ?? 24}h`,
    });
  }
  // responder a um follow-up cai na mesma entrada do disparo; a aresta não é desenhada para não
  // encher o canvas de linhas paralelas chegando no mesmo nó
  return arestas;
}

/**
 * Auto-layout em camadas (BFS a partir da etapa de entrada). Só é usado quando a etapa ainda não tem
 * posição salva — quem já arrastou mantém o desenho. Blocos de mensagem ficam numa coluna à
 * esquerda, antes da conversa, porque é essa a ordem no tempo.
 */
export function calcularPosicoes(etapas: EtapaRoteiro[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  if (etapas.length === 0) return pos;

  const disparo = etapas.filter((e) => tipoDe(e) === "disparo");
  const fus = followups(etapas);
  [...disparo, ...fus].forEach((e, i) => { pos[e.id] = { x: COLUNA_MENSAGENS, y: i * GAP_Y }; });

  const conversas = etapas.filter((e) => tipoDe(e) === "conversa");
  const porId = new Map(conversas.map((e) => [e.id, e]));
  const raiz = etapaDeEntrada(etapas) ?? conversas[0]?.id;
  const nivel = new Map<string, number>();
  const fila: string[] = [];
  if (raiz && porId.has(raiz)) { nivel.set(raiz, 0); fila.push(raiz); }

  while (fila.length) {
    const id = fila.shift()!;
    const n = nivel.get(id)!;
    for (const c of porId.get(id)?.casos ?? []) {
      if (!c.vai_para || nivel.has(c.vai_para) || !porId.has(c.vai_para)) continue;
      nivel.set(c.vai_para, n + 1);
      fila.push(c.vai_para);
    }
  }
  // etapas órfãs (ninguém aponta para elas) vão para a última coluna
  const maxNivel = Math.max(0, ...[...nivel.values()]);
  for (const e of conversas) if (!nivel.has(e.id)) nivel.set(e.id, maxNivel + 1);

  const usadosPorNivel: Record<number, number> = {};
  for (const e of conversas) {
    const n = nivel.get(e.id) ?? 0;
    const linha = usadosPorNivel[n] ?? 0;
    usadosPorNivel[n] = linha + 1;
    pos[e.id] = { x: n * GAP_X, y: linha * GAP_Y };
  }

  // pós-pagamento fica depois de tudo, na direita
  const colunaFinal = (Math.max(0, ...nivel.values()) + 1) * GAP_X;
  etapas.filter((e) => tipoDe(e) === "pos_pagamento")
    .forEach((e, i) => { pos[e.id] = { x: colunaFinal, y: i * GAP_Y }; });

  return pos;
}

/** Nome único a partir de um rótulo digitado ("Confirmar identidade" -> "confirmar_identidade"). */
export function idUnico(base: string, existentes: string[]): string {
  const limpo = (base || "etapa")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "etapa";
  if (!existentes.includes(limpo)) return limpo;
  let i = 2;
  while (existentes.includes(`${limpo}_${i}`)) i++;
  return `${limpo}_${i}`;
}

/** Texto vazio conta como inexistente — bloco de mensagem sem texto não envia nada. */
const textosValidos = (e: EtapaRoteiro): string[] => (e.textos ?? []).map((t) => t.trim()).filter(Boolean);

/** Problemas que impedem salvar — com o bloco de origem para a UI poder levá-lo até lá. */
export function diagnosticar(etapas: EtapaRoteiro[]): ProblemaRoteiro[] {
  const problemas: ProblemaRoteiro[] = [];
  const ids = etapas.map((e) => e.id);
  const repetidos = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  for (const id of repetidos) {
    problemas.push({ mensagem: `O nome “${id}” está repetido.`, etapaId: id });
  }
  if (etapas.some((e) => !e.id?.trim())) problemas.push({ mensagem: "Há um bloco sem nome." });

  const quebrados = etapas.flatMap((e) =>
    (e.casos ?? [])
      .filter((c) => c.vai_para && !ids.includes(c.vai_para))
      .map((c) => ({ mensagem: `O caminho “${e.id} → ${c.vai_para}” aponta para um bloco inexistente.`, etapaId: e.id })));
  problemas.push(...quebrados);

  for (const etapa of etapas) {
    for (const [indice, caso] of (etapa.casos ?? []).entries()) {
      if (!caso.quando.trim()) {
        problemas.push({ mensagem: `O caminho ${indice + 1} de “${etapa.id}” precisa dizer quando deve ser seguido.`, etapaId: etapa.id });
      }
      if (!caso.vai_para.trim()) {
        problemas.push({ mensagem: `O caminho ${indice + 1} de “${etapa.id}” ainda não tem um bloco de destino.`, etapaId: etapa.id });
      }
    }
  }

  for (const etapa of etapas.filter((e) => tipoDe(e) === "conversa" && !(e.instrucao ?? "").trim())) {
    problemas.push({ mensagem: `O bloco “${etapa.id}” está sem instrução para a IA.`, etapaId: etapa.id });
  }

  for (const etapa of etapas.filter((e) => ehMensagem(e) && textosValidos(e).length === 0)) {
    problemas.push({ mensagem: `O bloco “${etapa.id}” está sem texto para enviar.`, etapaId: etapa.id });
  }

  for (const etapa of followups(etapas).filter((e) => !(Number(e.espera_horas) > 0))) {
    problemas.push({ mensagem: `O follow-up “${etapa.id}” precisa de um tempo de espera maior que zero.`, etapaId: etapa.id });
  }

  const disparos = etapas.filter((e) => tipoDe(e) === "disparo");
  if (disparos.length > 1) {
    problemas.push({
      mensagem: "Só pode haver um bloco de disparo — coloque as alternativas como variações de texto.",
      etapaId: disparos[1].id,
    });
  }
  return problemas;
}

export function validar(etapas: EtapaRoteiro[]): string[] {
  return diagnosticar(etapas).map((problema) => problema.mensagem);
}

/** Avisos que não impedem salvar, mas mudam o que o robô faz. */
export function avisos(etapas: EtapaRoteiro[]): string[] {
  const lista: string[] = [];
  if (etapas.length === 0) return lista;
  if (!etapas.some((e) => tipoDe(e) === "disparo")) {
    lista.push("Sem bloco de disparo: a campanha desta carteira envia o texto padrão do sistema em vez do seu.");
  }
  if (followups(etapas).length === 0) {
    lista.push("Sem follow-up: quem não responder a primeira mensagem não recebe reenvio.");
  }
  if (!etapas.some((e) => tipoDe(e) === "conversa")) {
    lista.push("Sem bloco de conversa: depois que a pessoa responder, o robô conversa livre pelo prompt.");
  }
  return lista;
}

/** Blocos de conversa que ninguém alcança a partir da entrada — aviso, não erro. */
export function inalcancaveis(etapas: EtapaRoteiro[]): string[] {
  const conversas = etapas.filter((e) => tipoDe(e) === "conversa");
  if (conversas.length === 0) return [];
  const raiz = etapaDeEntrada(etapas) ?? conversas[0].id;
  const porId = new Map(conversas.map((e) => [e.id, e]));
  const vistos = new Set([raiz]);
  const fila = [raiz];
  while (fila.length) {
    const id = fila.shift()!;
    for (const c of porId.get(id)?.casos ?? []) {
      if (c.vai_para && porId.has(c.vai_para) && !vistos.has(c.vai_para)) {
        vistos.add(c.vai_para); fila.push(c.vai_para);
      }
    }
  }
  return conversas.map((e) => e.id).filter((id) => !vistos.has(id));
}

/** JSON portátil para copiar o fluxo entre carteiras sem acoplar o editor ao banco. */
export function serializarRoteiro(roteiro: Roteiro): string {
  return JSON.stringify({
    formato: FORMATO_TRANSFERENCIA_ROTEIRO,
    exportado_em: new Date().toISOString(),
    roteiro,
  }, null, 2);
}

/** Aceita o envelope exportado pelo editor ou um `Roteiro` puro. */
export function importarRoteiro(texto: string): ResultadoImportacaoRoteiro {
  if (texto.length > 1_500_000) {
    return { ok: false, erro: "O fluxo ultrapassa o limite de 1,5 MB para importação." };
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "O conteúdo não é um JSON válido." };
  }

  if (!registro(bruto)) return { ok: false, erro: "O JSON não contém um fluxo de carteira." };
  const candidato = registro(bruto.roteiro) ? bruto.roteiro : bruto;
  if (!Array.isArray(candidato.etapas)) {
    return { ok: false, erro: "O fluxo precisa ter uma lista de blocos em “etapas”." };
  }

  const etapas: EtapaRoteiro[] = [];
  for (let indice = 0; indice < candidato.etapas.length; indice++) {
    const item = candidato.etapas[indice];
    if (!registro(item) || typeof item.id !== "string" || !item.id.trim()) {
      return { ok: false, erro: `O bloco ${indice + 1} não tem um nome válido.` };
    }
    if (etapas.some((etapa) => etapa.id === item.id)) {
      return { ok: false, erro: `O nome de bloco “${item.id}” está repetido.` };
    }
    const tipo = item.tipo === undefined ? "conversa" : item.tipo;
    if (!["disparo", "followup", "conversa", "pos_pagamento"].includes(String(tipo))) {
      return { ok: false, erro: `O bloco “${item.id}” tem um tipo desconhecido.` };
    }
    const casos = Array.isArray(item.casos)
      ? item.casos.filter(registro).map((caso) => ({
          quando: typeof caso.quando === "string" ? caso.quando : "",
          vai_para: typeof caso.vai_para === "string" ? caso.vai_para : "",
        }))
      : [];
    const pos = registro(item.pos) && numeroFinito(item.pos.x) && numeroFinito(item.pos.y)
      ? { x: Number(item.pos.x), y: Number(item.pos.y) }
      : undefined;
    etapas.push({
      id: item.id,
      tipo: tipo as TipoEtapa,
      objetivo: typeof item.objetivo === "string" ? item.objetivo : "",
      instrucao: typeof item.instrucao === "string" ? item.instrucao : undefined,
      textos: Array.isArray(item.textos) ? item.textos.filter((valor): valor is string => typeof valor === "string") : undefined,
      espera_horas: numeroFinito(item.espera_horas) ? Number(item.espera_horas) : undefined,
      casos,
      pos,
    });
  }

  return { ok: true, roteiro: { ativo: candidato.ativo !== false, etapas } };
}

function registro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function numeroFinito(valor: unknown): boolean {
  return (typeof valor === "number" || typeof valor === "string") && Number.isFinite(Number(valor));
}
