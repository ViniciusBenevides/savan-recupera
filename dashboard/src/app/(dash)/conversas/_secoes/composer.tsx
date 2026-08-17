"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import {
  Send, Loader2, StickyNote, MessageSquareText, FileText, Clock, AlertTriangle,
  ChevronDown, Zap, X, Check,
} from "lucide-react";

export type Modelo = {
  name: string; language: string; category: string; texto: string; variaveis: number;
};
export type RespostaPronta = { id: number; atalho: string; conteudo: string };

export type Atendimento = {
  ok: boolean;
  estado: string;
  ligada_ao_chatwoot: boolean;
  na_janela: boolean;
  ultima_entrada_em: string | null;
  janela_expira_em: string | null;
  modelos: Modelo[];
  respostas_prontas: RespostaPronta[];
};

/** "faltam 3 h 20 min" — o operador precisa saber se dá tempo de escrever à mão. */
function restante(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "encerrada";
  const h = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${min} min` : `${min} min`;
}

export function Composer({ conversaId, bloqueio, onEnviado }: {
  conversaId: number;
  /** Motivo pelo qual esta conversa não aceita mensagem (opt-out, pessoa errada). */
  bloqueio: string | null;
  onEnviado: () => void;
}) {
  const [atd, setAtd] = useState<Atendimento | null>(null);
  const [modo, setModo] = useState<"resposta" | "nota">("resposta");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painelModelo, setPainelModelo] = useState(false);
  const [modeloSel, setModeloSel] = useState<Modelo | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Recarrega ao trocar de conversa. A janela de 24h expira sozinha, então também revisamos de
  // minuto em minuto — senão a caixa continuaria oferecendo texto livre depois de fechar.
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/conversas/${conversaId}/atendimento`);
      const d = await r.json();
      if (d?.ok) setAtd(d as Atendimento);
      else setAtd(null);
    } catch { setAtd(null); }
  }, [conversaId]);

  useEffect(() => {
    setTexto("");
    setErro(null);
    setModo("resposta");
    setPainelModelo(false);
    setModeloSel(null);
    setAtd(null);
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  // Textarea que cresce com o texto, até um teto — igual às caixas de mensageiro.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [texto]);

  const foraDaJanela = !!atd && !atd.na_janela;
  const exigeModelo = modo === "resposta" && foraDaJanela;

  // "/" no começo da caixa abre as respostas prontas, como no Chatwoot.
  const sugestoes = useMemo(() => {
    if (modo !== "resposta" || !texto.startsWith("/")) return [];
    const q = texto.slice(1).toLowerCase();
    return (atd?.respostas_prontas ?? [])
      .filter((r) => !q || r.atalho.toLowerCase().includes(q) || r.conteudo.toLowerCase().includes(q))
      .slice(0, 6);
  }, [texto, modo, atd]);

  async function enviar(corpo: Record<string, unknown>) {
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/conversas/${conversaId}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        setErro(d?.erro ?? "Não foi possível enviar.");
        // Um 409 de janela quer dizer que o relógio virou entre a checagem e o envio.
        if (d?.motivo === "fora_da_janela") carregar();
        return false;
      }
      setTexto("");
      setModeloSel(null);
      setPainelModelo(false);
      onEnviado();
      carregar();
      return true;
    } catch (e) {
      setErro(String(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  function enviarTexto() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    enviar({ conteudo, privado: modo === "nota" });
  }

  function enviarModelo() {
    if (!modeloSel || enviando) return;
    enviar({
      modelo: { name: modeloSel.name, language: modeloSel.language, params },
    });
  }

  // ── Conversa que não aceita mensagem (opt-out, número de outra pessoa) ────────────────────
  if (bloqueio) {
    return (
      <div className="flex items-start gap-2.5 border-t border-line bg-rose/5 px-4 py-3 text-xs text-rose">
        <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
        <span>{bloqueio}</span>
      </div>
    );
  }

  if (atd && !atd.ligada_ao_chatwoot) {
    return (
      <div className="flex items-start gap-2.5 border-t border-line bg-ink-850 px-4 py-3 text-xs text-mist">
        <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber" />
        <span>Esta conversa ainda não está ligada ao WhatsApp oficial — não há por onde responder.</span>
      </div>
    );
  }

  return (
    <div className="border-t border-line bg-ink-900/60">
      {/* ── Abas: resposta ao contato × nota interna ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pt-2">
        <button
          onClick={() => setModo("resposta")}
          className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-[11px] transition-colors ${
            modo === "resposta" ? "bg-ink-850 font-medium text-chalk" : "text-mist hover:text-chalk"
          }`}
        >
          <MessageSquareText className="h-3.5 w-3.5" /> Responder
        </button>
        <button
          onClick={() => setModo("nota")}
          className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-[11px] transition-colors ${
            modo === "nota" ? "bg-amber/10 font-medium text-amber" : "text-mist hover:text-chalk"
          }`}
        >
          <StickyNote className="h-3.5 w-3.5" /> Nota interna
        </button>

        {atd && modo === "resposta" && (
          <span
            className={`ml-auto inline-flex items-center gap-1.5 text-[10px] ${
              foraDaJanela ? "text-amber" : "text-mist"
            }`}
            title="O WhatsApp só aceita texto livre até 24 h depois da última mensagem do contato."
          >
            <Clock className="h-3 w-3" />
            {foraDaJanela ? "Janela de 24 h fechada" : `Janela aberta · ${restante(atd.janela_expira_em)}`}
          </span>
        )}
      </div>

      {/* ── Fora da janela: só modelo aprovado ───────────────────────────────────────────── */}
      {exigeModelo && (
        <div className="mx-3 mt-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2">
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Passaram-se mais de 24 h desde a última mensagem desta pessoa. O WhatsApp só entrega{" "}
              <b>modelo aprovado pela Meta</b> agora — o texto livre volta assim que ela responder.
            </span>
          </div>
        </div>
      )}

      {/* ── Escolha do modelo ────────────────────────────────────────────────────────────── */}
      {modo === "resposta" && (painelModelo || exigeModelo) && (
        <PainelModelo
          modelos={atd?.modelos ?? []}
          selecionado={modeloSel}
          params={params}
          onSelecionar={(m) => {
            setModeloSel(m);
            setParams(Array.from({ length: m.variaveis }, () => ""));
          }}
          onParams={setParams}
          onFechar={exigeModelo ? null : () => { setPainelModelo(false); setModeloSel(null); }}
        />
      )}

      {/* ── Respostas prontas ("/") ──────────────────────────────────────────────────────── */}
      {sugestoes.length > 0 && (
        <div className="mx-3 mt-2 overflow-hidden rounded-lg border border-line bg-ink-850">
          {sugestoes.map((s) => (
            <button
              key={s.id}
              onClick={() => { setTexto(s.conteudo); areaRef.current?.focus(); }}
              className="flex w-full items-start gap-2 border-b border-line/50 px-3 py-2 text-left last:border-0 hover:bg-ink-800"
            >
              <Zap className="mt-0.5 h-3 w-3 shrink-0 text-emerald" />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-chalk">/{s.atalho}</span>
                <span className="block truncate text-[11px] text-mist">{s.conteudo}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Caixa de texto ───────────────────────────────────────────────────────────────── */}
      {!exigeModelo && (
        <div className="px-3 pb-3 pt-2">
          <div
            className={`rounded-xl border bg-ink-850 transition-colors focus-within:border-emerald/60 ${
              modo === "nota" ? "border-amber/30" : "border-line"
            }`}
          >
            <textarea
              ref={areaRef}
              rows={1}
              value={texto}
              disabled={enviando}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviarTexto();
                }
              }}
              placeholder={
                modo === "nota"
                  ? "Anotação para a equipe — o contato não vê."
                  : "Escreva a resposta…  (Enter envia, Shift+Enter quebra linha, / abre respostas prontas)"
              }
              className="max-h-[180px] w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-relaxed text-chalk outline-none placeholder:text-mist/60"
            />
            <div className="flex items-center justify-between gap-2 border-t border-line/50 px-2.5 py-1.5">
              <div className="flex items-center gap-1">
                {modo === "resposta" && (atd?.modelos.length ?? 0) > 0 && (
                  <button
                    onClick={() => setPainelModelo((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-mist transition-colors hover:bg-ink-800 hover:text-chalk"
                  >
                    <FileText className="h-3.5 w-3.5" /> Modelo aprovado
                  </button>
                )}
                <span className="px-1 text-[10px] text-mist/60">
                  {modo === "nota" ? "Só a equipe vê" : "Vai para o WhatsApp da pessoa"}
                </span>
              </div>
              <Button
                size="sm"
                variant={modo === "nota" ? "outline" : "primary"}
                onClick={enviarTexto}
                disabled={enviando || !texto.trim()}
              >
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {modo === "nota" ? "Anotar" : "Enviar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Envio do modelo ──────────────────────────────────────────────────────────────── */}
      {modo === "resposta" && modeloSel && (
        <div className="flex items-center justify-end gap-2 px-3 pb-3">
          <Button
            size="sm"
            onClick={enviarModelo}
            disabled={enviando || params.some((p) => !p.trim())}
          >
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar modelo
          </Button>
        </div>
      )}

      {erro && (
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-[11px] text-rose">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}

/** Lista de modelos aprovados + os campos de cada `{{n}}` e a prévia do texto final. */
function PainelModelo({ modelos, selecionado, params, onSelecionar, onParams, onFechar }: {
  modelos: Modelo[];
  selecionado: Modelo | null;
  params: string[];
  onSelecionar: (m: Modelo) => void;
  onParams: (p: string[]) => void;
  onFechar: (() => void) | null;
}) {
  const [aberto, setAberto] = useState(!selecionado);

  const previa = useMemo(() => {
    if (!selecionado) return "";
    let t = selecionado.texto;
    params.forEach((p, i) => { t = t.replaceAll(`{{${i + 1}}}`, p || `{{${i + 1}}}`); });
    return t;
  }, [selecionado, params]);

  if (modelos.length === 0) {
    return (
      <div className="mx-3 mt-2 rounded-lg border border-line bg-ink-850 px-3 py-2 text-[11px] text-mist">
        Nenhum modelo aprovado disponível. Crie e aprove um em <b className="text-chalk">Ajustes › Integrações</b>.
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-line bg-ink-850">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-mist" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-chalk">
          {selecionado ? selecionado.name : "Escolher modelo aprovado"}
          {selecionado && <span className="ml-1.5 text-mist">· {selecionado.language}</span>}
        </span>
        {onFechar && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onFechar(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onFechar(); } }}
            className="rounded p-0.5 text-mist hover:text-chalk"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-mist transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="max-h-52 overflow-y-auto border-t border-line/60">
          {modelos.map((m) => (
            <button
              key={`${m.name}-${m.language}`}
              onClick={() => { onSelecionar(m); setAberto(false); }}
              className="flex w-full items-start gap-2 border-b border-line/40 px-3 py-2 text-left last:border-0 hover:bg-ink-800"
            >
              {selecionado?.name === m.name && selecionado?.language === m.language
                ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald" />
                : <span className="mt-0.5 h-3 w-3 shrink-0" />}
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-chalk">
                  {m.name}
                  <span className="ml-1.5 font-normal text-mist">{m.category.toLowerCase()} · {m.language}</span>
                </span>
                <span className="block line-clamp-2 text-[11px] text-mist">{m.texto}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selecionado && (
        <div className="space-y-2 border-t border-line/60 px-3 py-2.5">
          {selecionado.variaveis > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: selecionado.variaveis }, (_, i) => (
                <label key={i} className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-mist">
                    Valor {`{{${i + 1}}}`}
                  </span>
                  <input
                    value={params[i] ?? ""}
                    onChange={(e) => {
                      const p = [...params];
                      p[i] = e.target.value;
                      onParams(p);
                    }}
                    className="h-8 w-full rounded-lg border border-line bg-ink-900 px-2.5 text-xs text-chalk outline-none focus:border-emerald/60"
                  />
                </label>
              ))}
            </div>
          )}
          <div className="rounded-lg bg-ink-900 px-3 py-2 text-xs leading-relaxed text-chalk">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-mist">Vai chegar assim</span>
            <span className="whitespace-pre-wrap">{previa}</span>
          </div>
        </div>
      )}
    </div>
  );
}
