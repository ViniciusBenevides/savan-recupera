"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Badge, Textarea, Switch, HelpHint } from "@/components/ui/primitives";
import { BookOpen, Plus, Save, Trash2, Check, X, CircleAlert, Loader2, SlidersHorizontal, ChevronDown } from "lucide-react";

type Entrada = {
  id: number; pergunta: string; resposta: string; aprovado: boolean; ativo: boolean;
  carteira_id: number | null; aprovado_em: string | null;
};

function DiretrizesELimites({ carteira, padrao }: { carteira: any; padrao: Record<string, any> }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const over = carteira.config_override ?? {};
  const guardrailsBase = carteira.guardrails ?? padrao.bot_guardrails ?? {};
  const descontosBase = over.faixas_desconto ?? padrao.faixas_desconto ?? { faixas: [], valor_minimo_pix: 30, margem_extra_pp: 10 };

  const [persona, setPersona] = useState(carteira.prompt_persona ?? padrao.bot_persona ?? "");
  const [contexto, setContexto] = useState(carteira.contexto_negocio ?? padrao.bot_contexto ?? "");
  const [nuncaCitar, setNuncaCitar] = useState((guardrailsBase.nunca_citar ?? []).join(", "));
  const [confirmarId, setConfirmarId] = useState(guardrailsBase.confirmar_identidade !== false);
  const [tom, setTom] = useState(guardrailsBase.tom ?? "");
  const [regrasExtras, setRegrasExtras] = useState(guardrailsBase.regras_extras ?? "");
  const [faixas, setFaixas] = useState<{ idade_min: number; pct: number }[]>(descontosBase.faixas ?? []);
  const [minPix, setMinPix] = useState(descontosBase.valor_minimo_pix ?? 30);
  const [margem, setMargem] = useState(descontosBase.margem_extra_pp ?? 10);
  const [validade, setValidade] = useState(over.validade_proposta_dias ?? padrao.validade_proposta_dias ?? 7);

  async function salvar() {
    setSalvando(true); setMensagem("");
    const guardrails = {
      ...guardrailsBase,
      nunca_citar: nuncaCitar.split(",").map((item: string) => item.trim()).filter(Boolean),
      confirmar_identidade: confirmarId,
      tom,
      regras_extras: regrasExtras,
    };
    const config_override = {
      ...over,
      faixas_desconto: { faixas, valor_minimo_pix: Number(minPix), margem_extra_pp: Number(margem) },
      validade_proposta_dias: Number(validade),
    };
    const resposta = await fetch(`/api/carteiras/${carteira.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_persona: persona, contexto_negocio: contexto, guardrails, config_override }),
    });
    const dados = await resposta.json().catch(() => ({}));
    setSalvando(false);
    if (!resposta.ok) { setMensagem(dados.erro ?? "Não foi possível salvar."); return; }
    setMensagem("Diretrizes salvas.");
    router.refresh();
  }

  function alterarFaixa(indice: number, campo: "idade_min" | "pct", valor: number) {
    setFaixas((atuais) => atuais.map((faixa, i) => i === indice ? { ...faixa, [campo]: valor } : faixa));
  }

  return (
    <Card className="p-0">
      <button type="button" onClick={() => setAberto((valor) => !valor)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet/12 text-violet"><SlidersHorizontal className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-600 text-chalk">Diretrizes e limites do robô</span>
          <span className="block text-xs text-mist">Identidade, regras de segurança e política de desconto desta carteira.</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-mist transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="grid gap-5 border-t border-line p-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div><Label>Persona e objetivo</Label><Textarea rows={3} value={persona} onChange={(e) => setPersona(e.target.value)} /></div>
            <div><Label>Contexto do negócio</Label><Textarea rows={3} value={contexto} onChange={(e) => setContexto(e.target.value)} /></div>
            <div><Label className="flex items-center gap-1.5">Nunca citar <HelpHint text="Separe termos proibidos por vírgula." /></Label><Input value={nuncaCitar} onChange={(e) => setNuncaCitar(e.target.value)} placeholder="Serasa, SPC, processo judicial" /></div>
            <div><Label>Tom da conversa</Label><Input value={tom} onChange={(e) => setTom(e.target.value)} placeholder="Humano, direto e acolhedor" /></div>
            <div><Label>Regras adicionais</Label><Textarea rows={3} value={regrasExtras} onChange={(e) => setRegrasExtras(e.target.value)} placeholder="Orientações específicas desta carteira" /></div>
            <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3.5 py-3">
              <span className="text-sm text-chalk">Confirmar identidade antes de revelar a dívida</span>
              <Switch checked={confirmarId} onChange={setConfirmarId} />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0">Faixas de desconto por idade da dívida</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setFaixas((atuais) => [...atuais, { idade_min: 1, pct: 10 }])}><Plus className="h-3.5 w-3.5" /> Faixa</Button>
              </div>
              <div className="space-y-2">
                {faixas.map((faixa, indice) => (
                  <div key={indice} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-xl border border-line bg-ink-850 p-2.5 text-xs text-mist">
                    <Input type="number" value={faixa.idade_min} onChange={(e) => alterarFaixa(indice, "idade_min", Number(e.target.value))} />
                    <span>anos →</span>
                    <Input type="number" value={faixa.pct} onChange={(e) => alterarFaixa(indice, "pct", Number(e.target.value))} />
                    <button type="button" onClick={() => setFaixas((atuais) => atuais.filter((_, i) => i !== indice))} className="p-2 text-mist hover:text-rose"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {faixas.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-mist">Nenhuma faixa específica.</p>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Pix mínimo</Label><Input type="number" value={minPix} onChange={(e) => setMinPix(Number(e.target.value))} /></div>
              <div><Label>Margem extra (pp)</Label><Input type="number" value={margem} onChange={(e) => setMargem(Number(e.target.value))} /></div>
              <div><Label>Validade (dias)</Label><Input type="number" value={validade} onChange={(e) => setValidade(Number(e.target.value))} /></div>
            </div>
          </div>
          <div className="flex items-center gap-3 xl:col-span-2">
            <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar diretrizes</Button>
            {mensagem && <span className={`text-xs ${mensagem === "Diretrizes salvas." ? "text-emerald" : "text-rose"}`}>{mensagem}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

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
export function ConhecimentoCarteira({ carteira, padrao, entradas }: { carteira: any; padrao: Record<string, any>; entradas: Entrada[] }) {
  const carteiraId = carteira.id as number;
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
      <DiretrizesELimites carteira={carteira} padrao={padrao} />
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
