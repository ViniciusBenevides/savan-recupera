"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { AnaliseDetalhe } from "@/components/juridico/analise";
import type { Analise } from "@/lib/juridico/tipos";
import { cn } from "@/lib/utils";
import { dataLonga } from "@/lib/datas";

type Aviso = { tipo: "ok" | "erro" | "atencao"; msg: string } | null;
const corAviso = (t: "ok" | "erro" | "atencao") => (t === "ok" ? "bg-pago-fundo text-pago" : t === "erro" ? "bg-margem-fundo text-margem" : "bg-atencao-fundo text-atencao");

/** "Sincronizar fontes oficiais agora": lê de novo o Planalto e os portais dos tribunais. */
export function SincronizarFontes() {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  async function sincronizar() {
    setRodando(true); setAviso(null);
    const r = await fetch("/api/juridico/fontes", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setRodando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível sincronizar." }); return; }
    const partes = [`${j.confirmadas} confirmadas`];
    if (j.via_pesquisa) partes.push(`${j.via_pesquisa} pela pesquisa do caso`);
    if (j.alteradas) partes.push(`${j.alteradas} com alteração a revisar`);
    if (j.falhas) partes.push(`${j.falhas} sem resposta`);
    setAviso({ tipo: j.falhas || j.alteradas ? "atencao" : "ok", msg: `Fontes oficiais: ${partes.join(", ")}.` });
    router.refresh();
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="outline" onClick={sincronizar} disabled={rodando}>
        <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        {rodando ? "Lendo as fontes oficiais…" : "Sincronizar fontes oficiais"}
      </Button>
      {aviso && <p role="status" className={cn("max-w-[34rem] rounded-controle px-3 py-2 text-sm2", corAviso(aviso.tipo))}>{aviso.msg}</p>}
    </div>
  );
}

/** Botão "Analisar" de uma linha da triagem. */
export function AnalisarUm({ devedorId, analisado }: { devedorId: number; analisado: boolean }) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function analisar() {
    setRodando(true); setErro(null);
    const r = await fetch("/api/juridico/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ devedor_id: devedorId, usar_ia: true }) });
    const j = await r.json().catch(() => ({}));
    setRodando(false);
    if (!r.ok) { setErro(j?.erro ?? "Falhou."); return; }
    router.refresh();
  }
  return (
    <span className="flex flex-col items-start gap-1 sm:items-end">
      <Button size="sm" variant={analisado ? "ghost" : "outline"} onClick={analisar} disabled={rodando}>{rodando ? "Analisando…" : analisado ? "Analisar de novo" : "Analisar"}</Button>
      {erro && <span role="alert" className="text-meta text-margem">{erro}</span>}
    </span>
  );
}

/**
 * "Analisar lote" (V5.6.00, até 25 por vez): roda um devedor de cada vez, porque cada análise com IA
 * leva dezenas de segundos. Começa por quem ainda não foi analisado; dá para parar no meio.
 */
export function LoteAnalise({ candidatos }: { candidatos: { id: number; nome: string; analisado: boolean }[] }) {
  const router = useRouter();
  const [maximo, setMaximo] = useState("5");
  const [usarIA, setUsarIA] = useState(true);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number; atual: string; falhas: string[] } | null>(null);
  const parar = useRef(false);
  const rodando = !!progresso && progresso.feitos < progresso.total;

  async function rodar() {
    const n = Math.max(1, Math.min(25, Number(maximo) || 5));
    const fila = [...candidatos.filter((c) => !c.analisado), ...candidatos.filter((c) => c.analisado)].slice(0, n);
    parar.current = false;
    const falhas: string[] = [];
    for (let i = 0; i < fila.length; i++) {
      if (parar.current) { setProgresso({ feitos: fila.length, total: fila.length, atual: "", falhas: [...falhas, "parado por você"] }); break; }
      setProgresso({ feitos: i, total: fila.length, atual: fila[i].nome, falhas });
      const r = await fetch("/api/juridico/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ devedor_id: fila[i].id, usar_ia: usarIA }) });
      if (!r.ok) falhas.push(fila[i].nome);
    }
    setProgresso((p) => (p && p.feitos < p.total ? { feitos: fila.length, total: fila.length, atual: "", falhas } : p));
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-painel border border-pauta bg-folha p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Label htmlFor="lote-max">Quantos</Label>
          <Input id="lote-max" type="number" min={1} max={25} value={maximo} onChange={(e) => setMaximo(e.target.value)} disabled={rodando} className="font-mono" />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-[0.9375rem]">
          <input type="checkbox" checked={usarIA} onChange={(e) => setUsarIA(e.target.checked)} disabled={rodando} className="h-4 w-4 accent-[rgb(var(--c-tinta))] [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5" />
          Usar IA para estratégia e jurisprudência
        </label>
        {rodando
          ? <Button variant="ghost" onClick={() => { parar.current = true; }}>Parar depois deste</Button>
          : <Button onClick={rodar}>Analisar lote</Button>}
      </div>
      <p className="mt-2 text-meta text-lapis">Até 25 por vez, um de cada vez, começando por quem ainda não foi analisado. Toda análise nasce como rascunho para o advogado aprovar.</p>
      {progresso && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="h-1 overflow-hidden rounded-full bg-pauta" aria-hidden="true">
            <div className="h-full rounded-full bg-tinta transition-[width] duration-300 ease-saida" style={{ width: `${(progresso.feitos / Math.max(1, progresso.total)) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm2">
            {rodando
              ? <>Analisando {progresso.feitos + 1} de {progresso.total}: <span className="font-600">{progresso.atual}</span></>
              : <>Lote concluído: {progresso.total - progresso.falhas.filter((f) => f !== "parado por você").length} de {progresso.total}.{progresso.falhas.length ? <span className="text-margem"> Falhou: {progresso.falhas.join(", ")}.</span> : ""} <Link href="/juridico?aba=analises" className="font-600 text-tinta hover:underline">Ver as análises →</Link></>}
          </p>
        </div>
      )}
    </div>
  );
}

/** Lista de análises: uma aberta por vez, com o painel inteiro dentro. */
export function AnalisesLista({ analises, podeDecidir, comCaso }: { analises: (Analise & { nome: string })[]; podeDecidir: boolean; comCaso: number[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (!analises.length) return <p className="mt-3 text-[0.9375rem] text-lapis">Nenhuma análise ainda. Comece pela Triagem.</p>;
  return (
    <ul className="mt-3 divide-y divide-pauta border-y border-pauta bg-folha">
      {analises.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => setAberta(aberta === a.id ? null : a.id)} aria-expanded={aberta === a.id}
            className={cn("linha-hover grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-4 py-3 text-left sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center", aberta === a.id && "bg-tinta-clara")}>
            <span className="font-mono text-sm2 text-tinta tabnums">{dataLonga(a.criado_em)}</span>
            <span className="min-w-0">
              <span className="block font-700 text-texto [overflow-wrap:anywhere]">{a.nome}</span>
              <span className="block text-sm2 text-lapis">{a.medida} · {a.confianca}%</span>
            </span>
            <span className={cn("col-start-2 text-sm2 font-600 sm:col-start-auto", a.status === "APROVADA" ? "text-pago" : "text-lapis")}>{a.status === "APROVADA" ? "Aprovada" : "Rascunho"}</span>
          </button>
          {aberta === a.id && (
            <div className="border-t border-pauta bg-papel/60 px-4 py-5 animate-fade-up">
              <p className="mb-2"><Link href={`/devedores/${a.devedor_id}?aba=juridico`} className="text-sm2 font-600 text-tinta hover:underline">Abrir a ficha de {a.nome.split(" ")[0]} →</Link></p>
              <AnaliseDetalhe a={a} podeDecidir={podeDecidir} temCaso={comCaso.includes(a.id)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Cadastrar decisão oficial": só com link do STF, STJ, TJGO ou TJMT, aberto na hora para conferir. */
export function PrecedenteForm() {
  const router = useRouter();
  const vazio = { tribunal: "STJ", processo: "", tema: "", tese: "", nivel: "B", publicado_em: "", url_oficial: "", observacao: "" };
  const [f, setF] = useState(vazio);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const set = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function salvar() {
    setGravando(true); setAviso(null);
    const r = await fetch("/api/juridico/precedentes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível cadastrar." }); return; }
    setAviso({ tipo: "ok", msg: "Decisão cadastrada. Entra nas próximas análises." });
    setF(vazio);
    router.refresh();
  }

  return (
    <aside aria-labelledby="t-novo-prec" className="h-fit rounded-painel border border-pauta bg-folha p-4">
      <h2 id="t-novo-prec" className="font-display text-titulo font-600 text-ouro">Cadastrar decisão</h2>
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="p-trib">Tribunal</Label><Select id="p-trib" value={f.tribunal} onChange={set("tribunal")}>{["STJ", "STF", "TJGO", "TJMT"].map((x) => <option key={x}>{x}</option>)}</Select></div>
          <div><Label htmlFor="p-nivel">Peso</Label><Select id="p-nivel" value={f.nivel} onChange={set("nivel")}><option value="A">Vinculante</option><option value="B">Tribunal competente</option><option value="C">Persuasivo</option></Select></div>
        </div>
        <div><Label htmlFor="p-proc">Processo ou tema</Label><Input id="p-proc" value={f.processo} onChange={set("processo")} placeholder="Ex.: REsp 1.234.567/GO ou Tema 1.234" /></div>
        <div><Label htmlFor="p-tema">Assunto</Label><Input id="p-tema" value={f.tema} onChange={set("tema")} placeholder="Ex.: prescrição de duplicata" /></div>
        <div><Label htmlFor="p-tese">Tese ou conclusão</Label><Textarea id="p-tese" rows={3} value={f.tese} onChange={set("tese")} /></div>
        <div><Label htmlFor="p-data">Publicação</Label><Input id="p-data" type="date" value={f.publicado_em} onChange={set("publicado_em")} /></div>
        <div><Label htmlFor="p-url">Link oficial</Label><Input id="p-url" type="url" inputMode="url" value={f.url_oficial} onChange={set("url_oficial")} placeholder="https://…stj.jus.br/…" /></div>
        <div><Label htmlFor="p-obs">Notas <span className="font-500 text-lapis">(opcional)</span></Label><Textarea id="p-obs" rows={2} value={f.observacao} onChange={set("observacao")} /></div>
        {aviso && <p role="status" className={cn("rounded-controle px-3 py-2 text-sm2", corAviso(aviso.tipo))}>{aviso.msg}</p>}
        <Button onClick={salvar} disabled={gravando || !f.tese.trim() || !f.url_oficial.trim()}>{gravando ? "Conferindo o link…" : "Cadastrar decisão"}</Button>
      </div>
    </aside>
  );
}
