"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, Badge, Button, Input, Label } from "@/components/ui/primitives";
import { brl, dataHoraBR } from "@/lib/utils";
import {
  Headset, ChevronDown, ChevronUp, User, Smartphone, MessageSquare, HandCoins,
  CheckCircle2, XCircle, Loader2, ExternalLink, Clock,
} from "lucide-react";

const STATUS: Record<string, { tone: any; label: string }> = {
  aberta: { tone: "amber", label: "Aberta" },
  em_atendimento: { tone: "blue", label: "Em atendimento" },
  fechada_acordo: { tone: "green", label: "Fechada — acordo" },
  fechada_paga: { tone: "green", label: "Fechada — paga" },
  fechada_sem_acordo: { tone: "neutral", label: "Fechada — sem acordo" },
};

const FILTROS = [
  { k: "abertas", t: "Em aberto" },
  { k: "todas", t: "Todas" },
  { k: "fechadas", t: "Fechadas" },
] as const;

export function EscalacoesLista({ inicial }: { inicial: any[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]["k"]>("abertas");

  // realtime: qualquer mudança recarrega os dados do servidor (mantém os joins)
  React.useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("escalacoes-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "escalacoes" }, () => router.refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [router]);

  const aberta = (s: string) => s === "aberta" || s === "em_atendimento";
  const itens = inicial.filter((e) =>
    filtro === "todas" ? true : filtro === "abertas" ? aberta(e.status) : !aberta(e.status),
  );

  const nAbertas = inicial.filter((e) => aberta(e.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${filtro === f.k ? "border-emerald/50 bg-emerald/10 text-emerald-soft" : "border-line text-mist hover:text-chalk"}`}>
            {f.t}
          </button>
        ))}
        {nAbertas > 0 && <Badge tone="amber"><Clock className="h-3.5 w-3.5" /> {nAbertas} aguardando atendimento</Badge>}
      </div>

      {itens.length === 0 && (
        <Card className="py-10 text-center text-sm text-mist">
          <Headset className="mx-auto mb-2 h-6 w-6 text-mist" />
          Nenhuma escalação {filtro === "abertas" ? "em aberto" : filtro === "fechadas" ? "fechada" : ""}.
        </Card>
      )}

      {itens.map((e) => <ItemEscalacao key={e.id} e={e} />)}
    </div>
  );
}

function ItemEscalacao({ e }: { e: any }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [pend, setPend] = React.useState(false);
  const [fechando, setFechando] = React.useState<"acordo" | null>(null);
  const [valor, setValor] = React.useState("");
  const [obs, setObs] = React.useState("");

  const st = STATUS[e.status] ?? STATUS.aberta;
  const aberta = e.status === "aberta" || e.status === "em_atendimento";
  const hist = e.contexto_snapshot?.historico ?? [];

  async function atualizar(body: any) {
    setPend(true);
    await fetch(`/api/escalacoes/${e.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setPend(false); setFechando(null); router.refresh();
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber/12 text-amber">
            <Headset className="h-4 w-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-chalk">{e.devedores?.nome ?? `Devedor #${e.devedor_id}`}</span>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-mist">
              Motivo: <span className="text-chalk">{e.motivo ?? "—"}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mist">
              {e.carteiras?.nome && <span>Carteira: {e.carteiras.nome}</span>}
              <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> {e.chips?.nome ?? "chip removido"}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {dataHoraBR(e.criado_em)}</span>
              {e.assumido_por && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {e.assumido_por}</span>}
              {e.atendente_numero && <span className="inline-flex items-center gap-1 text-violet"><Smartphone className="h-3 w-3" /> cobrador: {e.atendente_numero}</span>}
            </div>
          </div>
        </div>
        <button onClick={() => setAberto((v) => !v)} className="shrink-0 rounded-lg p-1.5 text-mist hover:bg-ink-800 hover:text-chalk">
          {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* resumo para o atendente se situar rápido */}
      {e.resumo && (
        <div className="rounded-lg border border-violet/25 bg-violet/5 px-3 py-2 text-xs text-mist">
          <span className="font-medium text-violet">Resumo p/ o atendente:</span> {e.resumo}
        </div>
      )}

      {/* desfecho registrado */}
      {(e.pagamentos || e.valor_combinado || e.observacao) && (
        <div className="rounded-lg border border-line bg-ink-850 px-3 py-2 text-xs">
          {e.pagamentos && (
            <div className="flex items-center gap-1.5 text-emerald-soft">
              <HandCoins className="h-3.5 w-3.5" /> Pago via Pix: {brl(e.pagamentos.valor)} ({e.pagamentos.status})
            </div>
          )}
          {e.valor_combinado != null && <div className="text-mist">Valor combinado: <span className="text-chalk">{brl(e.valor_combinado)}</span></div>}
          {e.observacao && <div className="mt-0.5 text-mist">Obs.: {e.observacao}</div>}
        </div>
      )}

      {/* ações */}
      {aberta && (
        <div className="flex flex-wrap items-center gap-2">
          {e.status === "aberta" && (
            <Button variant="outline" size="sm" onClick={() => atualizar({ status: "em_atendimento" })} disabled={pend}>
              <User className="h-4 w-4" /> Assumir
            </Button>
          )}
          <Button size="sm" onClick={() => setFechando(fechando ? null : "acordo")} disabled={pend}>
            <CheckCircle2 className="h-4 w-4" /> Fechar com acordo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => atualizar({ status: "fechada_sem_acordo" })} disabled={pend}>
            <XCircle className="h-4 w-4" /> Sem acordo
          </Button>
          {pend && <Loader2 className="h-4 w-4 animate-spin text-mist" />}
        </div>
      )}

      {/* form de fechamento com acordo */}
      {fechando === "acordo" && (
        <div className="grid gap-2 rounded-lg border border-emerald/30 bg-emerald/5 p-3 sm:grid-cols-[1fr_2fr_auto]">
          <div>
            <Label className="text-xs">Valor combinado (opcional)</Label>
            <Input type="number" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$" />
          </div>
          <div>
            <Label className="text-xs">Observação (visível para o dono)</Label>
            <Input value={obs} onChange={(ev) => setObs(ev.target.value)} placeholder="Como ficou o acordo…" />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={() => atualizar({ status: "fechada_acordo", valor_combinado: valor, observacao: obs })} disabled={pend}>
              Confirmar
            </Button>
          </div>
        </div>
      )}

      {/* contexto / histórico */}
      {aberto && (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-chalk"><MessageSquare className="h-3.5 w-3.5" /> Contexto no momento da escala</span>
            <Link href={`/devedores/${e.devedor_id}`} className="inline-flex items-center gap-1 text-xs text-emerald hover:underline">
              Abrir devedor <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {hist.length === 0 ? (
            <p className="text-xs text-mist">Sem histórico capturado.</p>
          ) : (
            <div className="space-y-1.5">
              {hist.map((m: any, i: number) => (
                <div key={i} className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${m.direcao === "entrada" ? "bg-ink-800 text-chalk" : "ml-auto bg-emerald/10 text-emerald-soft"}`}>
                  <span className="mr-1 text-[10px] uppercase tracking-wide text-mist">{m.origem}</span>
                  {m.conteudo}
                </div>
              ))}
              {e.contexto_snapshot?.mensagem && (
                <div className="max-w-[85%] rounded-lg bg-amber/10 px-3 py-1.5 text-xs text-amber">
                  <span className="mr-1 text-[10px] uppercase tracking-wide">última</span>
                  {e.contexto_snapshot.mensagem}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
