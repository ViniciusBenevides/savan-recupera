"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, SectionTitle } from "@/components/ui/primitives";
import { brl, cn } from "@/lib/utils";
import { dataCurta, diaISO, hora, nomeDoDia, proximoDiaUtil, somarDias, diasEntre } from "@/lib/datas";

export type ItemAgenda = {
  chave: string; agenda_id: number | null; parcela_id: number | null; devedor_id: number; nome: string; carteira: string;
  tipo: "promessa" | "retorno" | "parcela"; quando: string; dia_inteiro: boolean; valor: number | null; observacao: string | null;
  responsavel_id: string | null; responsavel?: string | null; rotulo: string;
};

const SECOES = [
  { k: "atrasados", t: "Atrasados" },
  { k: "hoje", t: "Hoje" },
  { k: "amanha", t: "Amanhã" },
  { k: "semana", t: "Próximos 7 dias" },
  { k: "depois", t: "Mais para frente" },
] as const;

function secao(quando: string): (typeof SECOES)[number]["k"] {
  const n = diasEntre(new Date(), new Date(quando));
  if (n < 0) return "atrasados";
  if (n === 0) return "hoje";
  if (n === 1) return "amanha";
  if (n <= 7) return "semana";
  return "depois";
}

// "Passar para amanhã" quando o próximo dia útil é amanhã; senão o dia ("Passar para segunda" na sexta).
function rotuloProximoUtil() {
  const d = proximoDiaUtil(new Date(), 10);
  if (diasEntre(new Date(), d) === 1) return "Passar para amanhã";
  return `Passar para ${nomeDoDia(d).split("-")[0]}`;
}

export function AgendaLista({ itens, tipo, quem, podeOperar }: { itens: ItemAgenda[]; tipo: string; quem: string; podeOperar: boolean; hojeIni: string }) {
  const router = useRouter();
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = itens.filter((i) => !feitos.has(i.chave));
  const grupos = SECOES.map((s) => ({ ...s, itens: visiveis.filter((i) => secao(i.quando) === s.k) }));
  const nAtrasados = grupos[0].itens.length;
  const nHoje = grupos[1].itens.length;

  const href = (m: { tipo?: string; quem?: string }) => {
    const u = new URLSearchParams();
    const t = m.tipo ?? tipo; const q = m.quem ?? quem;
    if (t !== "tudo") u.set("tipo", t);
    u.set("quem", q);
    return `/agenda?${u.toString()}`;
  };

  async function agir(item: ItemAgenda, acao: "cumprir" | "quebrar" | "remarcar", quando?: string) {
    setErro(null);
    setFeitos((s) => new Set(s).add(item.chave));
    const r = await fetch(`/api/agenda/${item.agenda_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, quando }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErro(j?.erro ?? "Não foi possível salvar.");
      setFeitos((s) => { const n = new Set(s); n.delete(item.chave); return n; });
      return;
    }
    setRemarcando(null);
    router.refresh();
  }

  const filtro = (ativo: boolean) => cn("alvo-toque inline-flex h-9 items-center rounded-full border px-3 text-sm2 font-600 transition-colors", ativo ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte bg-folha text-texto hover:border-tinta/50");

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Agenda"
        sub={<><span className={nAtrasados ? "font-600 text-margem" : ""}>{nAtrasados} atrasado{nAtrasados === 1 ? "" : "s"}</span> · {nHoje} para hoje</>}
      />
      <div className="flex flex-wrap items-center gap-2">
        {[["tudo", "Tudo"], ["promessas", "Promessas"], ["retornos", "Retornos"], ["parcelas", "Parcelas"]].map(([k, t]) => (
          <Link key={k} href={href({ tipo: k })} className={filtro(tipo === k)}>{t}</Link>
        ))}
        <span className="mx-1 h-6 w-px bg-pauta" aria-hidden="true" />
        <Link href={href({ quem: "minha" })} className={filtro(quem === "minha")}>Minha agenda</Link>
        <Link href={href({ quem: "equipe" })} className={filtro(quem === "equipe")}>Toda a equipe</Link>
      </div>
      {erro && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">{erro}</p>}

      {visiveis.length === 0 && (
        <div className="mt-6 rounded-painel border border-pauta bg-folha px-5 py-6">
          <p className="font-display text-titulo font-600 text-ouro">Agenda limpa</p>
          <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-lapis">Promessas e retornos entram aqui quando você registra um contato; parcelas, quando fecha um acordo. No dia, eles aparecem também no Trabalho de hoje.</p>
        </div>
      )}

      {grupos.filter((g) => g.itens.length).map((g) => (
        <section key={g.k} aria-labelledby={`s-${g.k}`} className="mt-6">
          <h2 id={`s-${g.k}`} className={cn("flex items-baseline gap-2 text-[0.9375rem] font-700", g.k === "atrasados" ? "text-margem" : "text-texto")}>
            {g.t} <span className="font-mono text-meta font-500 text-lapis">{g.itens.length}</span>
          </h2>
          <ul className="pagina-pautada mt-2 border-y border-pauta bg-folha [--margem:68px] sm:[--margem:96px]" role="list">
            {g.itens.map((i) => {
              const atrasado = g.k === "atrasados";
              const marg = g.k === "hoje" ? (i.dia_inteiro ? "hoje" : hora(i.quando)) : dataCurta(i.quando);
              return (
                <li key={i.chave} className="border-b border-pauta last:border-b-0">
                  <div className="grid grid-cols-[var(--margem)_minmax(0,1fr)] items-start sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto] sm:items-center">
                    <span className={cn("px-3 py-3 font-mono text-sm2 tabnums sm:px-4", atrasado ? "text-margem" : "text-tinta")}>
                      {marg}
                      {g.k === "semana" && <span className="block text-meta text-lapis">{nomeDoDia(new Date(i.quando)).split("-")[0]}</span>}
                    </span>
                    <div className="min-w-0 px-4 py-2.5">
                      <Link href={`/devedores/${i.devedor_id}${i.tipo === "parcela" ? "?aba=acordo" : ""}`} className="alvo-toque font-700 text-texto hover:text-tinta hover:underline">{i.nome}</Link>
                      <span className="ml-2 hidden text-meta text-lapis sm:inline">{i.carteira}</span>
                      <p className="text-sm2 text-lapis">
                        <span className={cn("font-600", i.tipo === "promessa" ? "text-tinta" : i.tipo === "parcela" ? "text-texto" : "text-texto")}>
                          {i.tipo === "promessa" ? `Promessa${i.valor ? ` de ${brl(i.valor)}` : ""}` : i.tipo === "retorno" ? "Retorno" : `${i.rotulo} · ${brl(i.valor ?? 0)}`}
                        </span>
                        {i.observacao ? ` · ${i.observacao}` : ""}{i.responsavel ? ` · com ${i.responsavel.split(" ")[0]}` : ""}
                      </p>
                    </div>
                    <div className="col-span-2 flex flex-wrap gap-1 pb-3 pl-[calc(var(--margem)+8px)] pr-3 sm:col-span-1 sm:gap-1.5 sm:pb-0 sm:pl-0 sm:pr-4">
                      {i.tipo === "parcela" ? (
                        <Link href={`/devedores/${i.devedor_id}?aba=acordo`} className="alvo-toque inline-flex h-8 items-center rounded-controle border border-pauta-forte px-3 text-sm2 font-600 text-tinta hover:bg-tinta-clara">Registrar pagamento</Link>
                      ) : podeOperar ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => agir(i, "cumprir")}>Feito</Button>
                          <Button size="sm" variant="ghost" onClick={() => agir(i, "remarcar", proximoDiaUtil(new Date(), 10).toISOString())}>{rotuloProximoUtil()}</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setRemarcando(remarcando === i.chave ? null : i.chave); setNovaData(`${diaISO(somarDias(new Date(), 1))}T10:00`); }}>Remarcar…</Button>
                          {i.tipo === "promessa" && atrasado && <Button size="sm" variant="ghost" className="text-margem" onClick={() => agir(i, "quebrar")}>Não cumpriu</Button>}
                        </>
                      ) : null}
                    </div>
                  </div>
                  {remarcando === i.chave && (
                    <div className="flex flex-wrap items-end gap-2 bg-papel px-4 py-3 sm:pl-[calc(var(--margem)+16px)]">
                      <label className="text-sm2 font-600">
                        Nova data
                        <Input type="datetime-local" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="mt-1" />
                      </label>
                      <Button size="sm" onClick={() => agir(i, "remarcar", new Date(`${novaData}:00-03:00`).toISOString())} disabled={!novaData}>Remarcar</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
