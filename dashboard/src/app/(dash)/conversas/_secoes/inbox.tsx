"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { brl, dataHoraBR } from "@/lib/utils";
import {
  Search, MessageSquareText, ExternalLink, FileText, ArrowLeft, RefreshCw,
  Bot, Headset, User, Cog, Loader2, FlaskConical, Smartphone, X, CornerDownRight,
} from "lucide-react";

type Conversa = {
  id: number;
  devedor_id: number;
  estado: string;
  motivo_encerramento: string | null;
  simulacao: boolean;
  ultima_msg_em: string | null;
  ultima_msg_de: string | null;
  chatwoot_id: number | null;
  chip_id: number | null;
  chip_nome: string | null;
  nome: string;
  cpf: string;
  saldo: number;
  status_cobranca: string;
  cidade: string | null;
  uf: string | null;
  carteira: string | null;
  preview: string | null;
  preview_de: string | null;
};

type Chip = { id: number; nome: string; numero: string | null };

type Msg = {
  id: number;
  direcao: string;
  origem: string;
  conteudo: string | null;
  criado_em: string;
};

// Estado da conversa. `ring`/`dot` desenham o estado no próprio avatar da linha — a lista
// fica legível na diagonal, sem uma fileira de badges competindo com o nome e a prévia.
const ESTADO: Record<string, { tone: any; label: string; ring: string; dot: string; texto: string }> = {
  aguardando_resposta: { tone: "blue",    label: "Aguardando",    ring: "ring-blue/35",    dot: "bg-blue",    texto: "text-blue" },
  bot_ativo:           { tone: "green",   label: "Respondeu",     ring: "ring-emerald/40", dot: "bg-emerald", texto: "text-emerald-soft" },
  humano:              { tone: "violet",  label: "Com humano",    ring: "ring-violet/40",  dot: "bg-violet",  texto: "text-violet" },
  pix_enviado:         { tone: "amber",   label: "Pix enviado",   ring: "ring-amber/40",   dot: "bg-amber",   texto: "text-amber" },
  pago:                { tone: "green",   label: "Pagamento confirmado", ring: "ring-emerald/50", dot: "bg-emerald", texto: "text-emerald-soft" },
  encerrada:           { tone: "neutral", label: "Outro encerramento",   ring: "ring-line",       dot: "bg-mist",    texto: "text-mist" },
  "encerrada:pessoa_errada": { tone: "rose",    label: "Pessoa errada",      ring: "ring-rose/40",  dot: "bg-rose",  texto: "text-rose" },
  "encerrada:sem_resposta":  { tone: "amber",   label: "Sem resposta",       ring: "ring-amber/40", dot: "bg-amber", texto: "text-amber" },
  "encerrada:outro":         { tone: "neutral", label: "Outro encerramento", ring: "ring-line",     dot: "bg-mist",  texto: "text-mist" },
  optout:              { tone: "rose",    label: "Pediu p/ parar", ring: "ring-rose/40",   dot: "bg-rose",    texto: "text-rose" },
};
const ESTADO_FALLBACK = { tone: "neutral" as any, label: "—", ring: "ring-line", dot: "bg-mist", texto: "text-mist" };
const chaveEstado = (c: Pick<Conversa, "estado" | "motivo_encerramento">) =>
  c.estado === "encerrada" ? `encerrada:${c.motivo_encerramento ?? "outro"}` : c.estado;
const estadoDe = (c: Pick<Conversa, "estado" | "motivo_encerramento">) => {
  const chave = chaveEstado(c);
  return ESTADO[chave] ?? ESTADO[c.estado] ?? { ...ESTADO_FALLBACK, label: c.estado };
};

const FILTROS: { v: string; label: string }[] = [
  { v: "", label: "Todas" },
  { v: "aguardando_resposta", label: "Aguardando" },
  { v: "bot_ativo", label: "Responderam" },
  { v: "humano", label: "Com humano" },
  { v: "encerrada:pessoa_errada", label: "Pessoa errada" },
  { v: "encerrada:sem_resposta", label: "Sem resposta" },
  { v: "encerrada:outro", label: "Outros" },
  { v: "optout", label: "Não perturbe" },
  { v: "pix_enviado", label: "Pix" },
  { v: "pago", label: "Pagaram" },
];

function relativo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIA_LONGO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" });

// Rótulo do separador de dia dentro da thread ("Hoje" / "Ontem" / "12 de agosto").
function rotuloDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const dias = Math.round(
    (new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000,
  );
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return DIA_LONGO.format(d);
}
const mesmoDia = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

const ORIGEM_META: Record<string, { Icon: any; label: string }> = {
  bot: { Icon: Bot, label: "Robô" },
  humano: { Icon: Headset, label: "Cobrador" },
  devedor: { Icon: User, label: "Contato" },
  sistema: { Icon: Cog, label: "Sistema" },
};

export function Inbox({ lista, chips, chipPadrao, cwUrl }: {
  lista: Conversa[]; chips: Chip[]; chipPadrao: number | null; cwUrl: string;
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  // Teste é a exceção, não o padrão: a caixa abre com a operação REAL. Quem está testando
  // liga o botão de propósito.
  const [verTestes, setVerTestes] = useState(false);
  // Abre já no número oficial que está conversando agora (ver Dialogos).
  const [chipFiltro, setChipFiltro] = useState<number | null>(chipPadrao);
  const [sel, setSel] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [noThreadMobile, setNoThreadMobile] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  // Base = o que sobra depois dos recortes de contexto (número + teste). Os contadores dos
  // filtros de estado saem daqui, então o número no botão é sempre o que ele vai mostrar.
  const base = useMemo(
    () => lista.filter((c) => {
      if (chipFiltro != null && c.chip_id !== chipFiltro) return false;
      if (!verTestes && c.simulacao) return false;
      return true;
    }),
    [lista, chipFiltro, verTestes],
  );

  const contagem = useMemo(() => {
    const m: Record<string, number> = { "": base.length };
    for (const c of base) {
      const chave = chaveEstado(c);
      m[chave] = (m[chave] ?? 0) + 1;
    }
    return m;
  }, [base]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return base.filter((c) => {
      if (filtro && chaveEstado(c) !== filtro) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        c.cpf.toLowerCase().includes(q) ||
        (c.preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [base, busca, filtro]);

  const atual = useMemo(() => lista.find((c) => c.id === sel) ?? null, [lista, sel]);

  // Mantém uma conversa aberta: se a seleção sumiu do recorte atual (trocou de número,
  // desligou os testes, mudou o filtro), cai na primeira da lista.
  useEffect(() => {
    if (sel != null && filtradas.some((c) => c.id === sel)) return;
    setSel(filtradas[0]?.id ?? null);
  }, [filtradas, sel]);

  async function carregar(convId: number, silent = false) {
    if (!silent) {
      setCarregando(true);
      setMsgs([]);
    }
    const { data } = await sb
      .from("mensagens")
      .select("id, direcao, origem, conteudo, criado_em")
      .eq("conversa_id", convId)
      .order("criado_em", { ascending: true })
      .limit(800);
    setMsgs((data as Msg[]) ?? []);
    setCarregando(false);
  }

  // Carrega ao trocar de conversa + polling + realtime (se publicado).
  useEffect(() => {
    if (sel == null) return;
    carregar(sel);
    const poll = setInterval(() => carregar(sel, true), 7000);
    const ch = sb
      .channel(`msgs-${sel}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `conversa_id=eq.${sel}` },
        (payload) => setMsgs((p) => [...p.filter((m) => m.id !== (payload.new as Msg).id), payload.new as Msg]),
      )
      .subscribe();
    return () => {
      clearInterval(poll);
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "auto" });
  }, [msgs.length, sel]);

  function abrir(id: number) {
    setSel(id);
    setNoThreadMobile(true);
  }

  const chipAtivo = chips.find((c) => c.id === chipFiltro) ?? null;

  return (
    <Card className="grid h-[calc(100dvh-210px)] min-h-[520px] grid-rows-[auto_1fr] gap-0 overflow-hidden p-0">
      {/* ───── Barra de contexto: de qual número é esta caixa, e se estamos vendo teste ───── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-ink-900/40 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald/10 text-emerald">
            <Smartphone className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-mist/70">Número</div>
            <div className="truncate text-xs font-medium text-chalk">
              {chipAtivo ? chipAtivo.nome : "Todos os números"}
              {chipAtivo?.numero && (
                <span className="ml-1.5 font-mono text-[11px] text-mist tabnums">{chipAtivo.numero}</span>
              )}
            </div>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex items-center gap-1 rounded-full border border-line bg-ink-850 p-0.5">
            {chips.map((c) => (
              <button
                key={c.id}
                onClick={() => setChipFiltro(c.id)}
                title={c.numero ?? c.nome}
                className={`max-w-[9rem] truncate rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  chipFiltro === c.id ? "bg-emerald/15 font-medium text-emerald-soft" : "text-mist hover:text-chalk"
                }`}
              >
                {c.nome}
              </button>
            ))}
            <button
              onClick={() => setChipFiltro(null)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                chipFiltro === null ? "bg-emerald/15 font-medium text-emerald-soft" : "text-mist hover:text-chalk"
              }`}
            >
              Todos
            </button>
          </div>
        )}

        <button
          onClick={() => setVerTestes((v) => !v)}
          title="Conversas do modo teste ficam fora da caixa por padrão"
          className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            verTestes
              ? "border-amber/40 bg-amber/10 text-amber"
              : "border-line text-mist hover:border-ink-500 hover:text-chalk"
          }`}
        >
          <FlaskConical className="h-3 w-3" />
          {verTestes ? "Mostrando testes" : "Testes ocultos"}
        </button>
      </div>

      <div className="grid min-h-0 grid-cols-1 grid-rows-[1fr] md:grid-cols-[340px_1fr]">
        {/* ───── Lista ───── */}
        <div className={`flex min-h-0 flex-col border-line md:border-r ${noThreadMobile ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome, CPF ou mensagem…"
                className="h-10 w-full rounded-xl border border-line bg-ink-850 pl-9 pr-9 text-sm text-chalk outline-none transition-colors placeholder:text-mist/60 focus:border-emerald/60"
              />
              {busca && (
                <button
                  onClick={() => setBusca("")}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mist hover:text-chalk"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FILTROS.map((f) => {
                const n = contagem[f.v] ?? 0;
                const ativo = filtro === f.v;
                if (n === 0 && !ativo && f.v) return null;
                return (
                  <button
                    key={f.v}
                    onClick={() => setFiltro(f.v)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      ativo
                        ? "border-emerald/40 bg-emerald/15 text-emerald-soft"
                        : "border-line text-mist hover:border-ink-500 hover:text-chalk"
                    }`}
                  >
                    {f.label}
                    <span className={`font-mono tabnums ${ativo ? "text-emerald-soft" : "text-mist/70"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtradas.length === 0 && (
              <div className="px-6 py-12 text-center">
                <MessageSquareText className="mx-auto mb-3 h-8 w-8 text-mist opacity-30" />
                <p className="text-sm text-mist">Nenhuma conversa encontrada.</p>
                {!verTestes && lista.some((c) => c.simulacao) && (
                  <button onClick={() => setVerTestes(true)} className="mt-2 text-xs text-emerald-soft underline">
                    Mostrar as conversas de teste
                  </button>
                )}
              </div>
            )}
            {filtradas.map((c) => {
              const e = estadoDe(c);
              const ativo = c.id === sel;
              return (
                <button
                  key={c.id}
                  onClick={() => abrir(c.id)}
                  className={`relative flex w-full items-start gap-3 border-b border-line/50 py-3 pl-3 pr-3 text-left transition-colors ${
                    ativo ? "bg-ink-800" : "hover:bg-ink-850"
                  }`}
                >
                  {/* espinha de seleção — marca a linha aberta sem alargar a lista */}
                  <span
                    className={`absolute inset-y-0 left-0 w-[3px] rounded-r bg-emerald transition-opacity ${
                      ativo ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <div
                    className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 font-display text-sm font-700 text-chalk ring-2 ${e.ring}`}
                  >
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium text-chalk">{c.nome}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-mist tabnums">
                        {relativo(c.ultima_msg_em)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-mist">
                      {c.preview_de && c.preview_de !== "devedor" && (
                        <CornerDownRight className="h-3 w-3 shrink-0 -scale-y-100 opacity-60" />
                      )}
                      <span className="truncate">
                        {c.preview ?? <span className="italic opacity-60">sem mensagens ainda</span>}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${e.texto}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />
                        {e.label}
                      </span>
                      {c.saldo > 0 && (
                        <span className="font-mono text-mist/70 tabnums">{brl(c.saldo)}</span>
                      )}
                      {c.simulacao && (
                        <span className="ml-auto rounded-full border border-amber/30 bg-amber/10 px-1.5 py-px font-medium text-amber">
                          teste
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ───── Thread ───── */}
        <div className={`flex min-h-0 min-w-0 flex-col ${noThreadMobile ? "flex" : "hidden md:flex"}`}>
          {!atual ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-mist">
              <div className="max-w-xs">
                <MessageSquareText className="mx-auto mb-3 h-10 w-10 opacity-25" />
                <p className="text-sm">Selecione uma conversa para ler o histórico completo do contato.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Cabeçalho */}
              <div className="border-b border-line">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    onClick={() => setNoThreadMobile(false)}
                    className="-ml-1 rounded-lg p-1.5 text-mist hover:bg-ink-800 md:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 font-display text-sm font-700 text-chalk ring-2 ${estadoDe(atual).ring}`}
                  >
                    {atual.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-chalk">{atual.nome}</span>
                      <Badge tone={estadoDe(atual).tone}>{estadoDe(atual).label}</Badge>
                      {atual.simulacao && <Badge tone="amber">Teste</Badge>}
                    </div>
                    <div className="truncate text-[11px] text-mist">
                      {atual.cpf && <span className="font-mono tabnums">{atual.cpf}</span>}
                      {atual.cidade && <span> · {atual.cidade}{atual.uf ? `/${atual.uf}` : ""}</span>}
                      {atual.chip_nome && <span> · por {atual.chip_nome}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => sel != null && carregar(sel)}
                      title="Atualizar"
                      className="rounded-lg border border-line p-2 text-mist transition-colors hover:border-ink-500 hover:text-chalk"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <Link href={`/devedores/${atual.devedor_id}`}>
                      <Button variant="outline" size="sm"><FileText className="h-3.5 w-3.5" /> Ficha</Button>
                    </Link>
                    {cwUrl && atual.chatwoot_id && (
                      <a href={`${cwUrl}/app/accounts/1/conversations/${atual.chatwoot_id}`} target="_blank" rel="noreferrer" className="hidden sm:block">
                        <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Chatwoot</Button>
                      </a>
                    )}
                  </div>
                </div>

                {/* Faixa de contexto: o operador lê a conversa sabendo quanto e de qual carteira */}
                {(atual.saldo > 0 || atual.carteira) && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line/60 bg-ink-900/40 px-3 py-1.5 text-[11px]">
                    {atual.saldo > 0 && (
                      <span className="text-mist">
                        Dívida <b className="ml-1 font-mono text-sm text-chalk tabnums">{brl(atual.saldo)}</b>
                      </span>
                    )}
                    {atual.carteira && <span className="text-mist">Carteira <b className="text-chalk">{atual.carteira}</b></span>}
                    {atual.status_cobranca && (
                      <span className="text-mist">Situação <b className="text-chalk">{atual.status_cobranca}</b></span>
                    )}
                  </div>
                )}
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto bg-ink-900/40 px-4 py-4">
                {carregando ? (
                  <div className="grid h-full place-items-center text-mist">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : msgs.length === 0 ? (
                  <p className="py-10 text-center text-sm text-mist">Ainda não há mensagens nesta conversa.</p>
                ) : (
                  <div className="mx-auto flex max-w-2xl flex-col gap-0.5">
                    {msgs.map((m, i) => {
                      const ant = msgs[i - 1];
                      const prox = msgs[i + 1];
                      const novoDia = !ant || !mesmoDia(ant.criado_em, m.criado_em);

                      if (m.origem === "sistema") {
                        return (
                          <div key={m.id}>
                            {novoDia && <SeparadorDia iso={m.criado_em} />}
                            <div className="my-1.5 flex justify-center">
                              <span className="rounded-full border border-line bg-ink-850 px-3 py-1 text-[11px] text-mist">
                                {m.conteudo} · {HORA.format(new Date(m.criado_em))}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      const doContato = m.origem === "devedor" || m.direcao === "entrada";
                      // Agrupa mensagens seguidas do mesmo lado (até 5 min): só a primeira ganha
                      // o canto "bico" e só a última mostra quem falou e quando.
                      const mesmaLinha = (o?: Msg) =>
                        !!o && o.origem === m.origem && o.origem !== "sistema" &&
                        mesmoDia(o.criado_em, m.criado_em) &&
                        Math.abs(new Date(o.criado_em).getTime() - new Date(m.criado_em).getTime()) < 5 * 60000;
                      const inicio = novoDia || !mesmaLinha(ant);
                      const fim = !mesmaLinha(prox);
                      const meta = ORIGEM_META[m.origem] ?? ORIGEM_META.sistema;
                      const Icon = meta.Icon;

                      return (
                        <div key={m.id}>
                          {novoDia && <SeparadorDia iso={m.criado_em} />}
                          <div className={`flex ${doContato ? "justify-start" : "justify-end"} ${inicio ? "mt-2" : ""}`}>
                            <div className="max-w-[82%] sm:max-w-[72%]">
                              <div
                                className={`whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                                  doContato
                                    ? `bg-ink-800 text-chalk ${inicio ? "rounded-2xl rounded-tl-md" : "rounded-2xl rounded-l-md"}`
                                    : m.origem === "humano"
                                      ? `bg-violet/15 text-chalk ring-1 ring-inset ring-violet/20 ${inicio ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-r-md"}`
                                      : `bg-emerald/12 text-chalk ring-1 ring-inset ring-emerald/20 ${inicio ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-r-md"}`
                                }`}
                              >
                                {m.conteudo}
                              </div>
                              {fim && (
                                <div
                                  className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-mist ${
                                    doContato ? "" : "justify-end"
                                  }`}
                                >
                                  <Icon className="h-3 w-3" />
                                  {meta.label}
                                  <span className="opacity-50">·</span>
                                  <span className="font-mono tabnums" title={dataHoraBR(m.criado_em)}>
                                    {HORA.format(new Date(m.criado_em))}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={fimRef} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Régua de dia entre blocos de mensagens — dá noção de tempo sem poluir cada balão. */
function SeparadorDia({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-mist">{rotuloDia(iso)}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
