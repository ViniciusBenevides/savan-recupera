"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { brl, dataHoraBR } from "@/lib/utils";
import {
  Search, MessageSquareText, ExternalLink, FileText, ArrowLeft, RefreshCw,
  Bot, Headset, User, Cog, Loader2, FlaskConical,
} from "lucide-react";

type Conversa = {
  id: number;
  devedor_id: number;
  estado: string;
  simulacao: boolean;
  ultima_msg_em: string | null;
  ultima_msg_de: string | null;
  chatwoot_id: number | null;
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

type Msg = {
  id: number;
  direcao: string;
  origem: string;
  conteudo: string | null;
  criado_em: string;
};

const ESTADO: Record<string, { tone: any; label: string }> = {
  aguardando_resposta: { tone: "blue", label: "Aguardando" },
  bot_ativo: { tone: "green", label: "Respondeu" },
  humano: { tone: "violet", label: "Com humano" },
  pix_enviado: { tone: "amber", label: "Pix enviado" },
  pago: { tone: "green", label: "Pagou" },
  encerrada: { tone: "neutral", label: "Encerrada" },
  optout: { tone: "rose", label: "Pediu p/ parar" },
};

const FILTROS: { v: string; label: string }[] = [
  { v: "", label: "Todas" },
  { v: "aguardando_resposta", label: "Aguardando" },
  { v: "bot_ativo", label: "Responderam" },
  { v: "humano", label: "Com humano" },
  { v: "pix_enviado", label: "Pix" },
  { v: "pago", label: "Pagaram" },
];

function relativo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `há ${d} d`;
  return dataHoraBR(iso);
}

const ORIGEM_META: Record<string, { Icon: any; label: string }> = {
  bot: { Icon: Bot, label: "Robô" },
  humano: { Icon: Headset, label: "Cobrador" },
  devedor: { Icon: User, label: "Contato" },
  sistema: { Icon: Cog, label: "Sistema" },
};

export function Inbox({ lista, cwUrl }: { lista: Conversa[]; cwUrl: string }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [verTestes, setVerTestes] = useState(true);
  const [sel, setSel] = useState<number | null>(lista[0]?.id ?? null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [noThreadMobile, setNoThreadMobile] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((c) => {
      if (filtro && c.estado !== filtro) return false;
      if (!verTestes && c.simulacao) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        c.cpf.toLowerCase().includes(q) ||
        (c.preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [lista, busca, filtro, verTestes]);

  const atual = useMemo(() => lista.find((c) => c.id === sel) ?? null, [lista, sel]);

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

  return (
    <Card className="grid h-[calc(100dvh-200px)] grid-cols-1 grid-rows-[1fr] gap-0 overflow-hidden p-0 md:grid-cols-[340px_1fr]">
      {/* ───── Lista ───── */}
      <div className={`flex min-h-0 flex-col border-line md:border-r ${noThreadMobile ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, CPF ou mensagem…"
              className="h-10 w-full rounded-xl border border-line bg-ink-850 pl-9 pr-3 text-sm text-chalk outline-none placeholder:text-mist/60 focus:border-emerald/60"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.v}
                onClick={() => setFiltro(f.v)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  filtro === f.v
                    ? "border-emerald/40 bg-emerald/15 text-emerald-soft"
                    : "border-line text-mist hover:text-chalk"
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setVerTestes((v) => !v)}
              title="Mostrar/ocultar conversas de teste"
              className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                verTestes ? "border-amber/40 bg-amber/10 text-amber" : "border-line text-mist hover:text-chalk"
              }`}
            >
              <FlaskConical className="h-3 w-3" /> testes
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtradas.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-mist">Nenhuma conversa encontrada.</p>
          )}
          {filtradas.map((c) => {
            const e = ESTADO[c.estado] ?? { tone: "neutral", label: c.estado };
            const ativo = c.id === sel;
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={`flex w-full items-start gap-3 border-b border-line/50 px-3 py-3 text-left transition-colors ${
                  ativo ? "bg-ink-800" : "hover:bg-ink-850"
                }`}
              >
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald/12 font-display text-sm font-700 text-emerald">
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-chalk">{c.nome}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-mist">{relativo(c.ultima_msg_em)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-mist">
                    {c.preview_de === "devedor" ? "" : c.preview_de ? "» " : ""}
                    {c.preview ?? <span className="italic opacity-60">sem mensagens ainda</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge tone={e.tone}>{e.label}</Badge>
                    {c.simulacao && <Badge tone="amber">Teste</Badge>}
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
          <div className="grid flex-1 place-items-center text-center text-mist">
            <div>
              <MessageSquareText className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Selecione uma conversa para ler o histórico.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 border-b border-line p-3">
              <button onClick={() => setNoThreadMobile(false)} className="rounded-lg p-1.5 text-mist hover:bg-ink-800 md:hidden">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald/12 font-display text-sm font-700 text-emerald">
                {atual.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-chalk">{atual.nome}</span>
                  {atual.simulacao && <Badge tone="amber">Teste</Badge>}
                </div>
                <div className="truncate text-[11px] text-mist">
                  {atual.cpf && <span className="font-mono">{atual.cpf}</span>}
                  {atual.saldo > 0 && <span> · dívida {brl(atual.saldo)}</span>}
                  {atual.carteira && <span> · {atual.carteira}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => sel != null && carregar(sel)}
                  title="Atualizar"
                  className="rounded-lg border border-line p-2 text-mist hover:border-ink-500 hover:text-chalk"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <Link href={`/devedores/${atual.devedor_id}`}>
                  <Button variant="outline" size="sm"><FileText className="h-3.5 w-3.5" /> Ficha</Button>
                </Link>
                {cwUrl && atual.chatwoot_id && (
                  <a href={`${cwUrl}/app/accounts/1/conversations/${atual.chatwoot_id}`} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Chatwoot</Button>
                  </a>
                )}
              </div>
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
                <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
                  {msgs.map((m) => {
                    if (m.origem === "sistema") {
                      return (
                        <div key={m.id} className="my-1 flex justify-center">
                          <span className="rounded-full bg-ink-800 px-3 py-1 text-[11px] text-mist">
                            {m.conteudo} · {dataHoraBR(m.criado_em)}
                          </span>
                        </div>
                      );
                    }
                    const doContato = m.origem === "devedor" || m.direcao === "entrada";
                    const meta = ORIGEM_META[m.origem] ?? ORIGEM_META.sistema;
                    const Icon = meta.Icon;
                    return (
                      <div key={m.id} className={`flex ${doContato ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] ${doContato ? "" : "items-end"}`}>
                          <div
                            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                              doContato
                                ? "rounded-tl-sm bg-ink-800 text-chalk"
                                : m.origem === "humano"
                                  ? "rounded-tr-sm bg-violet/15 text-chalk"
                                  : "rounded-tr-sm bg-emerald/15 text-chalk"
                            }`}
                          >
                            {m.conteudo}
                          </div>
                          <div className={`mt-1 flex items-center gap-1 text-[10px] text-mist ${doContato ? "" : "justify-end"}`}>
                            <Icon className="h-3 w-3" />
                            {meta.label} · {dataHoraBR(m.criado_em)}
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
    </Card>
  );
}
