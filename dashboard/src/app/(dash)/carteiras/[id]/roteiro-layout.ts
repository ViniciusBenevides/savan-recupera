// Conversão entre o roteiro salvo (etapas + casos) e o grafo do canvas (nós + arestas), §33.1.
//
// O formato do banco continua sendo o que o `bot-turno` lê — o canvas é só a forma de editar.
// As posições viajam junto em `etapas[].pos`; campos extras são ignorados pelo bot, então dá para
// guardar o layout sem tocar no contrato do prompt.

export type CasoRoteiro = { quando: string; vai_para: string };
export type EtapaRoteiro = {
  id: string;
  objetivo?: string;
  instrucao?: string;
  casos?: CasoRoteiro[];
  pos?: { x: number; y: number };
};
export type Roteiro = { ativo?: boolean; etapas: EtapaRoteiro[] };

export const LARGURA_NO = 260;
const GAP_X = 340;
const GAP_Y = 190;

/**
 * Auto-layout em camadas (BFS a partir da primeira etapa). Só é usado quando a etapa ainda não tem
 * posição salva — quem já arrastou mantém o desenho.
 */
export function calcularPosicoes(etapas: EtapaRoteiro[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  if (etapas.length === 0) return pos;

  const porId = new Map(etapas.map((e) => [e.id, e]));
  const nivel = new Map<string, number>();
  const fila: string[] = [etapas[0].id];
  nivel.set(etapas[0].id, 0);

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
  for (const e of etapas) if (!nivel.has(e.id)) nivel.set(e.id, maxNivel + 1);

  const usadosPorNivel: Record<number, number> = {};
  for (const e of etapas) {
    const n = nivel.get(e.id) ?? 0;
    const linha = usadosPorNivel[n] ?? 0;
    usadosPorNivel[n] = linha + 1;
    pos[e.id] = { x: n * GAP_X, y: linha * GAP_Y };
  }
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

/** Problemas que impedem salvar — a mesma checagem que a tela mostra. */
export function validar(etapas: EtapaRoteiro[]): string[] {
  const problemas: string[] = [];
  const ids = etapas.map((e) => e.id);
  const repetidos = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (repetidos.length) problemas.push(`Etapas com nome repetido: ${repetidos.join(", ")}.`);
  if (etapas.some((e) => !e.id?.trim())) problemas.push("Há etapa sem nome.");

  const quebrados = etapas.flatMap((e) =>
    (e.casos ?? [])
      .filter((c) => c.vai_para && !ids.includes(c.vai_para))
      .map((c) => `${e.id} → ${c.vai_para}`));
  if (quebrados.length) problemas.push(`Caminhos para etapas inexistentes: ${quebrados.join(", ")}.`);

  const semTexto = etapas.filter((e) => !(e.instrucao ?? "").trim()).map((e) => e.id);
  if (semTexto.length) problemas.push(`Sem instrução: ${semTexto.join(", ")}.`);

  return problemas;
}

/** Etapas que ninguém alcança a partir da primeira — aviso, não erro. */
export function inalcancaveis(etapas: EtapaRoteiro[]): string[] {
  if (etapas.length === 0) return [];
  const vistos = new Set([etapas[0].id]);
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const fila = [etapas[0].id];
  while (fila.length) {
    const id = fila.shift()!;
    for (const c of porId.get(id)?.casos ?? []) {
      if (c.vai_para && porId.has(c.vai_para) && !vistos.has(c.vai_para)) {
        vistos.add(c.vai_para); fila.push(c.vai_para);
      }
    }
  }
  return etapas.map((e) => e.id).filter((id) => !vistos.has(id));
}
