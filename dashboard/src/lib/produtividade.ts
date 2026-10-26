// Produtividade diária da equipe (V5.6.13/14): acionamentos, clientes únicos, ritmo por hora com
// atividade, metas e o recorte por carteira. A fonte é o que já fica registrado — mensagens que a
// pessoa mandou pelo painel e ocorrências que ela registrou —, sem tabela nova de contagem.
import { TZ } from "@/lib/datas";

export type Evento = {
  autor: string; devedor: number; carteira: number | null; canal: "whatsapp" | "ligacao" | "outro";
  tipo: "mensagem" | "ocorrencia"; em: string;
};
export type Pessoa = { id: string; nome: string; papel: string };
export type Meta = { clientes: number; acionamentos: number };

export type LinhaPessoa = {
  pessoa: Pessoa; posicao: number; acionamentos: number; clientes: number; whatsapp: number; ligacoes: number; outros: number;
  resultados: number; horasAtivas: number; porHora: number; primeiro: string | null; ultimo: string | null;
  meta: Meta; pctClientes: number | null; pctAcionamentos: number | null; bateuMeta: boolean;
};
export type LinhaCarteira = { carteira: number; acionamentos: number; clientes: number; pessoas: number; whatsapp: number; ligacoes: number; porCliente: number };
export type Produtividade = {
  pessoas: LinhaPessoa[]; carteiras: LinhaCarteira[];
  totais: { acionamentos: number; clientes: number; ativos: number; equipe: number; porHora: number; metasBatidas: number };
};

// Mesma janela da V5: o resultado registrado até 20 minutos depois de uma tentativa do mesmo cliente
// e canal é o fechamento daquele contato, não um contato novo. Várias mensagens seguidas para a mesma
// pessoa também são uma conversa só: cada pausa maior que a janela abre um acionamento novo.
const JANELA_MS = 20 * 60_000;

const horaSP = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

export function calcularProdutividade(eventos: Evento[], equipe: Pessoa[], metas: Map<string, Meta>): Produtividade {
  const linhas = new Map<string, {
    acionamentos: number; clientes: Set<number>; whatsapp: number; ligacoes: number; outros: number; resultados: number;
    horas: Set<string>; primeiro: string | null; ultimo: string | null;
  }>();
  const nova = () => ({ acionamentos: 0, clientes: new Set<number>(), whatsapp: 0, ligacoes: 0, outros: 0, resultados: 0, horas: new Set<string>(), primeiro: null, ultimo: null });
  for (const p of equipe) linhas.set(p.id, nova());
  const porCarteira = new Map<number, { acionamentos: number; clientes: Set<number>; pessoas: Set<string>; whatsapp: number; ligacoes: number }>();
  const ultimaTentativa = new Map<string, number>();

  for (const e of [...eventos].sort((a, b) => a.em.localeCompare(b.em))) {
    const l = linhas.get(e.autor);
    if (!l) continue;
    const t = new Date(e.em).getTime();
    const chave = `${e.autor}|${e.devedor}|${e.canal}`;
    const anterior = ultimaTentativa.get(chave);
    const dentroDaJanela = anterior != null && t - anterior <= JANELA_MS;
    if (e.tipo === "ocorrencia") l.resultados++;
    ultimaTentativa.set(chave, t);
    if (dentroDaJanela) continue;

    l.acionamentos++;
    l.clientes.add(e.devedor);
    l.horas.add(horaSP.format(new Date(t)));
    if (e.canal === "whatsapp") l.whatsapp++; else if (e.canal === "ligacao") l.ligacoes++; else l.outros++;
    if (!l.primeiro || e.em < l.primeiro) l.primeiro = e.em;
    if (!l.ultimo || e.em > l.ultimo) l.ultimo = e.em;

    if (e.carteira != null) {
      const c = porCarteira.get(e.carteira) ?? { acionamentos: 0, clientes: new Set<number>(), pessoas: new Set<string>(), whatsapp: 0, ligacoes: 0 };
      c.acionamentos++; c.clientes.add(e.devedor); c.pessoas.add(e.autor);
      if (e.canal === "whatsapp") c.whatsapp++; else if (e.canal === "ligacao") c.ligacoes++;
      porCarteira.set(e.carteira, c);
    }
  }

  const pessoas: LinhaPessoa[] = equipe.map((p) => {
    const l = linhas.get(p.id) ?? nova();
    const meta = metas.get(p.id) ?? { clientes: 0, acionamentos: 0 };
    const clientes = l.clientes.size;
    return {
      pessoa: p, posicao: 0, acionamentos: l.acionamentos, clientes, whatsapp: l.whatsapp, ligacoes: l.ligacoes, outros: l.outros,
      resultados: l.resultados, horasAtivas: l.horas.size, porHora: l.horas.size ? l.acionamentos / l.horas.size : 0,
      primeiro: l.primeiro, ultimo: l.ultimo, meta,
      pctClientes: meta.clientes ? (clientes / meta.clientes) * 100 : null,
      pctAcionamentos: meta.acionamentos ? (l.acionamentos / meta.acionamentos) * 100 : null,
      bateuMeta: (meta.clientes > 0 && clientes >= meta.clientes) || (meta.acionamentos > 0 && l.acionamentos >= meta.acionamentos),
    };
  });
  // Ranking por clientes únicos, desempate por acionamentos. Quem ainda não começou fica na lista:
  // a gestão precisa ver quem está zerado.
  pessoas.sort((a, b) => b.clientes - a.clientes || b.acionamentos - a.acionamentos || a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR"));
  pessoas.forEach((p, i) => { p.posicao = i + 1; });

  const carteiras: LinhaCarteira[] = [...porCarteira.entries()].map(([carteira, c]) => ({
    carteira, acionamentos: c.acionamentos, clientes: c.clientes.size, pessoas: c.pessoas.size, whatsapp: c.whatsapp, ligacoes: c.ligacoes,
    porCliente: c.clientes.size ? c.acionamentos / c.clientes.size : 0,
  })).sort((a, b) => b.acionamentos - a.acionamentos || b.clientes - a.clientes);

  const ativos = pessoas.filter((p) => p.acionamentos > 0);
  const horas = ativos.reduce((s, p) => s + p.horasAtivas, 0);
  const acionamentos = pessoas.reduce((s, p) => s + p.acionamentos, 0);
  return {
    pessoas, carteiras,
    totais: {
      acionamentos, clientes: pessoas.reduce((s, p) => s + p.clientes, 0), ativos: ativos.length, equipe: pessoas.length,
      porHora: horas ? acionamentos / horas : 0, metasBatidas: pessoas.filter((p) => p.bateuMeta).length,
    },
  };
}

// Canal da ocorrência no recorte da V5: WhatsApp, ligação, e o resto como "outros".
export const canalDaOcorrencia = (c: string): Evento["canal"] => (c === "whatsapp" ? "whatsapp" : c === "ligacao" ? "ligacao" : "outro");
