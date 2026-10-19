"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button, Select, SectionTitle } from "@/components/ui/primitives";
import { mascararCPF } from "@/components/ficha/ficha-resumida";
import { ROTULO_SITUACAO, corSituacao } from "@/lib/resultados";
import { brl, cn, contar, num } from "@/lib/utils";
import { dataCurta, ha } from "@/lib/datas";

export type LinhaDevedor = {
  id: number; nome: string; cpf: string; processo: string | null; saldo: number; situacao: string; responsavel: string | null;
  ultimo_contato_em: string | null; carteira: string; proximo: { tipo: string; quando: string } | null;
};
type Filtros = { aba: string; q: string; carteira: string; situacao: string; contato: string; ordem: string };

const ABAS = [
  { k: "todos", t: "Todos" },
  { k: "minha", t: "Minha carteira" },
  { k: "sem", t: "Sem responsável" },
];

export function ListaDevedores({
  linhas, total, pagina, porPagina, filtros, carteiras, equipe, podeOperar, erro,
}: {
  linhas: LinhaDevedor[]; total: number; pagina: number; porPagina: number; filtros: Filtros;
  carteiras: { id: number; nome: string }[]; equipe: { id: string; nome: string }[]; podeOperar: boolean; erro: string | null;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [alvo, setAlvo] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [gravando, setGravando] = useState(false);

  const href = (mudar: Partial<Filtros & { p: string }>) => {
    const u = new URLSearchParams();
    const tudo = { ...filtros, p: "", ...mudar };
    for (const [k, v] of Object.entries(tudo)) if (v && !(k === "aba" && v === "todos")) u.set(k, String(v));
    const s = u.toString();
    return `/devedores${s ? `?${s}` : ""}`;
  };
  const ativos = [filtros.q, filtros.carteira, filtros.situacao, filtros.contato].filter(Boolean).length;
  const ini = total ? (pagina - 1) * porPagina + 1 : 0;
  const fim = Math.min(total, pagina * porPagina);
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  function marcar(id: number) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function atribuir() {
    setGravando(true); setAviso(null);
    const r = await fetch("/api/devedores/responsavel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...marcados], responsavel_id: alvo === "ninguem" ? null : alvo }),
    });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível atribuir." }); return; }
    setAviso({ tipo: "ok", msg: `${contar(Number(j?.atualizados ?? marcados.size), "devedor atualizado", "devedores atualizados")}.` });
    setMarcados(new Set()); setAlvo("");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <SectionTitle title="Devedores" sub={total ? `${num(total)} ${total === 1 ? "pessoa" : "pessoas"} nesta visão` : undefined} />

      <div className="flex gap-1 sem-barra overflow-x-auto overflow-y-hidden border-b border-pauta" role="tablist" aria-label="Visões">
        {ABAS.map((a) => (
          <Link key={a.k} href={href({ aba: a.k })} role="tab" aria-selected={filtros.aba === a.k}
            className={cn("relative flex h-11 shrink-0 items-center px-3 text-[0.9375rem] font-600", filtros.aba === a.k ? "text-tinta" : "text-lapis hover:text-texto")}>
            {a.t}
            {filtros.aba === a.k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tinta" />}
          </Link>
        ))}
      </div>

      <form action="/devedores" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        {filtros.aba !== "todos" && <input type="hidden" name="aba" value={filtros.aba} />}
        <label className="relative sm:col-span-2 lg:col-span-5">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lapis" aria-hidden="true" />
          <input name="q" defaultValue={filtros.q} placeholder="Nome, CPF, processo ou telefone" className="h-10 w-full rounded-controle border border-pauta-forte bg-folha pl-9 pr-3 text-[0.9375rem] outline-none focus:border-tinta focus:ring-2 focus:ring-tinta/15 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base" />
        </label>
        <Select name="carteira" defaultValue={filtros.carteira} aria-label="Carteira">
          <option value="">Todas as carteiras</option>
          {carteiras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select name="situacao" defaultValue={filtros.situacao} aria-label="Situação">
          <option value="">Qualquer situação</option>
          {Object.entries(ROTULO_SITUACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="contato" defaultValue={filtros.contato} aria-label="Último contato">
          <option value="">Qualquer contato</option>
          <option value="nunca">Nunca acionado</option>
          <option value="7">Sem contato há 7+ dias</option>
          <option value="15">Sem contato há 15+ dias</option>
          <option value="30">Sem contato há 30+ dias</option>
        </Select>
        <Select name="ordem" defaultValue={filtros.ordem} aria-label="Ordem">
          <option value="">Prioridade</option>
          <option value="divida">Maior dívida</option>
          <option value="contato">Contato mais antigo</option>
          <option value="nome">Nome</option>
        </Select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {ativos > 0 && (
        <Link href={href({ q: "", carteira: "", situacao: "", contato: "" })} className="mt-2 inline-flex h-9 items-center gap-1 text-sm2 font-600 text-tinta hover:underline">
          <X className="h-4 w-4" aria-hidden="true" /> Limpar {ativos === 1 ? "filtro" : `${ativos} filtros`}
        </Link>
      )}

      {erro && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">{erro}</p>}
      {aviso && <p role="status" className={cn("mt-4 rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>}

      {linhas.length === 0 && !erro ? (
        <div className="mt-6 rounded-painel border border-pauta bg-folha px-5 py-6">
          {ativos > 0 || filtros.aba !== "todos" ? (
            <>
              <p className="font-display text-titulo font-600 text-ouro">Ninguém com esses filtros</p>
              <p className="mt-1 text-[0.9375rem] text-lapis">{filtros.aba === "minha" ? "Nenhum devedor está com você ainda. Ao trabalhar alguém sem dono, ele passa a ser seu." : "Mude ou limpe os filtros para ver mais gente."}</p>
            </>
          ) : (
            <>
              <p className="font-display text-titulo font-600 text-ouro">Nenhum devedor cadastrado</p>
              <p className="mt-1 text-[0.9375rem] text-lapis">Os devedores entram pela planilha da carteira. Vá em <Link href="/carteiras" className="font-600 text-tinta underline">Carteiras</Link> e importe a planilha.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="pagina-pautada mt-5 border-y border-pauta bg-folha [--margem:76px] sm:[--margem:92px]" role="list">
          {linhas.map((l) => (
            <li key={l.id} className={cn("grid grid-cols-[var(--margem)_minmax(0,1fr)] items-start border-b border-pauta last:border-b-0 sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto] sm:items-center", marcados.has(l.id) && "bg-tinta-clara")}>
              {/* No celular a dívida desce para baixo do nome: a coluna da direita roubava a largura do nome */}
              <span className="flex flex-col-reverse items-start gap-2 pl-3 pt-3 sm:flex-row sm:items-center sm:gap-2.5 sm:pl-4 sm:pt-0">
                {podeOperar && (
                  <input type="checkbox" aria-label={`Selecionar ${l.nome}`} checked={marcados.has(l.id)} onChange={() => marcar(l.id)} className="h-4 w-4 accent-[rgb(var(--c-tinta))] [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5" />
                )}
                <span className="font-mono text-sm2 text-tinta tabnums" title={l.ultimo_contato_em ? `Último contato ${ha(l.ultimo_contato_em)}` : "Nunca acionado"}>
                  {l.ultimo_contato_em ? dataCurta(l.ultimo_contato_em) : "—"}
                </span>
              </span>
              <Link href={`/devedores/${l.id}`} className="linha-hover min-w-0 px-3 py-2.5 sm:px-4">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="line-clamp-2 font-700 text-texto [overflow-wrap:anywhere]" title={l.nome}>{l.nome}</span>
                  <span className="hidden text-meta text-lapis sm:inline">{l.carteira}</span>
                </span>
                <span className="mt-0.5 block text-sm2 text-lapis sm:hidden">
                  <span className="font-mono font-600 tabnums text-texto">{brl(l.saldo)}</span> · {l.carteira}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm2 text-lapis">
                  <span className="whitespace-nowrap font-mono">{mascararCPF(l.cpf)}</span>
                  {l.processo && <span className="hidden font-mono sm:inline">{l.processo}</span>}
                  <span className={cn("font-600", corSituacao(l.situacao))}>{ROTULO_SITUACAO[l.situacao] ?? l.situacao}</span>
                  {l.responsavel && <span>com {l.responsavel.split(" ")[0]}</span>}
                  {l.proximo && <span className="text-tinta">{l.proximo.tipo === "promessa" ? "Promessa" : "Retorno"} {dataCurta(l.proximo.quando)}</span>}
                </span>
              </Link>
              <span className="hidden pr-4 text-right font-mono text-[0.9375rem] tabnums sm:block">{brl(l.saldo)}</span>
            </li>
          ))}
        </ul>
      )}

      {total > porPagina && (
        <nav className="mt-4 flex items-center justify-between text-sm2" aria-label="Páginas">
          <span className="text-lapis">Mostrando {num(ini)}–{num(fim)} de {num(total)}</span>
          <span className="flex gap-2">
            {pagina > 1 && <Link href={href({ p: String(pagina - 1) })} className="rounded-controle border border-pauta-forte px-3 py-1.5 font-600 text-tinta hover:bg-tinta-clara">Anterior</Link>}
            {pagina < paginas && <Link href={href({ p: String(pagina + 1) })} className="rounded-controle border border-pauta-forte px-3 py-1.5 font-600 text-tinta hover:bg-tinta-clara">Próxima</Link>}
          </span>
        </nav>
      )}

      {podeOperar && marcados.size > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-4 lg:bottom-6">
          <div className="flex w-full max-w-[640px] flex-wrap items-center gap-2 rounded-painel border border-pauta bg-folha p-3 shadow-flutua animate-surgir">
            <span className="text-[0.9375rem] font-600">{contar(marcados.size, "selecionado", "selecionados")}</span>
            <Select value={alvo} onChange={(e) => setAlvo(e.target.value)} className="min-w-0 flex-1" aria-label="Atribuir a">
              <option value="">Atribuir a…</option>
              {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              <option value="ninguem">Ninguém (tirar responsável)</option>
            </Select>
            <Button onClick={atribuir} disabled={!alvo || gravando}>{gravando ? "Salvando…" : "Aplicar"}</Button>
            <Button variant="ghost" onClick={() => setMarcados(new Set())}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
