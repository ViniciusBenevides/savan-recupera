"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { FAIXAS, type Faixa } from "@/lib/recuperacao";
import { montarMensagem } from "@/lib/mensagem-previa";
import { cn, contar, num } from "@/lib/utils";

// "O que você quer cobrar agora?" — o modo simples da tela de Disparos do MC COB V5.9.02:
// escolher a carteira, quem chamar (faixa de atraso) e por qual linha, revisar e iniciar.
// Por baixo continua a fila de sempre, no ritmo de cada linha; aqui só se liga, pausa e filtra.

export type LinhaDaCarteira = { id: number; nome: string; status: string; final: string };
export type CarteiraCobrar = {
  id: number;
  nome: string;
  status: string;
  publico: Faixa | null;
  ordem: string;
  porFaixa: Partial<Record<Faixa, number>>;
  linhas: LinhaDaCarteira[];
  textoAbordagem: string | null;
};

const ORDENS = [
  { k: "antigos", t: "Dívidas mais antigas primeiro" },
  { k: "recentes", t: "Dívidas mais recentes primeiro" },
  { k: "prioridade", t: "Na ordem da importação" },
];
const PRONTA = new Set(["ativo", "aquecendo"]);
const TODOS = "todos" as const;
type Escolha = Faixa | typeof TODOS;

export function CobrarAgora({ carteiras, campanhaLigada, podeMexer }: { carteiras: CarteiraCobrar[]; campanhaLigada: boolean; podeMexer: boolean }) {
  const router = useRouter();
  const inicial = carteiras.find((c) => c.status === "ativa") ?? carteiras[0];
  const [carteiraId, setCarteiraId] = useState<number | null>(inicial?.id ?? null);
  const c = carteiras.find((x) => x.id === carteiraId) ?? null;
  const [escolha, setEscolha] = useState<Escolha>(inicial?.publico ?? TODOS);
  const [ordem, setOrdem] = useState(inicial?.ordem ?? "antigos");
  const [revisando, setRevisando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; t: string } | null>(null);

  const total = useMemo(() => (c ? Object.values(c.porFaixa).reduce((s, n) => s + (n ?? 0), 0) : 0), [c]);
  const noLote = c ? (escolha === TODOS ? total : c.porFaixa[escolha] ?? 0) : 0;
  const linhasProntas = c ? c.linhas.filter((l) => PRONTA.has(l.status)) : [];
  const ativa = c?.status === "ativa";
  const mudou = c ? (escolha === TODOS ? null : escolha) !== c.publico || ordem !== c.ordem : false;
  const rotuloPublico = escolha === TODOS ? "Todos da fila" : FAIXAS.find((f) => f.k === escolha)?.t ?? "";

  function escolherCarteira(id: number) {
    const nova = carteiras.find((x) => x.id === id);
    setCarteiraId(id);
    setEscolha(nova?.publico ?? TODOS);
    setOrdem(nova?.ordem ?? "antigos");
    setRevisando(false);
    setAviso(null);
  }

  async function revisar() {
    if (!c) return;
    setRevisando(true);
    setAviso(null);
    setPrevia(null);
    if (!c.textoAbordagem) return;
    try {
      const r = await fetch(`/api/carteiras/${c.id}/previa-mensagem`, { cache: "no-store" });
      const j = await r.json();
      const valores = j?.com_desconto ?? j?.sem_desconto;
      setPrevia(valores ? montarMensagem(c.textoAbordagem, valores) : null);
    } catch {
      setPrevia(null);
    }
  }

  async function salvar(corpo: Record<string, unknown>, sucesso: string) {
    if (!c) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/carteiras/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.erro || "Não foi possível salvar.");
      setAviso({ tom: "ok", t: sucesso });
      setRevisando(false);
      router.refresh();
    } catch (e) {
      setAviso({ tom: "erro", t: `${e instanceof Error ? e.message : "Não foi possível salvar."} Tente de novo; se continuar, avise o administrador.` });
    } finally {
      setSalvando(false);
    }
  }

  const iniciar = () => salvar(
    { status: "ativa", publico_faixa: escolha === TODOS ? null : escolha, ordem_fila: ordem },
    `${c?.nome}: o robô chama ${contar(noLote, "pessoa", "pessoas")} (${rotuloPublico.toLowerCase()}), uma de cada vez, no próximo horário de envio.`,
  );
  const pausar = () => salvar({ status: "pausada" }, `${c?.nome} pausada: ninguém novo recebe mensagem. Quem já respondeu continua no Trabalho de hoje.`);

  if (carteiras.length === 0) return null;

  return (
    <section aria-labelledby="t-cobrar" className="mt-6 rounded-painel border border-pauta-forte bg-folha">
      <div className="border-b border-pauta px-5 py-4 sm:px-6">
        <h2 id="t-cobrar" className="font-display text-titulo font-600 text-ouro">O que você quer cobrar agora?</h2>
        <p className="mt-1 max-w-[75ch] text-sm2 text-lapis">Escolha a carteira e quem chamar. O robô manda a primeira mensagem, uma de cada vez, no ritmo de cada linha; quem responder vem para o Trabalho de hoje.</p>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-6 px-5 py-5 sm:px-6">
          {/* 1. Carteira */}
          <fieldset>
            <legend className="text-sm2 font-700 text-texto"><span className="font-mono text-tinta">1</span> · Carteira</legend>
            <div role="radiogroup" aria-label="Carteira" className="mt-2 grid gap-2 sm:grid-cols-2">
              {carteiras.map((x) => {
                const sel = x.id === carteiraId;
                const fila = Object.values(x.porFaixa).reduce((s, n) => s + (n ?? 0), 0);
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => escolherCarteira(x.id)}
                    className={cn(
                      "alvo-toque min-w-0 rounded-controle border px-3.5 py-2.5 text-left transition-colors duration-150",
                      sel ? "border-tinta bg-tinta-clara" : "border-pauta hover:border-pauta-forte hover:bg-white/[0.02]",
                    )}
                  >
                    <span className="block truncate font-700 text-texto" title={x.nome}>{x.nome}</span>
                    <span className="block text-meta text-lapis">
                      <span className={cn("font-600", x.status === "ativa" ? "text-pago" : "text-lapis")}>{x.status === "ativa" ? "Ligada" : "Pausada"}</span>
                      {" · "}<span className="font-mono tabnums">{num(fila)}</span> na fila
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {c && (
            <>
              {/* 2. Quem chamar */}
              <fieldset>
                <legend className="text-sm2 font-700 text-texto"><span className="font-mono text-tinta">2</span> · Quem chamar, pelo tempo de atraso</legend>
                <div role="radiogroup" aria-label="Faixa de atraso" className="mt-2 flex flex-wrap gap-2">
                  {[{ k: TODOS as Escolha, t: "Todos", n: total }, ...FAIXAS.map((f) => ({ k: f.k as Escolha, t: f.curto, n: c.porFaixa[f.k] ?? 0 }))].map((f) => {
                    const sel = escolha === f.k;
                    const vazio = f.n === 0 && f.k !== TODOS;
                    return (
                      <button
                        key={f.k}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        disabled={vazio && !sel}
                        onClick={() => { setEscolha(f.k); setRevisando(false); setAviso(null); }}
                        className={cn(
                          "alvo-toque inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm2 font-600 transition-colors duration-150",
                          sel ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte text-texto hover:bg-tinta-clara",
                          vazio && !sel && "cursor-not-allowed opacity-40 hover:bg-transparent",
                        )}
                      >
                        {f.t}
                        <span className={cn("font-mono tabnums", sel ? "text-sobre-tinta" : "text-lapis")}>{num(f.n)}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 flex max-w-sm flex-col gap-1 text-meta font-600 text-lapis">
                  Ordem de chamada
                  <select
                    value={ordem}
                    onChange={(e) => { setOrdem(e.target.value); setRevisando(false); }}
                    className="h-10 rounded-controle border border-pauta-forte bg-papel px-3 text-[1rem] font-normal text-texto"
                  >
                    {ORDENS.map((o) => <option key={o.k} value={o.k}>{o.t}</option>)}
                  </select>
                </label>
              </fieldset>

              {/* 3. Linha */}
              <div>
                <p className="text-sm2 font-700 text-texto"><span className="font-mono text-tinta">3</span> · Por qual linha sai</p>
                {c.linhas.length === 0 ? (
                  <p className="mt-2 rounded-controle bg-atencao-fundo px-3 py-2 text-sm2 text-atencao">
                    Nenhuma linha de WhatsApp ligada a esta carteira. Nada sai até conectar uma em{" "}
                    <Link href="/ajustes?aba=chips" className="font-700 underline">Linhas WhatsApp</Link>.
                  </p>
                ) : (
                  <ul role="list" className="mt-2 flex flex-wrap gap-2">
                    {c.linhas.map((l) => (
                      <li key={l.id} className="inline-flex items-center gap-2 rounded-controle border border-pauta px-3 py-1.5 text-sm2">
                        <span className={cn("h-2 w-2 rounded-full", PRONTA.has(l.status) ? "bg-pago" : "bg-lapis/50")} aria-hidden="true" />
                        <span className="font-600 text-texto">{l.nome}</span>
                        <span className="font-mono text-meta text-lapis">{l.final}</span>
                        {!PRONTA.has(l.status) && <span className="text-meta text-lapis">· não está pronta</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Resumo e ação */}
        {c && (
          <div className="border-t border-pauta px-5 py-5 sm:px-6 lg:border-l lg:border-t-0">
            <p className="text-meta font-600 text-lapis">Entram no lote</p>
            <p className="mt-1 font-mono text-[2rem] font-600 leading-none tabnums text-ouro">{num(noLote)}</p>
            <p className="mt-1 text-sm2 text-lapis">{rotuloPublico} · {c.nome}</p>
            <dl className="mt-4 space-y-1.5 text-sm2">
              <div className="flex justify-between gap-3"><dt className="text-lapis">Situação</dt><dd className={cn("font-600", ativa ? "text-pago" : "text-texto")}>{ativa ? "Ligada" : "Pausada"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-lapis">Linhas prontas</dt><dd className="font-mono tabnums text-texto">{num(linhasProntas.length)} de {num(c.linhas.length)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-lapis">Campanha</dt><dd className={cn("font-600", campanhaLigada ? "text-pago" : "text-margem")}>{campanhaLigada ? "Ligada" : "Desligada"}</dd></div>
            </dl>

            {podeMexer ? (
              <div className="mt-5 flex flex-col gap-2">
                {(!ativa || mudou) && (
                  <Button onClick={revisar} disabled={salvando || noLote === 0} className="w-full justify-center">
                    {ativa ? "Revisar a mudança" : "Revisar antes de iniciar"}
                  </Button>
                )}
                {ativa && (
                  <Button variant="outline" onClick={pausar} disabled={salvando} className="w-full justify-center">
                    {salvando ? "Salvando…" : "Pausar esta carteira"}
                  </Button>
                )}
                {noLote === 0 && <p className="text-meta text-lapis">Ninguém nesta faixa está esperando na fila.</p>}
              </div>
            ) : (
              <p className="mt-5 text-meta text-lapis">Só o dono da operação liga e pausa as carteiras.</p>
            )}
          </div>
        )}
      </div>

      {/* Revise antes de iniciar */}
      {c && revisando && (
        <div className="border-t border-pauta-forte bg-papel/60 px-5 py-5 sm:px-6" role="region" aria-labelledby="t-revisao">
          <h3 id="t-revisao" className="font-display text-[1.25rem] font-600 text-ouro">Revise antes de iniciar</h3>
          <div className="mt-3 grid gap-5 lg:grid-cols-2">
            <ul role="list" className="space-y-1.5 text-[0.9375rem]">
              <li><span className="text-lapis">Carteira:</span> <b className="text-texto">{c.nome}</b></li>
              <li><span className="text-lapis">Quem recebe:</span> <b className="text-texto">{contar(noLote, "pessoa", "pessoas")}</b> · {rotuloPublico.toLowerCase()}</li>
              <li><span className="text-lapis">Ordem:</span> {ORDENS.find((o) => o.k === ordem)?.t}</li>
              <li><span className="text-lapis">Ritmo:</span> uma mensagem por vez, no limite de cada linha, nos dias e horários de <Link href="/ajustes?aba=envio" className="text-tinta underline">Configurações → Envio</Link>.</li>
              <li><span className="text-lapis">Depois:</span> quem responder vai para o Trabalho de hoje; quem pedir para parar não recebe mais nada.</li>
              {linhasProntas.length === 0 && <li className="text-atencao">Sem linha pronta, a carteira fica ligada, mas nada sai até uma linha conectar.</li>}
              {!campanhaLigada && <li className="text-atencao">A campanha está desligada: nada sai até ela ser ligada em Relatórios &amp; BI, aba Robô.</li>}
            </ul>
            <div>
              <p className="text-meta font-600 text-lapis">A primeira mensagem, com um devedor desta carteira</p>
              {c.textoAbordagem ? (
                <p className="mt-2 whitespace-pre-line rounded-painel border border-pauta bg-folha px-4 py-3 text-sm2 leading-6 text-texto">
                  {previa ?? "Montando a prévia…"}
                </p>
              ) : (
                <p className="mt-2 text-sm2 text-atencao">Esta carteira ainda não tem a primeira mensagem escrita. Escreva no fluxo da carteira antes de iniciar.</p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRevisando(false)} disabled={salvando}>Voltar e revisar</Button>
            <Button onClick={iniciar} disabled={salvando || !c.textoAbordagem}>{salvando ? "Salvando…" : ativa ? "Confirmar a mudança" : "Confirmar e iniciar"}</Button>
          </div>
        </div>
      )}

      <p aria-live="polite" className="sr-only">{aviso?.t ?? ""}</p>
      {aviso && (
        <p className={cn("border-t px-5 py-3 text-sm2 sm:px-6", aviso.tom === "ok" ? "border-pauta bg-pago-fundo text-pago" : "border-pauta bg-margem-fundo text-margem")}>{aviso.t}</p>
      )}
    </section>
  );
}
