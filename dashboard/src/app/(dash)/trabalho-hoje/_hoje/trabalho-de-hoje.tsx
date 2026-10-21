"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FichaResumida } from "@/components/ficha/ficha-resumida";
import type { FilaHoje, ItemFila } from "@/lib/fila-hoje";
import { RESULTADOS, type Resultado } from "@/lib/resultados";
import { brl, cn } from "@/lib/utils";
import { hora } from "@/lib/datas";

type Riscado = { chave: string; resultado: Resultado };

export function TrabalhoDeHoje({
  fila, dataExtenso, carteiras, podeOperar,
}: { fila: FilaHoje; dataExtenso: string; carteiras: string[]; podeOperar: boolean }) {
  const router = useRouter();
  const ordem = useMemo(() => fila.grupos.flatMap((g) => g.itens), [fila]);
  const [selecionada, setSelecionada] = useState<string | null>(ordem[0]?.chave ?? null);
  const [riscando, setRiscando] = useState<Riscado | null>(null);
  const [saindo, setSaindo] = useState<Set<string>>(new Set());
  const [feitosAgora, setFeitosAgora] = useState<{ item: ItemFila; resultado: Resultado; hora: string }[]>([]);
  const [painelCelular, setPainelCelular] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const fecharLinha = useRef<(() => void) | null>(null);

  const restantes = ordem.filter((i) => !saindo.has(i.chave));
  const filaVazia = restantes.length === 0 && feitosAgora.length + fila.feitos.length === 0;
  const item = ordem.find((i) => i.chave === selecionada) ?? null;
  // Depois do router.refresh o servidor já conta quem foi riscado agora: não somar duas vezes. O placar
  // sobe junto com o traço da caneta, não depois que a linha some.
  const riscados = fila.riscados + feitosAgora.filter((f) => !fila.feitos.some((x) => x.devedor_id === f.item.devedor_id)).length
    + (riscando && !feitosAgora.some((f) => f.item.chave === riscando.chave) ? 1 : 0);
  const total = fila.total;

  // Quando a fila do servidor muda (router.refresh), volta a ancorar a seleção
  useEffect(() => {
    if (selecionada && !ordem.some((i) => i.chave === selecionada)) setSelecionada(restantes[0]?.chave ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordem]);

  const escolher = useCallback((chave: string) => {
    setSelecionada(chave);
    if (window.matchMedia("(max-width: 1023px)").matches) setPainelCelular(true);
  }, []);

  // ↑ ↓ trocam de linha; sem animação (ação de teclado, repetida o dia todo)
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = restantes.findIndex((x) => x.chave === selecionada);
      const prox = e.key === "ArrowDown" ? restantes[Math.min(i + 1, restantes.length - 1)] : restantes[Math.max(i - 1, 0)];
      if (prox) {
        setSelecionada(prox.chave);
        document.getElementById(`linha-${prox.chave}`)?.scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [restantes, selecionada]);

  // A assinatura: o risco atravessa a linha (220 ms), ela fecha (200 ms, depois de 300 ms) e desce
  // para "Feito hoje". A sequência inteira está no CSS da linha, disparada por uma mudança de estado só,
  // e a linha só sai da lista quando a transição de fechar termina: timer de JS atrasa quando a página
  // está ocupada e cortaria o fechamento no meio. A próxima linha entra em foco e o refresh vem depois,
  // para nada disputar o traço. Movimento reduzido: imediato.
  function aoRegistrar(it: ItemFila, resultado: Resultado) {
    const idx = restantes.findIndex((x) => x.chave === it.chave);
    const proxima = restantes[idx + 1] ?? restantes[idx - 1] ?? null;
    let feito = false;
    const fechar = () => {
      if (feito) return;
      feito = true;
      fecharLinha.current = null;
      setSaindo((s) => new Set(s).add(it.chave));
      setFeitosAgora((f) => [{ item: it, resultado, hora: new Date().toISOString() }, ...f]);
      setRiscando(null);
      setSelecionada(proxima?.chave ?? null);
      if (!proxima) setPainelCelular(false);
      router.refresh();
    };
    setRiscando({ chave: it.chave, resultado });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { fechar(); return; }
    fecharLinha.current = fechar;
    window.setTimeout(fechar, 1500); // rede de segurança, se a transição não chegar ao fim
  }

  const pct = total ? Math.round((riscados / total) * 100) : 0;

  return (
    <div className="lg:grid lg:h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24.5rem]">
      <section className="min-w-0 lg:overflow-y-auto" ref={lista} aria-label="Fila do dia">
        <header className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 pb-4 pt-6 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="font-display text-pagina font-600 text-ouro">Trabalho de hoje</h1>
            <p className="mt-1 text-[0.9375rem] text-lapis">
              {dataExtenso}{carteiras.length > 0 && <> · {carteiras.join(" e ")}</>}
            </p>
          </div>
          <div className="ml-auto text-right" aria-live="polite">
            <p className="text-sm2 text-lapis">
              <span className="font-mono text-titulo font-600 text-tinta tabnums">{riscados}</span> de {total} riscados
            </p>
            <div className="mt-1.5 h-1 w-56 overflow-hidden rounded-full bg-pauta" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do dia">
              <div className="h-full rounded-full bg-tinta transition-[width] duration-300 ease-saida" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </header>

        {filaVazia && <FilaVazia />}
        {restantes.length === 0 && feitosAgora.length + fila.feitos.length > 0 && (
          <div className="mx-4 mb-6 flex items-start gap-3 rounded-painel border border-pago/25 bg-pago-fundo px-4 py-3.5 sm:mx-6 lg:mx-8">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pago" aria-hidden="true" />
            <div>
              <p className="font-700 text-pago">Fila do dia zerada.</p>
              <p className="text-[0.9375rem] text-texto">Quem responder agora aparece aqui na hora. Os retornos e promessas de amanhã já estão na Agenda.</p>
            </div>
          </div>
        )}

        {/* Sem nenhuma linha, a página pautada seria só uma faixa vazia com a margem: o aviso basta. */}
        {!filaVazia && (
          <div className="pagina-pautada border-t border-pauta bg-folha [--margem:72px] sm:[--margem:104px]">
            {fila.grupos.map((g) => {
              const itens = g.itens.filter((i) => !saindo.has(i.chave));
              if (!itens.length) return null;
              return (
                <div key={g.id} role="group" aria-labelledby={`g-${g.id}`}>
                  <h2
                    id={`g-${g.id}`}
                    className={cn(
                      "flex items-baseline gap-2 border-b border-pauta pb-2 pl-[calc(var(--margem)+16px)] pr-4 pt-5 text-[0.9375rem] font-700",
                      g.tom === "quente" ? "text-margem" : g.tom === "morno" ? "text-atencao" : "text-texto",
                    )}
                  >
                    {g.titulo}
                    <span className="font-mono text-meta font-500 text-lapis">{itens.length}</span>
                  </h2>
                  <ul role="list">
                    {itens.map((it) => (
                      <Linha
                        key={it.chave}
                        item={it}
                        ativa={it.chave === selecionada}
                        riscada={riscando?.chave === it.chave}
                        onFechada={() => fecharLinha.current?.()}
                        onClick={() => escolher(it.chave)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            {(feitosAgora.length > 0 || fila.feitos.length > 0) && (
              <div role="group" aria-labelledby="g-feito">
                <h2 id="g-feito" className="flex items-baseline gap-2 border-b border-pauta pb-2 pl-[calc(var(--margem)+16px)] pr-4 pt-5 text-[0.9375rem] font-700 text-texto">
                  Feito hoje <span className="font-mono text-meta font-500 text-lapis">{feitosAgora.length + fila.feitos.length}</span>
                </h2>
                <ul role="list">
                  {feitosAgora.filter((f) => !fila.feitos.some((x) => x.devedor_id === f.item.devedor_id)).map((f) => (
                    <LinhaFeita key={`agora-${f.item.chave}`} nova nome={f.item.nome} hora={hora(f.hora)} resultado={RESULTADOS[f.resultado].rotulo} carteira={f.item.carteira} valor={null} />
                  ))}
                  {fila.feitos.map((f) => (
                    <LinhaFeita key={`f-${f.devedor_id}`} nome={f.nome} hora={hora(f.hora)} resultado={`${RESULTADOS[f.resultado as Resultado]?.rotulo ?? f.resultado}${f.autor ? ` · ${f.autor.split(" ")[0]}` : ""}`} carteira={f.carteira} valor={null} />
                  ))}
                </ul>
              </div>
            )}
            <div className="h-10" />
          </div>
        )}
      </section>

      {/* Painel: ao lado no computador; por cima no celular */}
      <aside
        className={cn(
          "border-l border-pauta bg-folha lg:block lg:h-[calc(100vh-4rem)] lg:overflow-hidden",
          painelCelular ? "fixed inset-0 z-50 block animate-fade-up overflow-y-auto pb-[env(safe-area-inset-bottom)]" : "hidden",
        )}
        aria-label="Ficha resumida"
      >
        {item ? (
          <FichaResumida
            key={item.chave}
            devedorId={item.devedor_id}
            contexto={{ conversa_id: item.conversa_id, agenda_id: item.agenda_id, parcela_id: item.parcela_id, grupo: item.grupo }}
            podeOperar={podeOperar}
            onRegistrado={({ resultado }) => aoRegistrar(item, resultado)}
            onFechar={() => setPainelCelular(false)}
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <p className="font-display text-titulo font-600 text-ouro">Escolha uma linha</p>
              <p className="mt-1 text-[0.9375rem] text-lapis">A ficha resumida, a última mensagem e o que a IA leu aparecem aqui.</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// A linha tem dois desenhos. Larga (tablet, e tela grande com a ficha ao lado): margem, nome, ação e
// valor em colunas. Estreita (celular, e notebook de 1024 a 1279, onde a ficha aperta a lista): nome e
// valor em cima, motivo, e a ação embaixo. Os breakpoints são da tela, não da lista, então o desenho
// estreito volta entre lg e xl de propósito.
const SO_LARGA = "hidden sm:block lg:hidden xl:block";
const SO_LARGA_INLINE = "hidden sm:inline lg:hidden xl:inline";
const SO_ESTREITA = "flex sm:hidden lg:flex xl:hidden";

function Linha({ item, ativa, riscada, onFechada, onClick }: { item: ItemFila; ativa: boolean; riscada: boolean; onFechada: () => void; onClick: () => void }) {
  const corAcao = ativa ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte bg-folha text-tinta";
  return (
    // grid-rows 1fr → 0fr fecha a linha na altura que ela tiver, sem medir nada; o atraso de 300 ms
    // deixa o traço (220 ms) terminar e ser visto antes de a linha fechar
    <li
      id={`linha-${item.chave}`}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-saida motion-reduce:transition-none",
        riscada ? "grid-rows-[0fr] opacity-0 [transition-delay:300ms]" : "grid-rows-[1fr]",
      )}
      onTransitionEnd={(e) => { if (riscada && e.target === e.currentTarget && e.propertyName === "grid-template-rows") onFechada(); }}
    >
      <div className="min-h-0 overflow-hidden">
      <button
        type="button"
        onClick={onClick}
        aria-current={ativa ? "true" : undefined}
        className={cn(
          "linha-hover grid min-h-[60px] w-full items-start border-b border-pauta text-left transition-colors duration-150",
          "grid-cols-[var(--margem)_minmax(0,1fr)] sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto_auto] sm:items-center",
          "lg:grid-cols-[var(--margem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[var(--margem)_minmax(0,1fr)_auto_auto] xl:items-center",
          ativa && "bg-tinta-clara",
        )}
      >
        <span className={cn("pl-4 pt-3 font-mono text-sm2 font-500 tabnums sm:pl-6 sm:pt-0 lg:pt-3 xl:pt-0", item.atrasado ? "text-margem" : "text-tinta")}>
          {item.margem}
        </span>
        <span className="min-w-0 py-2.5 pl-4 pr-4 sm:pr-3" data-riscado={riscada ? "true" : "false"}>
          <span className="flex items-baseline justify-between gap-3">
            <span className="relative inline-flex min-w-0 max-w-full items-baseline gap-2">
              <span className="truncate font-700 text-texto">{item.nome}</span>
              <span className={cn("shrink-0 text-meta text-lapis", SO_LARGA_INLINE)}>{item.carteira}</span>
              <span className="risco" aria-hidden="true" />
            </span>
            {item.valor != null && <span className={cn("shrink-0 font-mono text-[0.9375rem] font-500 tabnums", SO_ESTREITA)}>{brl(item.valor)}</span>}
          </span>
          <span className="block truncate text-sm2 text-lapis">{item.motivo}</span>
          {/* Desenho estreito: a única ação da linha desce para baixo do motivo, com o que é o valor ao lado */}
          <span className={cn("mt-1.5 items-center justify-between gap-3", SO_ESTREITA)}>
            <span className={cn("inline-flex h-7 items-center whitespace-nowrap rounded-controle border px-2.5 text-meta font-600", corAcao)}>
              {item.acaoRotulo}
            </span>
            <span className="truncate text-meta text-lapis">{item.valorRotulo}</span>
          </span>
        </span>
        <span className={cn("pr-4", SO_LARGA)}>
          <span className={cn("inline-flex h-8 items-center whitespace-nowrap rounded-controle border px-3 text-sm2 font-600", corAcao)}>
            {item.acaoRotulo}
          </span>
        </span>
        <span className={cn("pr-4 text-right sm:pr-6", SO_LARGA)}>
          {item.valor != null && <span className="block font-mono text-[0.9375rem] font-500 tabnums">{brl(item.valor)}</span>}
          <span className="block text-meta text-lapis">{item.valorRotulo}</span>
        </span>
      </button>
      </div>
    </li>
  );
}

function LinhaFeita({ nome, hora, resultado, carteira, nova = false }: { nome: string; hora: string; resultado: string; carteira: string; valor: number | null; nova?: boolean }) {
  return (
    <li className={cn("grid min-h-[52px] grid-cols-[var(--margem)_minmax(0,1fr)] items-center border-b border-pauta", nova && "motion-safe:animate-fade-up")}>
      <span className="pl-4 font-mono text-sm2 text-lapis tabnums sm:pl-6">{hora}</span>
      <span className="min-w-0 py-2 pl-4 pr-4">
        <span className="relative inline-flex max-w-full items-baseline gap-2" data-riscado="true">
          <span className="truncate font-600 text-lapis">{nome}</span>
          <span className="shrink-0 text-meta text-lapis">{carteira}</span>
          <span className="risco opacity-60" aria-hidden="true" />
        </span>
        <span className="block truncate text-sm2 text-lapis">{resultado}</span>
      </span>
    </li>
  );
}

function FilaVazia() {
  return (
    <div className="mx-4 mb-6 rounded-painel border border-pauta bg-folha px-5 py-6 sm:mx-6 lg:mx-8">
      <p className="font-display text-titulo font-600 text-ouro">Ninguém para chamar agora</p>
      <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-lapis">
        A fila do dia se monta sozinha com quem respondeu no WhatsApp, quem prometeu pagar hoje, parcelas de acordo que vencem e
        retornos marcados. Para começar uma carteira nova, importe a planilha em Carteiras.
      </p>
    </div>
  );
}
