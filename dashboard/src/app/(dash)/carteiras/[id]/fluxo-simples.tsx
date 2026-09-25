"use client";
import * as React from "react";
import { Card, Button, Input, Badge, Switch, HelpHint, Tooltip } from "@/components/ui/primitives";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, CircleHelp, Clock, CornerDownRight, HandCoins, Lightbulb,
  MessageSquareText, Plus, Redo2, Save, Send, ShieldCheck, Shuffle, Sparkles, Trash2, Undo2, X,
} from "lucide-react";
import {
  diagnosticar, etapaDeEntrada, idUnico, inalcancaveis, tipoDe,
  type CasoRoteiro, type EtapaRoteiro,
} from "./roteiro-layout";
import type { HistoricoRoteiro } from "./roteiro-historico";
import { TemplateMetaAbordagem } from "./template-meta";
import { ehConectorBaileys } from "@/lib/conector";
import {
  ACEITA_OPCIONAL, VARIAVEIS, exemploFicticio, montarMensagem, revisarTexto, saudacaoAgora, trechosParaDestaque,
  type Revisao, type TipoMensagem, type ValoresPrevia,
} from "@/lib/mensagem-previa";

// O fluxo em modo guiado: o mesmo `roteiro` que o desenho edita, lido na ordem em que as coisas
// acontecem com o devedor. Foi feito para quem acabou de comprar o sistema e nunca viu um "caso" ou
// um "vai_para" — nada aqui muda o formato que as Edge Functions leem, e os ids das etapas nunca são
// renomeados (o bot-turno procura algumas pelo id).

/* ---------------------------------------------------------------- canais */

/** Por qual canal a 1ª mensagem desta carteira sai: o texto do fluxo só vale para chip Baileys. */
export function useCanaisDaCarteira(carteiraId: number) {
  const [canais, setCanais] = React.useState<{ baileys: number; meta: number } | null>(null);
  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/carteiras/${carteiraId}/chips`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.chips) return;
        const ligados = d.chips.filter((c: any) => c.vinculado);
        setCanais({
          baileys: ligados.filter((c: any) => ehConectorBaileys(c.conector)).length,
          meta: ligados.filter((c: any) => !ehConectorBaileys(c.conector)).length,
        });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [carteiraId]);
  return canais;
}

/* ---------------------------------------------------------------- vocabulário */

// Etapas que existem para proteger o número e a pessoa. Mexer nelas é permitido — o fluxo é de quem
// comprou —, mas a tela avisa o porquê de cada uma antes.
const PROTECOES: Record<string, string> = {
  optin: "Pede licença antes de falar do assunto.",
  esclarecer_quem_somos: "Responde à desconfiança uma vez só, sem empurrar a proposta.",
  troca_de_numero: "Explica a troca de número sem recomeçar a conversa.",
  terceiro_indica_contato: "Não anota contato passado por outra pessoa (LGPD).",
  titular_falecido: "Encerra com respeito, sem falar de dívida com a família.",
  autoresposta_comercial: "Reconhece robô de outra empresa e não revela o assunto.",
  mensagem_ininteligivel: "Pede para repetir uma vez só.",
  duvida_prescricao: "Responde sobre prescrição com honestidade total.",
  contestacao_persistente: "Para de negociar com quem continua negando a dívida.",
  origem_do_contato: "Nunca inventa de onde veio o telefone.",
  escalar_juridico: "Advogado, Procon ou justiça: o robô sai e a equipe assume.",
  escalar_hostil: "Sai da conversa com dignidade quando há hostilidade.",
  encerrar_nao_perturbe: "Quem pede para parar nunca mais recebe mensagem.",
  encerrar_pessoa_errada: "Número de outra pessoa sai do cadastro.",
  encerrar_identidade_nao_confirmada: "Sem saber com quem fala, não fala da dívida.",
  encerrar_sem_autorizacao: "Sem autorização, encerra sem insistir.",
};

export function nomeDaEtapa(etapa: EtapaRoteiro | undefined): string {
  if (!etapa) return "etapa removida";
  const limpo = (etapa.objetivo ?? "").replace(/^\s*\d+[a-z]?\.\s*/i, "").trim();
  if (limpo) return limpo;
  const humano = etapa.id.replace(/_/g, " ");
  return humano.charAt(0).toUpperCase() + humano.slice(1);
}

/** A primeira frase da instrução — o bastante para saber o que a etapa faz sem abri-la. */
function resumo(instrucao: string | undefined): string {
  const texto = String(instrucao ?? "").replace(/\s+/g, " ").trim();
  const frase = texto.split(/(?<=[.!?:])\s/)[0] ?? "";
  return frase.length > 170 ? `${frase.slice(0, 167)}…` : frase;
}

/** Etapas de conversa na ordem em que a conversa passa por elas (largura primeiro, a partir da entrada). */
function ordemDaConversa(etapas: EtapaRoteiro[]): string[] {
  const conversas = etapas.filter((e) => tipoDe(e) === "conversa");
  const porId = new Map(conversas.map((e) => [e.id, e]));
  const raiz = etapaDeEntrada(etapas);
  const vistos: string[] = [];
  if (raiz && porId.has(raiz)) vistos.push(raiz);
  for (let i = 0; i < vistos.length; i++) {
    for (const caso of porId.get(vistos[i])?.casos ?? []) {
      if (caso.vai_para && porId.has(caso.vai_para) && !vistos.includes(caso.vai_para)) vistos.push(caso.vai_para);
    }
  }
  return vistos;
}

/** O caminho mais curto da entrada até o Pix: é o “caminho feliz” que a tela mostra em cima. */
function caminhoAtePagamento(etapas: EtapaRoteiro[]): string[] {
  const conversas = etapas.filter((e) => tipoDe(e) === "conversa");
  const porId = new Map(conversas.map((e) => [e.id, e]));
  const alvo = conversas.find((e) => e.id === "pagamento")
    ?? conversas.find((e) => /pix|pagamento/i.test(`${e.id} ${e.objetivo ?? ""}`));
  const raiz = etapaDeEntrada(etapas);
  if (!alvo || !raiz || !porId.has(raiz)) return [];
  const pai = new Map<string, string | null>([[raiz, null]]);
  const fila = [raiz];
  while (fila.length) {
    const id = fila.shift()!;
    if (id === alvo.id) break;
    for (const caso of porId.get(id)?.casos ?? []) {
      if (caso.vai_para && porId.has(caso.vai_para) && !pai.has(caso.vai_para)) {
        pai.set(caso.vai_para, id);
        fila.push(caso.vai_para);
      }
    }
  }
  if (!pai.has(alvo.id)) return [];
  const caminho: string[] = [];
  for (let atual: string | null = alvo.id; atual; atual = pai.get(atual) ?? null) caminho.unshift(atual);
  return caminho;
}

/* ---------------------------------------------------------------- tela */

export function FluxoSimples({ carteira, padrao, salvar, historico }: {
  carteira: any; padrao: Record<string, any>; salvar: (body: any) => Promise<boolean>; historico: HistoricoRoteiro;
}) {
  const { documento, setEtapas, setAtivo, substituir, desfazer, refazer, marcarSalvo } = historico;
  const { ativo, etapas, pos_inicio: posInicio } = documento;
  const modelo = padrao.roteiro_modelo ?? null;
  const canais = useCanaisDaCarteira(carteira.id);
  const nomeBot = padrao.ia?.nome_bot ?? "Ana";

  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [aberta, setAberta] = React.useState<string | null>(null);
  const exemplos = useExemplosReais(carteira.id, nomeBot, String(carteira.credor ?? ""));

  const problemas = React.useMemo(() => diagnosticar(etapas), [etapas]);
  const porId = React.useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);
  const disparo = etapas.find((e) => tipoDe(e) === "disparo");
  const reenvios = etapas.filter((e) => tipoDe(e) === "followup");
  const posPagamento = etapas.filter((e) => tipoDe(e) === "pos_pagamento");
  const entrada = etapaDeEntrada(etapas);
  const ordem = React.useMemo(() => ordemDaConversa(etapas), [etapas]);
  const orfas = React.useMemo(() => inalcancaveis(etapas), [etapas]);
  const caminho = React.useMemo(() => caminhoAtePagamento(etapas), [etapas]);
  const conversas = etapas.filter((e) => tipoDe(e) === "conversa");
  const meio = ordem.map((id) => porId.get(id)!).filter((e) => (e.casos ?? []).length > 0);
  const finais = ordem.map((id) => porId.get(id)!).filter((e) => (e.casos ?? []).length === 0);
  const chegadas = React.useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const e of etapas) for (const c of e.casos ?? []) {
      if (!c.vai_para || tipoDe(e) !== "conversa") continue;
      mapa.set(c.vai_para, [...new Set([...(mapa.get(c.vai_para) ?? []), e.id])]);
    }
    return mapa;
  }, [etapas]);

  function mudarEtapa(id: string, campo: keyof EtapaRoteiro, valor: any) {
    setEtapas((es) => es.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)), `simples:${id}:${campo}`);
  }

  function removerEtapa(id: string) {
    const etapa = porId.get(id);
    if (!confirm(`Remover “${nomeDaEtapa(etapa)}”? As respostas que levavam até ela também saem. Dá para desfazer.`)) return;
    setEtapas((es) => es.filter((e) => e.id !== id).map((e) => ({
      ...e, casos: (e.casos ?? []).filter((c) => c.vai_para !== id),
    })));
    if (aberta === id) setAberta(null);
  }

  function novaEtapa(nome: string) {
    const id = idUnico(nome, etapas.map((e) => e.id));
    setEtapas((es) => [...es, { id, tipo: "conversa", objetivo: nome, instrucao: "", casos: [], usa_conhecimento: true }]);
    setAberta(id);
    window.requestAnimationFrame(() => document.getElementById(`etapa-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function novoReenvio() {
    setEtapas((es) => [...es, {
      id: idUnico("reenvio", es.map((e) => e.id)),
      tipo: "followup",
      objetivo: `Reenvio ${reenvios.length + 1}`,
      espera_horas: 72,
      textos: ["{Oi|Olá}, {{nome}}! Passando só para saber se você viu minha mensagem."],
    }]);
  }

  function novaMensagemPosPagamento() {
    setEtapas((es) => [...es, {
      id: idUnico("pos_pagamento", es.map((e) => e.id)),
      tipo: "pos_pagamento",
      objetivo: "Depois do pagamento",
      textos: ["Pagamento confirmado, {{primeiro_nome}}! Obrigado 😊"],
    }]);
  }

  async function gravar() {
    if (salvando || problemas.length > 0 || !historico.alterado) return;
    setSalvando(true); setErro(""); setOk(false);
    const sucesso = await salvar({ roteiro: etapas.length ? { ativo, etapas, pos_inicio: posInicio } : null });
    if (sucesso) { marcarSalvo(); setOk(true); window.setTimeout(() => setOk(false), 2500); }
    else setErro("Não consegui salvar o fluxo. Tente de novo.");
    setSalvando(false);
  }

  function descartar() {
    if (!confirm("Descartar tudo o que você mudou desde o último salvamento?")) return;
    const salvo = carteira.roteiro ?? null;
    substituir({ ativo: !!salvo?.ativo, etapas: salvo?.etapas ?? [], pos_inicio: salvo?.pos_inicio });
    marcarSalvo();
  }

  React.useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s") {
        evento.preventDefault();
        void gravar();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  React.useEffect(() => {
    if (!historico.alterado) return;
    const avisarSaida = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisarSaida);
    return () => window.removeEventListener("beforeunload", avisarSaida);
  }, [historico.alterado]);

  /* ---- carteira sem fluxo ---- */
  if (etapas.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h4 className="font-display text-base font-600 text-chalk">Esta carteira ainda não tem fluxo</h4>
        <p className="max-w-2xl text-sm text-mist">
          Sem fluxo, o robô manda o texto padrão do sistema e conversa livremente. O modelo pronto já vem
          com a primeira mensagem, o reenvio, a conversa até o Pix e as proteções que evitam bloqueio —
          você só ajusta os textos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!modelo} onClick={() => substituir({ ativo: true, etapas: modelo?.etapas ?? [] })}>
            <Sparkles className="h-4 w-4" /> Usar o modelo pronto
          </Button>
        </div>
        {historico.alterado && (
          <Button variant="outline" disabled={salvando} onClick={() => void gravar()}>
            <Save className="h-4 w-4" /> Salvar
          </Button>
        )}
      </Card>
    );
  }

  const nomes = (id: string) => nomeDaEtapa(porId.get(id));

  return (
    <div className="flex flex-col gap-4 pb-24">
      <ComoFunciona reenvios={reenvios.length} etapasConversa={conversas.length} posPagamento={posPagamento.length} />

      {problemas.length > 0 && (
        <Card className="border-rose/30">
          <p className="mb-2 flex items-center gap-2 text-sm font-600 text-rose"><AlertTriangle className="h-4 w-4" /> Arrume isto antes de salvar</p>
          <ul className="space-y-1 text-xs text-rose">
            {problemas.map((p, i) => (
              <li key={i}>
                {p.mensagem}
                {p.etapaId && porId.get(p.etapaId) && tipoDe(porId.get(p.etapaId)!) === "conversa" && (
                  <button className="ml-2 underline" onClick={() => { setAberta(p.etapaId!); document.getElementById(`etapa-${p.etapaId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>abrir</button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 1 ---------------------------------------------------------------- */}
      <Secao id="passo-1" numero={1} icone={Send} titulo="A primeira mensagem"
        explicacao="É o que o robô manda para começar. Sai exatamente como está escrito, sem IA — cada pessoa recebe uma das versões, sorteada, porque texto idêntico para todo mundo é o que o WhatsApp reconhece como robô.">
        <AvisoDeCanal canais={canais} />
        {disparo ? (
          <>
            <EditorDeVersoes
              tipo="disparo"
              textos={disparo.textos ?? []}
              aoMudar={(textos) => mudarEtapa(disparo.id, "textos", textos)}
              exemplos={exemplos}
            />
            <Recolhivel titulo="Versão para quem já conversou com a gente antes"
              ajuda="Quem já respondeu alguma mensagem nossa não é contato frio. Em branco, essas pessoas recebem a mesma primeira mensagem de quem nunca ouviu falar da empresa.">
              <EditorDeVersoes
                tipo="disparo"
                textos={disparo.textos_recontato ?? []}
                aoMudar={(textos) => mudarEtapa(disparo.id, "textos_recontato", textos)}
                exemplos={exemplos}
                permiteVazio
              />
            </Recolhivel>
            {canais && canais.meta > 0 && <TemplateMetaAbordagem carteiraId={carteira.id} />}
          </>
        ) : (
          <Button variant="outline" onClick={() => setEtapas((es) => [{
            id: idUnico("abordagem", es.map((e) => e.id)), tipo: "disparo", objetivo: "Primeira mensagem", textos: [""],
            casos: entrada ? [{ quando: "a pessoa responder", vai_para: entrada }] : [],
          }, ...es])}>
            <Plus className="h-4 w-4" /> Escrever a primeira mensagem
          </Button>
        )}
      </Secao>

      {/* 2 ---------------------------------------------------------------- */}
      <Secao id="passo-2" numero={2} icone={Clock} titulo="Se a pessoa não responder"
        explicacao="Quantas vezes o robô tenta de novo, e depois de quanto tempo. Depois do último reenvio sem resposta, a conversa é encerrada e a pessoa não recebe mais nada.">
        <div className="flex gap-2 rounded-xl border border-blue/25 bg-blue/5 px-3 py-2.5 text-[11px] leading-relaxed text-mist">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
          <span>
            O texto que chega no reenvio é o <b className="text-chalk">modelo aprovado</b> escolhido em{" "}
            <a href="/ajustes?aba=modelos" className="text-blue underline">Ajustes → Modelos</a>. Aqui você decide
            <b className="text-chalk"> quantos</b> reenvios existem e <b className="text-chalk">quando</b> cada um sai.
          </span>
        </div>
        {reenvios.length === 0 && <p className="text-sm text-mist">Nenhum reenvio: quem não responder a primeira mensagem não recebe mais nada.</p>}
        {reenvios.map((r, i) => (
          <div key={r.id} className="rounded-xl border border-line bg-ink-900 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-chalk">
              <Badge tone="amber">{i + 1}º reenvio</Badge>
              <span>sai depois de</span>
              <Input type="number" min={1} value={r.espera_horas ?? 24} className="h-8 w-20"
                aria-label={`Horas até o ${i + 1}º reenvio`}
                onChange={(e) => mudarEtapa(r.id, "espera_horas", Number(e.target.value))} />
              <span>horas sem resposta{Number(r.espera_horas) >= 24 ? ` (${+(Number(r.espera_horas) / 24).toFixed(1)} dia${Number(r.espera_horas) >= 48 ? "s" : ""})` : ""}</span>
              <button onClick={() => removerEtapa(r.id)} className="ml-auto text-mist hover:text-rose" aria-label={`Remover o ${i + 1}º reenvio`}><Trash2 className="h-4 w-4" /></button>
            </div>
            <Recolhivel titulo="Texto guardado neste reenvio" ajuda="Enquanto o reenvio sair pelo modelo aprovado, este texto não é enviado — ele só marca que o reenvio existe.">
              <EditorDeVersoes tipo="followup" textos={r.textos ?? []} aoMudar={(textos) => mudarEtapa(r.id, "textos", textos)} exemplos={exemplos} />
            </Recolhivel>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={novoReenvio}><Plus className="h-4 w-4" /> Adicionar reenvio</Button>
      </Secao>

      {/* 3 ---------------------------------------------------------------- */}
      <Secao id="passo-3" numero={3} icone={MessageSquareText} titulo="Quando a pessoa responde"
        explicacao="Daqui em diante quem escreve é a IA, seguindo as etapas abaixo. Em cada etapa você diz o que o robô faz e para onde a conversa vai conforme a resposta da pessoa."
        acao={(
          <div className="flex items-center gap-2 text-xs text-mist">
            Seguir as etapas
            <HelpHint text="Desligado, a primeira mensagem e o pós-pagamento continuam valendo, mas a conversa vira livre, só pelo prompt. Recomendado deixar ligado." />
            <Switch checked={ativo} onChange={setAtivo} />
          </div>
        )}>
        {caminho.length > 0 && (
          <div className="rounded-xl border border-emerald/20 bg-emerald/5 p-3">
            <p className="mb-2 text-[11px] font-600 uppercase tracking-wider text-emerald">Caminho mais curto até o pagamento</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Passo>A pessoa responde</Passo>
              {caminho.map((id) => (
                <React.Fragment key={id}>
                  <ArrowRight className="h-3.5 w-3.5 text-mist" />
                  <button onClick={() => setAberta(id)} className="rounded-lg border border-line bg-ink-900 px-2.5 py-1 text-chalk hover:border-emerald/50">{nomes(id)}</button>
                </React.Fragment>
              ))}
              <ArrowRight className="h-3.5 w-3.5 text-mist" />
              <Passo>Pix pago</Passo>
            </div>
          </div>
        )}

        {disparo && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-chalk">
            <span>A conversa começa em</span>
            <select value={entrada ?? ""}
              onChange={(e) => mudarEtapa(disparo.id, "casos", e.target.value ? [{ quando: "a pessoa responder", vai_para: e.target.value }] : [])}
              className="h-9 rounded-lg border border-line bg-ink-900 px-2 text-sm text-chalk outline-none focus:border-emerald">
              {conversas.map((e) => <option key={e.id} value={e.id}>{nomeDaEtapa(e)}</option>)}
            </select>
          </div>
        )}

        <Grupo titulo="Etapas da conversa" contagem={meio.length}
          explicacao="Na ordem em que a conversa costuma passar por elas. Clique para ver e editar.">
          {meio.map((e) => (
            <CartaoEtapa key={e.id} etapa={e} etapas={etapas} nomes={nomes} chegadas={chegadas.get(e.id) ?? []}
              aberta={aberta === e.id} alternar={() => setAberta(aberta === e.id ? null : e.id)}
              mudar={(campo, valor) => mudarEtapa(e.id, campo, valor)} remover={() => removerEtapa(e.id)} />
          ))}
        </Grupo>

        <Grupo titulo="Como a conversa pode terminar" contagem={finais.length}
          explicacao="Etapas sem próximo passo: o robô dá a última palavra e a conversa acaba (ou passa para uma pessoa da equipe).">
          {finais.map((e) => (
            <CartaoEtapa key={e.id} etapa={e} etapas={etapas} nomes={nomes} chegadas={chegadas.get(e.id) ?? []}
              aberta={aberta === e.id} alternar={() => setAberta(aberta === e.id ? null : e.id)}
              mudar={(campo, valor) => mudarEtapa(e.id, campo, valor)} remover={() => removerEtapa(e.id)} />
          ))}
        </Grupo>

        {orfas.length > 0 && (
          <Grupo titulo="Fora de uso" contagem={orfas.length} recolhido
            explicacao="Nenhuma resposta leva até estas etapas, então o robô nunca passa por elas. Ligue uma resposta a elas ou remova.">
            {orfas.map((id) => porId.get(id)!).filter(Boolean).map((e) => (
              <CartaoEtapa key={e.id} etapa={e} etapas={etapas} nomes={nomes} chegadas={[]}
                aberta={aberta === e.id} alternar={() => setAberta(aberta === e.id ? null : e.id)}
                mudar={(campo, valor) => mudarEtapa(e.id, campo, valor)} remover={() => removerEtapa(e.id)} />
            ))}
          </Grupo>
        )}

        <NovaEtapa aoCriar={novaEtapa} />
      </Secao>

      {/* 4 ---------------------------------------------------------------- */}
      <Secao id="passo-4" numero={4} icone={HandCoins} titulo="Depois do pagamento"
        explicacao="Saem sozinhas quando o banco confirma o Pix, nesta ordem. Normalmente: a confirmação e depois o termo de quitação.">
        {posPagamento.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-line bg-ink-900 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="violet">{i + 1}ª mensagem</Badge>
              <Input value={p.objetivo ?? ""} onChange={(e) => mudarEtapa(p.id, "objetivo", e.target.value)} className="h-8 max-w-xs" aria-label="Nome desta mensagem" />
              <button onClick={() => removerEtapa(p.id)} className="ml-auto text-mist hover:text-rose" aria-label="Remover esta mensagem"><Trash2 className="h-4 w-4" /></button>
            </div>
            <EditorDeVersoes tipo="pos_pagamento" textos={p.textos ?? []} aoMudar={(textos) => mudarEtapa(p.id, "textos", textos)} exemplos={exemplos} />
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={novaMensagemPosPagamento}><Plus className="h-4 w-4" /> Adicionar mensagem</Button>
      </Secao>

      {/* 5 ---------------------------------------------------------------- */}
      <Protecoes carteira={carteira} padrao={padrao} />

      {/* barra de salvar ---------------------------------------------------------------- */}
      <div className="sticky bottom-3 z-30 mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-ink-850/95 px-4 py-3 shadow-2xl backdrop-blur">
        <span className={`text-xs ${historico.alterado ? "text-amber" : "text-emerald"}`}>
          {historico.alterado ? "Você tem alterações que ainda não foram salvas." : "Tudo salvo."}
        </span>
        {erro && <span className="text-xs text-rose">{erro}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip text="Desfazer"><button onClick={desfazer} disabled={!historico.podeDesfazer} aria-label="Desfazer" className="rounded-lg p-2 text-mist hover:bg-ink-800 hover:text-chalk disabled:opacity-30"><Undo2 className="h-4 w-4" /></button></Tooltip>
          <Tooltip text="Refazer"><button onClick={refazer} disabled={!historico.podeRefazer} aria-label="Refazer" className="rounded-lg p-2 text-mist hover:bg-ink-800 hover:text-chalk disabled:opacity-30"><Redo2 className="h-4 w-4" /></button></Tooltip>
          {historico.alterado && <Button variant="ghost" size="sm" onClick={descartar}>Descartar</Button>}
          <Tooltip text="Cada salvamento vira uma versão nova, e dá para voltar a qualquer uma em “Versões e desempenho”.">
            <Button size="sm" onClick={() => void gravar()} disabled={salvando || problemas.length > 0 || !historico.alterado}>
              {ok || !historico.alterado ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {salvando ? "Salvando…" : ok || !historico.alterado ? "Salvo" : "Salvar nova versão"}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- blocos da página */

function ComoFunciona({ reenvios, etapasConversa, posPagamento }: { reenvios: number; etapasConversa: number; posPagamento: number }) {
  const passos = [
    { n: 1, t: "Primeira mensagem", d: "texto pronto, sem IA" },
    { n: 2, t: "Sem resposta", d: reenvios ? `${reenvios} reenvio${reenvios > 1 ? "s" : ""}` : "nenhum reenvio" },
    { n: 3, t: "Conversa", d: `IA em ${etapasConversa} etapas` },
    { n: 4, t: "Pagamento", d: posPagamento > 1 ? `${posPagamento} mensagens automáticas` : posPagamento ? "1 mensagem automática" : "sem mensagem" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {passos.map((p) => (
        <a key={p.n} href={`#passo-${p.n}`} className="flex items-center gap-3 rounded-xl border border-line bg-ink-850 px-3 py-2.5 transition-colors hover:border-emerald/40">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald/12 text-xs font-600 text-emerald">{p.n}</span>
          <span className="min-w-0"><span className="block text-sm text-chalk">{p.t}</span><span className="block truncate text-[11px] text-mist">{p.d}</span></span>
        </a>
      ))}
    </div>
  );
}

function Secao({ id, numero, icone: Icone, titulo, explicacao, acao, children }: {
  id: string; numero: number; icone: any; titulo: string; explicacao: string; acao?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 space-y-4 overflow-visible">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald/12 text-emerald"><Icone className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-600 text-chalk"><span className="text-mist">{numero}.</span> {titulo}</h4>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-mist">{explicacao}</p>
        </div>
        {acao}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </Card>
  );
}

function Grupo({ titulo, contagem, explicacao, recolhido = false, children }: {
  titulo: string; contagem: number; explicacao: string; recolhido?: boolean; children: React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(!recolhido);
  if (contagem === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-2 text-left">
        <ChevronDown className={`h-4 w-4 text-mist transition-transform ${aberto ? "" : "-rotate-90"}`} />
        <span className="text-sm font-600 text-chalk">{titulo}</span>
        <Badge>{contagem}</Badge>
        <span className="hidden text-[11px] text-mist md:inline">{explicacao}</span>
      </button>
      {aberto && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function Passo({ children }: { children: React.ReactNode }) {
  return <span className="rounded-lg bg-emerald/12 px-2.5 py-1 text-emerald">{children}</span>;
}

function Recolhivel({ titulo, ajuda, children }: { titulo: string; ajuda: string; children: React.ReactNode }) {
  const [aberto, setAberto] = React.useState(false);
  return (
    <div className="rounded-xl border border-line">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-mist hover:text-chalk">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? "" : "-rotate-90"}`} />
        {titulo}
        <HelpHint text={ajuda} />
      </button>
      {aberto && <div className="border-t border-line p-3">{children}</div>}
    </div>
  );
}

function AvisoDeCanal({ canais }: { canais: { baileys: number; meta: number } | null }) {
  if (!canais) return null;
  if (canais.baileys === 0 && canais.meta === 0) {
    return <Aviso tom="amber">Nenhum chip ligado a esta carteira: esta mensagem ainda não sai para ninguém. Ligue um chip em <b>Visão geral → Chips desta carteira</b>.</Aviso>;
  }
  if (canais.baileys === 0) {
    return <Aviso tom="amber">Esta carteira só tem chip da <b>API oficial da Meta</b>, e nele a primeira mensagem é um <b>modelo aprovado</b>, não o texto abaixo. Escolha o modelo logo abaixo.</Aviso>;
  }
  if (canais.meta > 0) {
    return <Aviso tom="blue">Carteira com os <b>dois canais</b>: o texto abaixo sai pelos {canais.baileys} chip(s) de WhatsApp comum, e os {canais.meta} da Meta mandam o modelo aprovado. Mantenha os dois dizendo a mesma coisa.</Aviso>;
  }
  return null;
}

function Aviso({ tom, children }: { tom: "amber" | "blue"; children: React.ReactNode }) {
  const cores = tom === "amber" ? "border-amber/30 bg-amber/10 text-amber" : "border-blue/30 bg-blue/10 text-blue";
  return (
    <div className={`flex gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${cores}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{children}</span>
    </div>
  );
}

function NovaEtapa({ aoCriar }: { aoCriar: (nome: string) => void }) {
  const [nome, setNome] = React.useState("");
  const criar = () => { const limpo = nome.trim(); if (!limpo) return; aoCriar(limpo); setNome(""); };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3">
      <Plus className="h-4 w-4 text-mist" />
      <Input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") criar(); }}
        placeholder="Nova etapa — ex.: Pessoa pediu para parcelar" className="h-9 max-w-md" />
      <Button size="sm" variant="outline" onClick={criar} disabled={!nome.trim()}>Criar etapa</Button>
      <span className="text-[11px] text-mist">Depois, ligue uma resposta de outra etapa até ela.</span>
    </div>
  );
}

/* ---------------------------------------------------------------- etapa de conversa */

function CartaoEtapa({ etapa, etapas, nomes, chegadas, aberta, alternar, mudar, remover }: {
  etapa: EtapaRoteiro; etapas: EtapaRoteiro[]; nomes: (id: string) => string; chegadas: string[];
  aberta: boolean; alternar: () => void; mudar: (campo: keyof EtapaRoteiro, valor: any) => void; remover: () => void;
}) {
  const protecao = PROTECOES[etapa.id];
  const casos = etapa.casos ?? [];
  const destinos = etapas.filter((e) => tipoDe(e) === "conversa" && e.id !== etapa.id);

  function mudarCaso(indice: number, campo: keyof CasoRoteiro, valor: any) {
    mudar("casos", casos.map((c, i) => (i === indice ? { ...c, [campo]: valor } : c)));
  }

  return (
    <div id={`etapa-${etapa.id}`} className={`scroll-mt-24 rounded-xl border bg-ink-900 ${aberta ? "border-emerald/40" : "border-line"}`}>
      <button onClick={alternar} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-mist transition-transform ${aberta ? "" : "-rotate-90"}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-600 text-chalk">{nomeDaEtapa(etapa)}</span>
            {protecao && <Badge tone="blue"><ShieldCheck className="h-3 w-3" /> proteção</Badge>}
            {casos.length > 0 && <span className="text-[11px] text-mist">{casos.length} resposta{casos.length > 1 ? "s" : ""} prevista{casos.length > 1 ? "s" : ""}</span>}
          </span>
          {!aberta && <span className="mt-0.5 block text-xs text-mist">{resumo(etapa.instrucao) || "Sem instrução ainda."}</span>}
        </span>
      </button>

      {aberta && (
        <div className="space-y-4 border-t border-line px-3.5 py-4">
          {protecao && (
            <div className="flex gap-2 rounded-xl border border-blue/25 bg-blue/5 px-3 py-2.5 text-[11px] leading-relaxed text-mist">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
              <span><b className="text-chalk">Por que esta etapa existe:</b> {protecao} Ela protege o número contra bloqueio e a pessoa contra constrangimento — mude com cuidado.</span>
            </div>
          )}
          {chegadas.length > 0 && (
            <p className="text-[11px] text-mist">Chega aqui a partir de: {chegadas.map((id) => nomes(id)).join(" · ")}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs text-mist">Nome da etapa</span>
              <Input value={etapa.objetivo ?? ""} onChange={(e) => mudar("objetivo", e.target.value)} placeholder={nomeDaEtapa(etapa)} />
            </label>
            <div className="flex items-end gap-2 pb-2 text-xs text-mist">
              <Switch checked={etapa.usa_conhecimento !== false} onChange={(v) => mudar("usa_conhecimento", v)} />
              Consultar a aba Conhecimento
              <HelpHint text="Ligado, o robô pode usar as respostas aprovadas da aba Conhecimento nesta etapa." />
            </div>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs text-mist">
              O que o robô faz aqui
              <HelpHint text="Escreva como explicaria a um atendente novo: o objetivo da etapa, o que dizer, o que nunca dizer. A IA escreve a mensagem a partir disto — não é o texto literal que sai." />
            </span>
            <TextoQueCresce value={etapa.instrucao ?? ""} onChange={(v) => mudar("instrucao", v)}
              placeholder="Ex.: Agradeça a confirmação e explique de onde vem a pendência, sem citar valores ainda." />
          </label>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs text-mist">
              Para onde a conversa vai
              <HelpHint text="O robô lê a resposta da pessoa pelo sentido, não pela palavra exata, e segue a primeira situação que combinar. Sem nenhuma situação, esta etapa encerra a conversa." />
            </p>
            <div className="flex flex-col gap-2">
              {casos.map((caso, i) => (
                <LinhaDeCaso key={i} caso={caso} destinos={destinos}
                  mudar={(campo, valor) => mudarCaso(i, campo, valor)}
                  remover={() => mudar("casos", casos.filter((_, j) => j !== i))} />
              ))}
              {casos.length === 0 && <p className="text-[11px] text-mist">Nenhuma situação: esta etapa encerra a conversa.</p>}
              <button onClick={() => mudar("casos", [...casos, { quando: "", vai_para: "", exemplos: [] }])}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue/30 px-3 py-2 text-[11px] text-blue hover:bg-blue/5">
                <Plus className="h-3.5 w-3.5" /> Adicionar situação
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={remover} className="flex items-center gap-1.5 text-xs text-mist hover:text-rose"><Trash2 className="h-3.5 w-3.5" /> Remover etapa</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaDeCaso({ caso, destinos, mudar, remover }: {
  caso: CasoRoteiro; destinos: EtapaRoteiro[];
  mudar: (campo: keyof CasoRoteiro, valor: any) => void; remover: () => void;
}) {
  const [exemplo, setExemplo] = React.useState("");
  const exemplos = caso.exemplos ?? [];
  const adicionar = () => {
    const t = exemplo.trim();
    if (!t || exemplos.includes(t)) return;
    mudar("exemplos", [...exemplos, t]);
    setExemplo("");
  };
  return (
    <div className="rounded-xl border border-blue/20 bg-blue/[0.03] p-3">
      <div className="grid items-start gap-2 md:grid-cols-[auto_1fr_auto_minmax(180px,240px)_auto]">
        <span className="pt-2 text-xs font-600 text-blue">Se a pessoa</span>
        <TextoQueCresce value={caso.quando} onChange={(v) => mudar("quando", v)} linhas={1}
          placeholder="ex.: disse que já pagou essa conta" />
        <CornerDownRight className="mt-2 hidden h-4 w-4 text-blue md:block" />
        <select value={caso.vai_para} onChange={(e) => mudar("vai_para", e.target.value)} aria-label="Etapa seguinte"
          className="h-10 w-full rounded-xl border border-line bg-ink-850 px-2 text-sm text-chalk outline-none focus:border-blue">
          <option value="">Escolha a próxima etapa…</option>
          {destinos.map((d) => <option key={d.id} value={d.id}>{nomeDaEtapa(d)}</option>)}
        </select>
        <button onClick={remover} className="mt-2 text-mist hover:text-rose" aria-label="Remover situação"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 md:pl-[4.6rem]">
        <span className="text-[10px] text-mist">Frases reais que caem aqui:</span>
        {exemplos.map((ex, i) => (
          <span key={`${ex}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-850 px-2 py-0.5 text-[11px] text-chalk">
            “{ex}”
            <button onClick={() => mudar("exemplos", exemplos.filter((_, j) => j !== i))} className="text-mist hover:text-rose" aria-label={`Remover ${ex}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input value={exemplo} onChange={(e) => setExemplo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
          onBlur={adicionar}
          placeholder="+ exemplo (Enter)"
          className="h-6 w-40 rounded-full border border-dashed border-line bg-transparent px-2 text-[11px] text-chalk outline-none placeholder:text-mist focus:border-blue" />
      </div>
    </div>
  );
}

function TextoQueCresce({ value, onChange, placeholder, linhas = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; linhas?: number;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={linhas} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none overflow-hidden rounded-xl border border-line bg-ink-850 px-3 py-2 text-sm leading-relaxed text-chalk outline-none placeholder:text-mist/60 focus:border-emerald/60" />
  );
}

/* ---------------------------------------------------------------- mensagens de texto pronto */

type Exemplos = { com: ValoresPrevia; sem: ValoresPrevia; reais: boolean };

/** Dois devedores reais desta carteira (com e sem desconto); o fictício cobre enquanto carrega. */
function useExemplosReais(carteiraId: number, nomeBot: string, credor: string): Exemplos {
  const [reais, setReais] = React.useState<{ com: ValoresPrevia | null; sem: ValoresPrevia | null } | null>(null);
  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/carteiras/${carteiraId}/previa-mensagem`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.ok) setReais({ com: d.com_desconto, sem: d.sem_desconto }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [carteiraId]);
  const extra = { nome_bot: nomeBot, saudacao: saudacaoAgora() };
  return {
    com: { ...exemploFicticio(true, nomeBot, credor), ...(reais?.com ?? {}), ...extra },
    sem: { ...exemploFicticio(false, nomeBot, credor), ...(reais?.sem ?? {}), ...extra },
    reais: !!(reais?.com || reais?.sem),
  };
}

function EditorDeVersoes({ tipo, textos, aoMudar, exemplos, permiteVazio = false }: {
  tipo: TipoMensagem; textos: string[]; aoMudar: (textos: string[]) => void; exemplos: Exemplos; permiteVazio?: boolean;
}) {
  const [atual, setAtual] = React.useState(0);
  const lista = textos.length ? textos : (permiteVazio ? [] : [""]);
  const indice = Math.min(atual, Math.max(0, lista.length - 1));
  const texto = lista[indice] ?? "";

  if (lista.length === 0) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => { aoMudar([""]); setAtual(0); }}>
        <Plus className="h-4 w-4" /> Escrever esta versão
      </Button>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          {lista.map((_, i) => (
            <button key={i} onClick={() => setAtual(i)}
              className={`rounded-lg px-2.5 py-1 text-xs ${i === indice ? "bg-emerald/15 font-600 text-emerald" : "text-mist hover:bg-ink-800 hover:text-chalk"}`}>
              Versão {i + 1}
            </button>
          ))}
          <button onClick={() => { aoMudar([...lista, texto]); setAtual(lista.length); }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-emerald hover:bg-emerald/10">
            <Plus className="h-3.5 w-3.5" /> nova versão
          </button>
          {(lista.length > 1 || permiteVazio) && (
            <button onClick={() => { aoMudar(lista.filter((_, i) => i !== indice)); setAtual(Math.max(0, indice - 1)); }}
              className="ml-auto flex items-center gap-1 text-[11px] text-mist hover:text-rose">
              <Trash2 className="h-3.5 w-3.5" /> apagar esta versão
            </button>
          )}
        </div>
        <EditorDeTexto tipo={tipo} valor={texto} aoMudar={(v) => aoMudar(lista.map((t, i) => (i === indice ? v : t)))} />
      </div>
      <PreviaWhatsApp tipo={tipo} texto={texto} exemplos={exemplos} />
    </div>
  );
}

const COR_TRECHO = {
  variavel: "rounded bg-emerald/25",
  sorteio: "rounded bg-amber/25",
  opcional: "rounded bg-violet/35",
} as const;

/** A camada de fundo do editor: pinta variáveis, sorteios e o trecho “só com desconto” inteiro. */
function destacar(valor: string): React.ReactNode[] {
  let dentroDoOpcional = false;
  return trechosParaDestaque(valor).map((t, i) => {
    if (t.tipo === "opcional") {
      dentroDoOpcional = t.valor === "[[";
      return <mark key={i} className={`${COR_TRECHO.opcional} text-transparent`}>{t.valor}</mark>;
    }
    if (t.tipo === "texto") {
      return <span key={i} className={dentroDoOpcional ? "rounded bg-violet/15" : undefined}>{t.valor}</span>;
    }
    return <mark key={i} className={`${COR_TRECHO[t.tipo]} text-transparent`}>{t.valor}</mark>;
  });
}

function EditorDeTexto({ tipo, valor, aoMudar }: { tipo: TipoMensagem; valor: string; aoMudar: (v: string) => void }) {
  const area = React.useRef<HTMLTextAreaElement>(null);
  const [dica, setDica] = React.useState("");
  const revisoes = React.useMemo(() => revisarTexto(valor, tipo), [valor, tipo]);

  React.useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);

  function aplicar(novo: string, cursor: number) {
    aoMudar(novo);
    window.requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(cursor, cursor); });
  }
  function inserir(trecho: string) {
    const el = area.current;
    const ini = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    aplicar(valor.slice(0, ini) + trecho + valor.slice(fim), ini + trecho.length);
  }
  // Com uma palavra selecionada, vira {palavra|} com o cursor depois da barra, pronto para digitar a
  // alternativa. Sem seleção, entra um exemplo que já funciona.
  function sorteio() {
    const el = area.current;
    const ini = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    if (ini === fim) { inserir("{Oi|Olá}"); return; }
    const selecionado = valor.slice(ini, fim);
    aplicar(`${valor.slice(0, ini)}{${selecionado}|}${valor.slice(fim)}`, ini + selecionado.length + 2);
    setDica("Agora digite a outra opção antes do }.");
    window.setTimeout(() => setDica(""), 5000);
  }
  function envolver(abre: string, fecha: string, semSelecao: string) {
    const el = area.current;
    const ini = el?.selectionStart ?? 0;
    const fim = el?.selectionEnd ?? 0;
    if (ini === fim) { setDica(semSelecao); window.setTimeout(() => setDica(""), 5000); return; }
    const selecionado = valor.slice(ini, fim);
    aplicar(valor.slice(0, ini) + abre + selecionado + fecha + valor.slice(fim), fim + abre.length + fecha.length);
  }

  // As duas camadas precisam quebrar linha no mesmo lugar: mesma fonte, mesmo espaçamento, mesma borda.
  const camada = "col-start-1 row-start-1 m-0 w-full whitespace-pre-wrap break-words border-0 px-3.5 py-3 font-sans text-sm leading-6";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-mist">Inserir:</span>
        {VARIAVEIS[tipo].map((v) => (
          <Tooltip key={v.chave} text={`${v.explicacao}${v.soComDesconto ? " Só existe para quem tem desconto — use dentro de “Só com desconto”." : ""}`}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(`{{${v.chave}}}`)}
              className="rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-0.5 text-[11px] text-emerald hover:bg-emerald/20">
              {v.rotulo}
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip text="Selecione duas ou mais palavras separadas por barra, ou só uma palavra, e o sistema sorteia uma por envio. Ex.: {Oi|Olá}">
          <button type="button" onMouseDown={(e) => e.preventDefault()}
            onClick={sorteio}
            className="flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[11px] text-amber hover:bg-amber/20">
            <Shuffle className="h-3 w-3" /> Sortear palavras
          </button>
        </Tooltip>
        {ACEITA_OPCIONAL[tipo] && (
          <Tooltip text="Selecione a frase que fala do valor com desconto e clique aqui: ela só aparece para quem tem desconto, e some inteira para quem não tem.">
            <button type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => envolver("[[", "]]", "Selecione primeiro a frase que fala do desconto, depois clique em “Só com desconto”.")}
              className="flex items-center gap-1 rounded-full border border-violet/40 bg-violet/15 px-2.5 py-0.5 text-[11px] text-violet hover:bg-violet/25">
              <HandCoins className="h-3 w-3" /> Só com desconto
            </button>
          </Tooltip>
        )}
        <span className="text-[10px] text-mist">
          <span className="rounded bg-emerald/25 px-1">verde</span> = dado da pessoa ·{" "}
          <span className="rounded bg-amber/25 px-1">amarelo</span> = sorteio
          {ACEITA_OPCIONAL[tipo] && <> · <span className="rounded bg-violet/35 px-1">roxo</span> = só com desconto</>}
        </span>
      </div>

      <div className="grid rounded-xl border border-line bg-ink-850 focus-within:border-emerald/60 focus-within:ring-2 focus-within:ring-emerald/15">
        <div aria-hidden className={`${camada} pointer-events-none text-transparent`}>
          {destacar(valor)}
          {"\n"}
        </div>
        <textarea ref={area} value={valor} rows={4} spellCheck onChange={(e) => aoMudar(e.target.value)}
          placeholder="Escreva a mensagem como ela deve chegar…"
          className={`${camada} resize-none overflow-hidden bg-transparent text-chalk caret-chalk outline-none placeholder:text-mist/60`} />
      </div>
      {dica && <p className="text-[11px] text-amber">{dica}</p>}
      <ListaDeRevisoes revisoes={revisoes} />
    </div>
  );
}

function ListaDeRevisoes({ revisoes }: { revisoes: Revisao[] }) {
  if (!revisoes.length) return null;
  const estilo = {
    erro: { cor: "text-rose", Icone: AlertTriangle },
    aviso: { cor: "text-amber", Icone: AlertTriangle },
    dica: { cor: "text-blue", Icone: Lightbulb },
  } as const;
  return (
    <ul className="space-y-1">
      {revisoes.map((r, i) => {
        const { cor, Icone } = estilo[r.nivel];
        return <li key={i} className={`flex gap-1.5 text-[11px] leading-relaxed ${cor}`}><Icone className="mt-0.5 h-3 w-3 shrink-0" />{r.mensagem}</li>;
      })}
    </ul>
  );
}

function PreviaWhatsApp({ tipo, texto, exemplos }: { tipo: TipoMensagem; texto: string; exemplos: Exemplos }) {
  const [comDesconto, setComDesconto] = React.useState(true);
  const [semente, setSemente] = React.useState(0);
  const valores = comDesconto ? exemplos.com : exemplos.sem;
  const montado = montarMensagem(texto, valores, semente);
  const temSorteio = /\{[^{}]*\|[^{}]*\}/.test(texto);
  const temOpcional = tipo === "disparo" && /\[\[/.test(texto);
  const quem = valores.nome || valores.primeiro_nome || "a pessoa";

  return (
    <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-mist">Como chega para <b className="text-chalk">{quem}</b>{exemplos.reais ? "" : " (exemplo)"}</span>
      </div>
      {(temOpcional || temSorteio) && (
        <div className="flex flex-wrap gap-1">
          {temOpcional && (
            <div className="flex rounded-lg border border-line p-0.5">
              {([[true, "Com desconto"], [false, "Sem desconto"]] as [boolean, string][]).map(([v, r]) => (
                <button key={r} onClick={() => setComDesconto(v)}
                  className={`rounded-md px-2 py-0.5 text-[11px] ${comDesconto === v ? "bg-ink-700 text-chalk" : "text-mist"}`}>{r}</button>
              ))}
            </div>
          )}
          {temSorteio && (
            <button onClick={() => setSemente((s) => s + 1)} className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-mist hover:text-chalk">
              <Shuffle className="h-3 w-3" /> sortear de novo
            </button>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-line bg-[#0b141a] p-3">
        <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-[#005c4b] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef] shadow">
          {montado.trim() || <span className="italic opacity-60">(mensagem vazia)</span>}
          <span className="mt-1 block text-right text-[10px] text-[#8fa8a0]">09:41 ✓✓</span>
        </div>
      </div>
      {temOpcional && !comDesconto && (
        <p className="text-[10px] text-mist">Quem não tem desconto que valha anunciar recebe a mensagem sem os trechos roxos.</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- proteções */

function Protecoes({ carteira, padrao }: { carteira: any; padrao: Record<string, any> }) {
  const g = carteira.guardrails ?? padrao.bot_guardrails ?? {};
  const nuncaCitar: string[] = Array.isArray(g.nunca_citar) ? g.nunca_citar : [];
  const rodadas = Number(g.max_rodadas_desconto ?? 1);
  const itens: { titulo: string; texto: string; ligado?: boolean }[] = [
    { titulo: "Pediu para parar", texto: "Para na hora, e aquele número não recebe mais nada — de nenhum chip." },
    { titulo: "Número de outra pessoa", texto: "Pede desculpas e tira o número do cadastro do devedor." },
    { titulo: "Falecimento", texto: "Encerra com respeito, sem falar de valor com a família." },
    { titulo: "Advogado, Procon ou justiça", texto: "O robô sai da conversa na hora e a equipe é avisada." },
    { titulo: "Confirma quem é", texto: "Antes de revelar CPF ou a origem da dívida, confirma que fala com a pessoa certa.", ligado: g.confirmar_identidade !== false },
    { titulo: "Nunca inventa valor", texto: "Todo número sai do cálculo do sistema, pelas faixas de desconto desta carteira." },
    { titulo: "Nunca ameaça", texto: nuncaCitar.length ? `Não cita ${nuncaCitar.join(", ")}, nem consequência por não pagar.` : "Não cita consequência por não pagar." },
    { titulo: "Prescrição", texto: "Se perguntarem, responde com honestidade que a dívida pode estar prescrita e que pagar é voluntário.", ligado: g.responder_prescricao_honestamente !== false },
    { titulo: "Desconto extra", texto: `No máximo ${rodadas} vez${rodadas > 1 ? "es" : ""}, e só depois de a pessoa recusar a primeira proposta.` },
  ];
  return (
    <Secao id="passo-5" numero={5} icone={ShieldCheck} titulo="Proteções que valem em qualquer etapa"
      explicacao="Regras que o sistema aplica sozinho, antes de qualquer etapa do fluxo. São elas que evitam bloqueio do número, denúncia e reclamação no Procon. Tom, termos proibidos e descontos se ajustam na aba Conhecimento.">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {itens.map((item) => (
          <div key={item.titulo} className="flex gap-2.5 rounded-xl border border-line bg-ink-900 p-3">
            <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${item.ligado === false ? "text-mist" : "text-emerald"}`} />
            <div>
              <p className="flex items-center gap-2 text-sm text-chalk">
                {item.titulo}
                {item.ligado === false && <Badge tone="amber">desligado</Badge>}
              </p>
              <p className="text-[11px] leading-relaxed text-mist">{item.texto}</p>
            </div>
          </div>
        ))}
      </div>
    </Secao>
  );
}
