"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Badge } from "@/components/ui/primitives";
import { BookOpen, Plus, Save, Trash2, Check, X, CircleAlert, Loader2 } from "lucide-react";

type Entrada = {
  id: number; pergunta: string; resposta: string; aprovado: boolean; ativo: boolean;
  carteira_id: number | null; aprovado_em: string | null;
};

/**
 * Base de conhecimento DA CARTEIRA (§33 · §35).
 *
 * Saiu da tela global do Robô e veio para cá porque a dúvida que aparece na conversa é sempre da
 * carteira: o que responder sobre a loja X não serve para o credor Y. Entradas antigas sem carteira
 * (valem para todas) continuam aparecendo, marcadas, para não sumirem do radar do operador.
 *
 * O que a tela protege é o gate de aprovação: uma resposta cadastrada NÃO chega ao devedor até
 * alguém aprovar, e qualquer edição derruba a aprovação de volta.
 */
export function ConhecimentoCarteira({ carteiraId, entradas }: { carteiraId: number; entradas: Entrada[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ pergunta: "", resposta: "" });
  const [editando, setEditando] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState<{ pergunta: string; resposta: string }>({ pergunta: "", resposta: "" });

  async function chamar(corpo: any) {
    setErro("");
    const r = await fetch("/api/conhecimento", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, carteira_id: carteiraId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(d.erro ?? "Falha ao salvar"); return false; }
    return true;
  }

  const agir = (corpo: any, depois?: () => void) => start(async () => {
    if (await chamar(corpo)) { depois?.(); router.refresh(); }
  });

  const pendentes = entradas.filter((e) => !e.aprovado).length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald/12 text-emerald">
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <h4 className="font-display text-base font-600 text-chalk">Respostas prontas desta carteira</h4>
            <p className="mt-0.5 max-w-2xl text-xs text-mist">
              Cadastre a dúvida que aparece com frequência e a resposta certa. Durante a conversa, o robô
              usa só o que está <b className="text-chalk">aprovado</b> — e, se você editar o texto depois,
              a aprovação cai e ele para de usar até alguém revisar de novo.
            </p>
          </div>
        </div>
        <Button onClick={() => setCriando((v) => !v)} disabled={pending}>
          <Plus className="h-4 w-4" /> Nova resposta
        </Button>
      </Card>

      {pendentes > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {pendentes} resposta(s) aguardando aprovação — o robô ainda não está usando.
        </div>
      )}

      {erro && <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">{erro}</div>}

      {criando && (
        <Card className="flex flex-col gap-3">
          <h4 className="font-display text-base font-600 text-chalk">Nova resposta</h4>
          <div>
            <Label>Pergunta ou situação</Label>
            <Input value={nova.pergunta} placeholder="Ex.: E se a pessoa perguntar se a dívida prescreveu?"
                   onChange={(e) => setNova({ ...nova, pergunta: e.target.value })} />
          </div>
          <div>
            <Label>Resposta que o robô deve dar</Label>
            <textarea
              value={nova.resposta}
              onChange={(e) => setNova({ ...nova, resposta: e.target.value })}
              rows={4}
              placeholder="Escreva uma resposta só, direta. Uma pergunta por cadastro deixa o robô mais preciso."
              className="w-full rounded-xl border border-line bg-ink-850 px-3 py-2 text-sm text-chalk outline-none placeholder:text-mist focus:border-emerald"
            />
          </div>
          <div className="flex gap-2">
            <Button
              disabled={pending || !nova.pergunta.trim() || !nova.resposta.trim()}
              onClick={() => agir({ acao: "criar", entrada: nova },
                () => { setCriando(false); setNova({ pergunta: "", resposta: "" }); })}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
            <Button variant="ghost" onClick={() => setCriando(false)} disabled={pending}>Cancelar</Button>
          </div>
        </Card>
      )}

      {entradas.length === 0 && !criando && (
        <Card><p className="py-6 text-center text-sm text-mist">Nenhuma resposta cadastrada ainda.</p></Card>
      )}

      {entradas.map((e) => (
        <Card key={e.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {editando === e.id ? (
                <Input value={rascunho.pergunta} onChange={(ev) => setRascunho({ ...rascunho, pergunta: ev.target.value })} />
              ) : (
                <h4 className="font-display text-base font-600 text-chalk">{e.pergunta}</h4>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {e.aprovado
                ? <Badge tone="green">Em uso</Badge>
                : <Badge tone="amber">Aguardando aprovação</Badge>}
              {e.carteira_id === null && <Badge tone="neutral">todas as carteiras</Badge>}
            </div>
          </div>

          {editando === e.id ? (
            <textarea
              value={rascunho.resposta}
              onChange={(ev) => setRascunho({ ...rascunho, resposta: ev.target.value })}
              rows={4}
              className="w-full rounded-xl border border-line bg-ink-850 px-3 py-2 text-sm text-chalk outline-none focus:border-emerald"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-mist">{e.resposta}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {editando === e.id ? (
              <>
                <Button size="sm" disabled={pending}
                        onClick={() => agir({ acao: "atualizar", id: e.id, patch: rascunho }, () => setEditando(null))}>
                  <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(null)} disabled={pending}>Cancelar</Button>
                <span className="text-[11px] text-amber">Salvar o texto derruba a aprovação.</span>
              </>
            ) : (
              <>
                {e.aprovado ? (
                  <Button size="sm" variant="ghost" disabled={pending}
                          onClick={() => agir({ acao: "reprovar", id: e.id })}>
                    <X className="h-3.5 w-3.5" /> Tirar de uso
                  </Button>
                ) : (
                  <Button size="sm" disabled={pending} onClick={() => agir({ acao: "aprovar", id: e.id })}>
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={pending}
                        onClick={() => { setEditando(e.id); setRascunho({ pergunta: e.pergunta, resposta: e.resposta }); }}>
                  Editar
                </Button>
                <button
                  type="button"
                  onClick={() => agir({ acao: "excluir", id: e.id })}
                  disabled={pending}
                  className="ml-auto flex items-center gap-1.5 text-xs text-mist transition-colors hover:text-rose"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
