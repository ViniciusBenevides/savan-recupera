// Fontes oficiais do Jurídico automático (porte do legal_engine.py do MC COB V5.7.01, motor LEGAL-V1.1).
// A redação sincronizada do Planalto é a base da fundamentação; portais de jurisprudência são só
// conferidos quanto à disponibilidade, porque a página deles muda a cada acesso (tokens, notícias).
import { createHash } from "node:crypto";

export const VERSAO_MOTOR = "LEGAL-V1.1";

export type TipoFonte = "LEGISLACAO" | "JURISPRUDENCIA";
export type FonteOficial = {
  chave: string;
  nome: string;
  tipo: TipoFonte;
  nivel: "A" | "B" | "C";
  critica: boolean;
  url: string;
  urlsAlternativas?: string[];
  acompanharMudancas: boolean;
};

export const FONTES_OFICIAIS: FonteOficial[] = [
  {
    chave: "planalto_cf", nome: "Constituição Federal — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: true,
    url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm",
    urlsAlternativas: ["https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm"],
    acompanharMudancas: true,
  },
  {
    chave: "planalto_cc", nome: "Código Civil — texto compilado — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: true,
    url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
    acompanharMudancas: true,
  },
  {
    chave: "planalto_cpc", nome: "Código de Processo Civil — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: true,
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105compilada.htm",
    urlsAlternativas: ["https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm"],
    acompanharMudancas: true,
  },
  {
    chave: "planalto_cheque", nome: "Lei do Cheque (Lei 7.357/1985) — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: false,
    url: "https://www.planalto.gov.br/ccivil_03/leis/l7357.htm",
    acompanharMudancas: true,
  },
  {
    chave: "planalto_duplicata", nome: "Lei das Duplicatas (Lei 5.474/1968) — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: false,
    url: "https://www.planalto.gov.br/ccivil_03/leis/l5474.htm",
    acompanharMudancas: true,
  },
  {
    chave: "planalto_cdc", nome: "Código de Defesa do Consumidor — texto compilado — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: false,
    url: "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
    acompanharMudancas: true,
  },
  {
    chave: "planalto_protesto", nome: "Lei de Protesto (Lei 9.492/1997) — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: false,
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9492.htm",
    acompanharMudancas: true,
  },
  {
    chave: "planalto_duplicata_escritural", nome: "Duplicata Escritural (Lei 13.775/2018) — Planalto", tipo: "LEGISLACAO", nivel: "A", critica: false,
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13775.htm",
    acompanharMudancas: true,
  },
  {
    chave: "stj_repetitivos", nome: "STJ — Precedentes Qualificados / Repetitivos", tipo: "JURISPRUDENCIA", nivel: "A", critica: false,
    url: "https://scon.stj.jus.br/repetitivos/temas_repetitivos/",
    acompanharMudancas: false,
  },
  {
    chave: "stf_jurisprudencia", nome: "STF — Pesquisa de Jurisprudência", tipo: "JURISPRUDENCIA", nivel: "A", critica: false,
    url: "https://portal.stf.jus.br/jurisprudencia",
    urlsAlternativas: ["https://portal.stf.jus.br/pesquisa/"],
    acompanharMudancas: false,
  },
  {
    chave: "tjgo_jurisprudencia", nome: "TJGO — Pesquisa de Jurisprudência", tipo: "JURISPRUDENCIA", nivel: "B", critica: false,
    url: "https://projudi.tjgo.jus.br/ConsultaJurisprudencia",
    acompanharMudancas: false,
  },
  {
    chave: "tjmt_jurisprudencia", nome: "TJMT — Consulta de Acórdãos e Decisões", tipo: "JURISPRUDENCIA", nivel: "B", critica: false,
    url: "https://jurisprudencia.tjmt.jus.br/",
    acompanharMudancas: false,
  },
];

const POR_CHAVE = new Map(FONTES_OFICIAIS.map((f) => [f.chave, f]));
export function fontePorChave(chave: string): FonteOficial | undefined {
  return POR_CHAVE.get(chave);
}

// Entidades nomeadas que aparecem nas páginas do Planalto (Latin-1 inteiro, na ordem 160–255) e as
// tipográficas mais comuns. O resto chega como &#NNN; ou &#xHH;, que é decodificado pelo número.
const LATIN1 = (
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 " +
  "acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml " +
  "Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde " +
  "Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig " +
  "ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide " +
  "oslash ugrave uacute ucirc uuml yacute thorn yuml"
).split(" ");
const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  bull: "•", hellip: "…", euro: "€", trade: "™", dagger: "†", Dagger: "‡", permil: "‰", lsaquo: "‹", rsaquo: "›",
  OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ", fnof: "ƒ", circ: "ˆ", tilde: "˜",
  ensp: " ", emsp: " ", thinsp: " ", zwnj: "", zwj: "", lrm: "", rlm: "",
};
LATIN1.forEach((nome, i) => { ENTIDADES[nome] = String.fromCharCode(160 + i); });

function desescapar(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (inteiro, corpo: string) => {
    if (corpo[0] === "#") {
      const cp = corpo[1] === "x" || corpo[1] === "X" ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return inteiro;
      try { return String.fromCodePoint(cp); } catch { return inteiro; }
    }
    return ENTIDADES[corpo] ?? inteiro;
  });
}

// Mesma ordem do V5: desescapa primeiro (um "&lt;b&gt;" vira tag e some junto com as outras).
export function normalizarTexto(html: string): string {
  let v = desescapar(html || "");
  v = v.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  v = v.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  v = v.replace(/<[^>]+>/g, " ");
  v = v.replace(/ /g, " ");
  v = v.replace(/\s+/g, " ");
  return v.trim();
}

function cabecalhosNavegador(url: string): Record<string, string> {
  let origem = "";
  try { const u = new URL(url); origem = `${u.protocol}//${u.host}/`; } catch { /* sem Referer */ }
  return {
    // Alguns portais oficiais recusam User-Agent de robô (403/reset). O MC COB se identifica pelo
    // cabeçalho auxiliar e usa um UA de navegador só para ler o texto público.
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "close",
    ...(origem ? { "Referer": origem } : {}),
    "X-MC-COB-Purpose": "verificacao-de-fonte-juridica-oficial",
  };
}

// O Planalto ainda serve muita página em windows-1252 declarando (ou não) o charset. Fica a
// decodificação com menos caracteres de substituição, como no V5.
function decodificar(bruto: Uint8Array, contentType: string): string {
  const candidatos: string[] = [];
  const doCabecalho = /charset=["']?([\w.:-]+)/i.exec(contentType || "")?.[1];
  if (doCabecalho) candidatos.push(doCabecalho);
  const inicio = new TextDecoder("latin1").decode(bruto.subarray(0, 4096));
  const doMeta = /<meta[^>]+charset=["']?([\w.:-]+)/i.exec(inicio)?.[1];
  if (doMeta) candidatos.push(doMeta);
  candidatos.push("utf-8", "windows-1252", "latin1");
  let melhor = "";
  let menosRuins = Number.POSITIVE_INFINITY;
  for (const rotulo of candidatos) {
    let texto: string;
    try { texto = new TextDecoder(rotulo).decode(bruto); } catch { continue; }
    const ruins = (texto.match(/�/g) ?? []).length;
    if (ruins < menosRuins) { melhor = texto; menosRuins = ruins; }
    if (ruins === 0) break;
  }
  return melhor;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResultadoBusca =
  | { ok: true; httpStatus: number; sha256: string; texto: string; urlEfetiva: string }
  | { ok: false; httpStatus: number; erro: string };

/**
 * Lê uma página pública oficial com repetição curta e endereços alternativos do MESMO domínio.
 * Não contorna autenticação, CAPTCHA nem bloqueio: 401/403/404 não são repetidos.
 */
export async function buscarFonteOficial(
  fonte: { url: string; urlsAlternativas?: string[] },
  timeoutMs = 15000,
): Promise<ResultadoBusca> {
  const candidatos: string[] = [];
  for (const u of [fonte.url, ...(fonte.urlsAlternativas ?? [])]) {
    const url = String(u ?? "").trim();
    if (url && !candidatos.includes(url)) candidatos.push(url);
  }
  const erros: string[] = [];
  let ultimoStatus = 0;

  for (const url of candidatos) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const ctrl = new AbortController();
      const relogio = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          method: "GET",
          headers: cabecalhosNavegador(url),
          redirect: "follow",
          signal: ctrl.signal,
          cache: "no-store",
        });
        ultimoStatus = r.status;
        const bruto = new Uint8Array(await r.arrayBuffer());
        if (r.status >= 200 && r.status < 400 && bruto.length >= 128) {
          const html = decodificar(bruto, r.headers.get("content-type") ?? "");
          return {
            ok: true,
            httpStatus: r.status,
            sha256: createHash("sha256").update(bruto).digest("hex"),
            texto: normalizarTexto(html),
            urlEfetiva: r.url || url,
          };
        }
        erros.push(`${url}: HTTP ${r.status}`);
        // 401/403/404 não melhoram com repetição.
        if (r.status === 401 || r.status === 403 || r.status === 404) break;
      } catch (e: any) {
        const motivo = e?.name === "AbortError" ? `tempo esgotado (${Math.round(timeoutMs / 1000)} s)` : `${e?.name ?? "Erro"}: ${e?.cause?.code ?? e?.message ?? e}`;
        erros.push(`${url}: ${motivo}`);
      } finally {
        clearTimeout(relogio);
      }
      if (tentativa === 0) await esperar(450);
    }
  }

  // Diagnóstico curto, para caber na tela e na auditoria.
  const erro = (erros.slice(-4).join(" | ") || "Sem resposta da fonte oficial").slice(0, 1100);
  return { ok: false, httpStatus: ultimoStatus, erro };
}

const escaparRegex = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Recorta do texto oficial sincronizado o bloco de cada artigo pedido, até o próximo "Art.".
 * Não interpreta a norma: só entrega a redação oficial para o motor e a IA trabalharem.
 */
export function extrairArtigos(textoPlano: string, artigos: (number | string)[]): { artigo: string; texto: string }[] {
  if (!textoPlano) return [];
  const normal = textoPlano.replace(/\s+/g, " ");
  const out: { artigo: string; texto: string }[] = [];
  for (const numero of artigos) {
    const n = String(numero).trim();
    if (!n) continue;
    // Aceita "Art. 784", "Art. 784.", "Art 784º" e o milhar com ponto do Planalto ("Art. 1.001");
    // o (?!\.?\d) evita que o 20 case com o 205.
    const comMilhar = /^\d{4,}$/.test(n) ? n.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : n;
    const alvo = comMilhar === n ? escaparRegex(n) : `(?:${escaparRegex(n)}|${escaparRegex(comMilhar)})`;
    const padrao = new RegExp(`\\bArt\\.?\\s*${alvo}(?!\\.?\\d)\\s*[ºo°]?\\.?\\s*`, "i");
    const m = padrao.exec(normal);
    if (!m) continue;
    const fimDoCasamento = m.index + m[0].length;
    const proximo = /\bArt\.?\s*\d+[A-Za-z-]*\s*[ºo°]?\.?\s*/i.exec(normal.slice(fimDoCasamento));
    const fim = proximo ? fimDoCasamento + proximo.index : Math.min(normal.length, m.index + 2600);
    let bloco = normal.slice(m.index, fim).trim();
    if (bloco.length > 2400) bloco = bloco.slice(0, 2400).trimEnd() + "…";
    out.push({ artigo: n, texto: bloco });
  }
  return out;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// Artigo → hash do bloco. Comparar dois mapas diz QUAIS artigos mudaram entre duas versões.
export function mapaHashArtigos(textoPlano: string): Record<string, string> {
  const texto = (textoPlano || "").replace(/\s+/g, " ").trim();
  if (!texto) return {};
  // O Planalto escreve o milhar com ponto ("Art. 1.001"): sem isso, do art. 1.000 em diante todos
  // virariam a chave "1" e o aviso de alteração apontaria o artigo errado.
  const casamentos = [...texto.matchAll(/\bArt\.?\s*(\d{1,3}(?:\.\d{3})+|\d+)([A-Za-z-]*)\s*[ºo°]?\.?\s*/gi)];
  const out: Record<string, string> = {};
  casamentos.forEach((m, i) => {
    const inicio = m.index ?? 0;
    const fim = i + 1 < casamentos.length ? (casamentos[i + 1].index ?? texto.length) : Math.min(texto.length, inicio + 6000);
    out[(m[1].replace(/\./g, "") + m[2]).toUpperCase()] = sha256(texto.slice(inicio, fim).trim());
  });
  return out;
}

export function artigosAlterados(antigo: string, novo: string): string[] {
  const a = mapaHashArtigos(antigo);
  const b = mapaHashArtigos(novo);
  const numeroDe = (k: string) => { const m = /^\d+/.exec(k); return m ? Number(m[0]) : 1e9; };
  const chaves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => {
    const d = numeroDe(x) - numeroDe(y);
    return d !== 0 ? d : x < y ? -1 : x > y ? 1 : 0;
  });
  return chaves.filter((k) => a[k] !== b[k]);
}

export const DOMINIOS_PRECEDENTES = ["stj.jus.br", "stf.jus.br", "tjgo.jus.br", "projudi.tjgo.jus.br", "tjmt.jus.br", "jurisprudencia.tjmt.jus.br"];

export function urlEmDominioPermitido(url: string, dominios: string[]): boolean {
  let host = "";
  try { host = new URL(String(url ?? "")).hostname.toLowerCase().replace(/\.$/, ""); } catch { return false; }
  return !!host && dominios.some((d) => { const dd = d.toLowerCase(); return host === dd || host.endsWith("." + dd); });
}

export function linksPesquisaOficial(consulta: string, uf?: string | null): { rotulo: string; url: string }[] {
  const q = encodeURIComponent((consulta || "cobrança execução monitória").trim()).replace(/%20/g, "+");
  const links = [
    { rotulo: "STJ · Precedentes Qualificados", url: fontePorChave("stj_repetitivos")!.url },
    { rotulo: "STF · Jurisprudência", url: fontePorChave("stf_jurisprudencia")!.url },
  ];
  const estado = (uf ?? "").toUpperCase().trim();
  if (estado === "GO") links.push({ rotulo: "TJGO · Jurisprudência", url: fontePorChave("tjgo_jurisprudencia")!.url });
  if (estado === "MT") links.push({ rotulo: "TJMT · busca sugerida", url: `https://jurisprudencia.tjmt.jus.br/consulta?txtBusca=${q}` });
  return links;
}
