"use client";
import * as React from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, Button, Input, Label, Badge, Switch, HelpHint } from "@/components/ui/primitives";
import { useTheme } from "@/components/ThemeToggle";
import {
  Bot, Sparkles, Save, Check, Plus, Trash2, X, MessageSquareText, Flag, CornerDownRight,
  Send, Clock, HandCoins,
} from "lucide-react";
import {
  calcularPosicoes, idUnico, validar, avisos, inalcancaveis, cadeiaDeDisparo, etapaDeEntrada,
  tipoDe, ehMensagem, ROTULO, LARGURA_NO,
  type EtapaRoteiro, type TipoEtapa,
} from "./roteiro-layout";

/* ---------------------------------------------------------------- nó de etapa */

const ESTILO: Record<TipoEtapa, { icone: any; cor: string }> = {
  disparo: { icone: Send, cor: "bg-emerald/15 text-emerald" },
  followup: { icone: Clock, cor: "bg-amber/15 text-amber" },
  conversa: { icone: MessageSquareText, cor: "bg-blue/15 text-blue" },
  pos_pagamento: { icone: HandCoins, cor: "bg-violet/15 text-violet" },
};

type DadosNo = {
  etapa: EtapaRoteiro;
  entrada: boolean;
  final: boolean;
  selecionado: boolean;
  aoAbrir: () => void;
};

function NoEtapa({ data }: NodeProps<Node<DadosNo>>) {
  const { etapa, entrada, final, selecionado, aoAbrir } = data;
  const tipo = tipoDe(etapa);
  const { icone: Icone, cor } = ESTILO[tipo];
  const mensagem = ehMensagem(etapa);
  const textos = (etapa.textos ?? []).filter((t) => t.trim());
  const bolinha = "!h-2.5 !w-2.5 !border-2 !border-ink-900";

  return (
    <div
      onClick={aoAbrir}
      style={{ width: LARGURA_NO }}
      className={`cursor-pointer rounded-2xl border bg-ink-850 shadow-lg transition-colors ${
        selecionado ? "border-emerald ring-1 ring-emerald/40" : "border-line hover:border-ink-500"
      }`}
    >
      {/* mensagens se encadeiam de cima para baixo (a linha do tempo); a conversa corre da esquerda
          para a direita, como antes */}
      {mensagem ? (
        <>
          <Handle type="target" position={Position.Top} id="seq" className={`${bolinha} !bg-mist`} />
          {tipo !== "pos_pagamento" && (
            <>
              <Handle type="source" position={Position.Bottom} id="seq" className={`${bolinha} !bg-mist`} />
              <Handle type="source" position={Position.Right} id="resp" className={`${bolinha} !bg-emerald`} />
            </>
          )}
        </>
      ) : (
        <Handle type="target" position={Position.Left} className={`${bolinha} !bg-mist`} />
      )}

      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${cor}`}>
          {final && !mensagem ? <Flag className="h-3.5 w-3.5" /> : <Icone className="h-3.5 w-3.5" />}
        </span>
        <span className="truncate font-mono text-[11px] text-chalk">{etapa.id}</span>
        {tipo === "disparo" && <Badge tone="green">1ª mensagem</Badge>}
        {tipo === "followup" && <Badge tone="amber">{etapa.espera_horas ?? 24}h depois</Badge>}
        {tipo === "pos_pagamento" && <Badge tone="violet">após o Pix</Badge>}
        {entrada && <Badge tone="green">entrada</Badge>}
        {final && !mensagem && !entrada && <Badge tone="violet">fim</Badge>}
      </div>

      <div className="px-3 py-2.5">
        {etapa.objetivo && <div className="mb-1 truncate text-xs font-600 text-chalk">{etapa.objetivo}</div>}
        <p className="line-clamp-3 text-[11px] leading-snug text-mist">
          {mensagem
            ? (textos[0] || <span className="italic opacity-60">sem texto — clique para escrever</span>)
            : (etapa.instrucao || <span className="italic opacity-60">sem instrução — clique para escrever</span>)}
        </p>
      </div>

      {mensagem
        ? textos.length > 1 && (
            <div className="border-t border-line px-3 py-1.5 text-[10px] text-mist">
              {textos.length} variações (sorteia uma)
            </div>
          )
        : (etapa.casos ?? []).length > 0 && (
            <div className="border-t border-line px-3 py-1.5 text-[10px] text-mist">
              {(etapa.casos ?? []).length} caminho(s)
            </div>
          )}

      {!mensagem && <Handle type="source" position={Position.Right} className={`${bolinha} !bg-emerald`} />}
    </div>
  );
}

const tiposDeNo = { etapa: NoEtapa };

/* ---------------------------------------------------------------- canvas */

function Canvas({ carteira, padrao, salvar }: {
  carteira: any; padrao: Record<string, any>; salvar: (body: any) => Promise<boolean>;
}) {
  const tema = useTheme();
  const { fitView } = useReactFlow();
  const modelo = padrao.roteiro_modelo ?? null;
  const salvo = carteira.roteiro ?? null;

  const [ativo, setAtivo] = React.useState<boolean>(!!salvo?.ativo);
  const [etapas, setEtapas] = React.useState<EtapaRoteiro[]>(salvo?.etapas ?? []);
  const [abertaId, setAbertaId] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [erro, setErro] = React.useState("");

  const problemas = validar(etapas);
  const alertas = avisos(etapas);
  const orfas = inalcancaveis(etapas);
  const entrada = etapaDeEntrada(etapas);
  const temDisparo = etapas.some((e) => tipoDe(e) === "disparo");

  // ---- grafo derivado das etapas
  const [nos, setNos, aoMudarNos] = useNodesState<Node<DadosNo>>([]);
  const [arestas, setArestas, aoMudarArestas] = useEdgesState<Edge>([]);

  React.useEffect(() => {
    const auto = calcularPosicoes(etapas);
    setNos(etapas.map((e, i) => ({
      id: e.id,
      type: "etapa",
      position: e.pos ?? auto[e.id] ?? { x: i * 340, y: 0 },
      data: {
        etapa: e,
        entrada: e.id === entrada,
        final: (e.casos ?? []).length === 0,
        selecionado: abertaId === e.id,
        aoAbrir: () => setAbertaId(e.id),
      },
    })));

    const doCaso: Edge[] = etapas.flatMap((e) =>
      (e.casos ?? [])
        .filter((c) => c.vai_para)
        .map((c, j) => ({
          id: `${e.id}->${c.vai_para}-${j}`,
          source: e.id,
          target: c.vai_para,
          sourceHandle: ehMensagem(e) ? "resp" : undefined,
          label: c.quando || "quando…",
          animated: true,
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 6,
          style: { strokeWidth: 1.5 },
        })));

    // a corrente de reenvio é derivada da ORDEM dos blocos: mostra, mas não se arrasta
    const derivadas: Edge[] = cadeiaDeDisparo(etapas)
      .map((a, j) => ({
        id: `seq-${a.origem}->${a.destino}-${j}`,
        source: a.origem, target: a.destino,
        sourceHandle: "seq", targetHandle: "seq",
        label: a.rotulo, selectable: false, deletable: false,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        style: { strokeWidth: 1.5, strokeDasharray: "5 4" },
      }));

    setArestas([...doCaso, ...derivadas]);
  }, [etapas, abertaId, entrada, setNos, setArestas]);

  // arrastar o nó guarda a posição na etapa
  const aoTerminarArraste = React.useCallback((_: unknown, no: Node) => {
    setEtapas((es) => es.map((e) => (e.id === no.id ? { ...e, pos: { x: Math.round(no.position.x), y: Math.round(no.position.y) } } : e)));
  }, []);

  // ligar dois nós arrastando = novo caminho. De um bloco de mensagem só sai UM caminho ("respondeu"),
  // e ele tem de cair numa etapa de conversa — o resto do encadeamento é a ordem dos blocos.
  const aoConectar = React.useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setEtapas((es) => {
      const origem = es.find((e) => e.id === c.source);
      const destino = es.find((e) => e.id === c.target);
      if (!origem || !destino) return es;
      if (ehMensagem(origem)) {
        if (tipoDe(destino) !== "conversa") return es;
        // a entrada da conversa é uma só (vale para quem responde o disparo ou um reenvio), então
        // ela mora no bloco de disparo — arrastar de qualquer bloco de mensagem mexe nela
        const dono = es.find((e) => tipoDe(e) === "disparo")?.id ?? origem.id;
        return es.map((e) => (e.id === dono
          ? { ...e, casos: [{ quando: "a pessoa responder", vai_para: c.target! }] }
          : ehMensagem(e) ? { ...e, casos: [] } : e));
      }
      if (ehMensagem(destino)) return es; // conversa não volta para disparo/follow-up
      return es.map((e) => (e.id !== c.source ? e
        : { ...e, casos: [...(e.casos ?? []), { quando: "", vai_para: c.target! }] }));
    });
    setAbertaId(c.source);
  }, []);

  const aberta = etapas.find((e) => e.id === abertaId) ?? null;

  function mudarAberta(campo: keyof EtapaRoteiro, valor: any) {
    if (!aberta) return;
    setEtapas((es) => es.map((e) => (e.id === aberta.id ? { ...e, [campo]: valor } : e)));
  }

  function renomearAberta(novoRotulo: string) {
    if (!aberta) return;
    const novo = idUnico(novoRotulo, etapas.filter((e) => e.id !== aberta.id).map((e) => e.id));
    setEtapas((es) => es.map((e) => ({
      ...e,
      id: e.id === aberta.id ? novo : e.id,
      casos: (e.casos ?? []).map((c) => (c.vai_para === aberta.id ? { ...c, vai_para: novo } : c)),
    })));
    setAbertaId(novo);
  }

  function novoBloco(tipo: TipoEtapa) {
    const base: Record<TipoEtapa, Partial<EtapaRoteiro>> = {
      disparo: { objetivo: "Primeira mensagem", textos: [""], casos: entrada ? [{ quando: "a pessoa responder", vai_para: entrada }] : [] },
      followup: { objetivo: `Reenvio ${etapas.filter((e) => tipoDe(e) === "followup").length + 1}`, textos: [""], espera_horas: 24 },
      conversa: { objetivo: "", instrucao: "", casos: [] },
      pos_pagamento: { objetivo: "Depois do pagamento", textos: [""] },
    };
    const semente: Record<TipoEtapa, string> = {
      disparo: "abordagem", followup: "followup", conversa: "nova_etapa", pos_pagamento: "pos_pagamento",
    };
    const id = idUnico(semente[tipo], etapas.map((e) => e.id));
    setEtapas((es) => [...es, { id, tipo, ...base[tipo] } as EtapaRoteiro]);
    setAbertaId(id);
  }

  function removerBloco(id: string) {
    setEtapas((es) => es.filter((e) => e.id !== id).map((e) => ({
      ...e, casos: (e.casos ?? []).filter((c) => c.vai_para !== id),
    })));
    if (abertaId === id) setAbertaId(null);
  }

  async function gravar() {
    setSalvando(true); setErro(""); setOk(false);
    const sucesso = await salvar({ roteiro: etapas.length ? { ativo, etapas } : null });
    if (sucesso) { setOk(true); setTimeout(() => setOk(false), 2500); }
    else setErro("Falha ao salvar o fluxo.");
    setSalvando(false);
  }

  /* ---- estado vazio: oferece o modelo pronto ---- */
  if (etapas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Cabecalho ativo={ativo} setAtivo={setAtivo} />
        <Card className="flex flex-col items-start gap-3">
          <p className="max-w-2xl text-sm text-mist">
            Esta carteira ainda não tem fluxo: ela dispara o texto padrão do sistema e o robô conversa
            livremente pelo prompt. Comece pelo modelo pronto — ele já vem com a primeira mensagem, os
            três reenvios, a conversa (identificação → proposta → objeção → pagamento) e o termo de
            quitação — e ajuste arrastando os blocos.
          </p>
          <div className="flex gap-2">
            <Button disabled={!modelo} onClick={() => { setEtapas(modelo?.etapas ?? []); setAtivo(true); }}>
              <Sparkles className="h-4 w-4" /> Usar o modelo pronto
            </Button>
            <Button variant="outline" onClick={() => novoBloco("disparo")}><Plus className="h-4 w-4" /> Começar do zero</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho ativo={ativo} setAtivo={setAtivo} />

      <div className="relative h-[600px] overflow-hidden rounded-2xl border border-line bg-ink-900">
        <ReactFlow
          nodes={nos}
          edges={arestas}
          onNodesChange={aoMudarNos}
          onEdgesChange={aoMudarArestas}
          onNodeDragStop={aoTerminarArraste}
          onConnect={aoConectar}
          onPaneClick={() => setAbertaId(null)}
          nodeTypes={tiposDeNo}
          colorMode={tema === "light" ? "light" : "dark"}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-ink-850" />
        </ReactFlow>

        {/* barra flutuante */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-line bg-ink-850/95 p-1.5 shadow-lg backdrop-blur">
          {(["disparo", "followup", "conversa", "pos_pagamento"] as TipoEtapa[])
            .filter((t) => t !== "disparo" || !temDisparo)
            .map((t) => {
              const { icone: Icone } = ESTILO[t];
              return (
                <button key={t} onClick={() => novoBloco(t)} title={`Novo bloco de ${ROTULO[t].toLowerCase()}`}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-chalk transition-colors hover:bg-ink-800">
                  <Icone className="h-3.5 w-3.5" /> {ROTULO[t]}
                </button>
              );
            })}
          <span className="mx-0.5 h-4 w-px bg-line" />
          <button onClick={() => fitView({ duration: 300 })} title="Enquadrar"
                  className="rounded-lg px-2.5 py-1.5 text-xs text-mist transition-colors hover:bg-ink-800 hover:text-chalk">
            Enquadrar
          </button>
          <button
            onClick={() => setEtapas((es) => es.map((e) => ({ ...e, pos: undefined })))}
            title="Reorganizar automaticamente"
            className="rounded-lg px-2.5 py-1.5 text-xs text-mist transition-colors hover:bg-ink-800 hover:text-chalk"
          >
            Reorganizar
          </button>
        </div>

        {/* painel lateral do bloco selecionado */}
        {aberta && (
          <PainelBloco
            aberta={aberta}
            etapas={etapas}
            mudar={mudarAberta}
            renomear={renomearAberta}
            remover={() => removerBloco(aberta.id)}
            fechar={() => setAbertaId(null)}
          />
        )}
      </div>

      <p className="text-xs text-mist">
        Clique num bloco para editar. Arraste da bolinha verde à direita até outro bloco para criar um
        caminho. A linha tracejada entre as mensagens é a ordem dos reenvios — para mudá-la, mude o
        tempo de espera de cada follow-up.
      </p>

      {problemas.map((p) => (
        <div key={p} className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">{p}</div>
      ))}
      {alertas.map((a) => (
        <div key={a} className="rounded-xl border border-line bg-ink-850 px-4 py-3 text-sm text-mist">{a}</div>
      ))}
      {orfas.length > 0 && (
        <div className="rounded-xl border border-line bg-ink-850 px-4 py-3 text-sm text-mist">
          Blocos de conversa que ninguém alcança a partir da entrada: <b className="text-chalk">{orfas.join(", ")}</b>.
        </div>
      )}
      {erro && <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">{erro}</div>}

      <div className="flex items-center gap-3">
        <Button disabled={salvando || problemas.length > 0} onClick={gravar}>
          {ok ? <><Check className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar fluxo</>}
        </Button>
        <button onClick={() => { if (confirm("Apagar o fluxo desta carteira? Ela volta ao texto padrão do sistema e ao robô livre.")) { setEtapas([]); setAtivo(false); setAbertaId(null); } }}
                className="text-xs text-mist hover:text-rose">apagar o fluxo</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- painel lateral */

function PainelBloco({ aberta, etapas, mudar, renomear, remover, fechar }: {
  aberta: EtapaRoteiro;
  etapas: EtapaRoteiro[];
  mudar: (campo: keyof EtapaRoteiro, valor: any) => void;
  renomear: (rotulo: string) => void;
  remover: () => void;
  fechar: () => void;
}) {
  const tipo = tipoDe(aberta);
  const mensagem = ehMensagem(aberta);
  const textos = aberta.textos ?? [];
  const conversas = etapas.filter((e) => tipoDe(e) === "conversa");

  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-[360px] flex-col gap-3 overflow-y-auto border-l border-line bg-ink-850 p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-mist">{ROTULO[tipo]}</span>
          <h4 className="font-mono text-sm text-chalk">{aberta.id}</h4>
        </div>
        <button onClick={fechar} className="text-mist hover:text-chalk" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <Label className="text-xs">Nome do bloco</Label>
        <Input defaultValue={aberta.objetivo || aberta.id}
               onBlur={(e) => { mudar("objetivo", e.target.value); renomear(e.target.value); }}
               placeholder={mensagem ? "Ex.: Primeira mensagem" : "Ex.: Confirmar identidade"} />
        <p className="mt-1 text-[10px] text-mist">Ao sair do campo, o identificador é atualizado junto.</p>
      </div>

      {tipo === "followup" && (
        <div>
          <Label className="flex items-center gap-1.5 text-xs">
            Enviar depois de (horas)
            <HelpHint text="Tempo contado desde a última mensagem enviada. Só sai se a pessoa não tiver respondido nada até lá." />
          </Label>
          <Input type="number" min={1} value={aberta.espera_horas ?? 24}
                 onChange={(e) => mudar("espera_horas", Number(e.target.value))} />
        </div>
      )}

      {mensagem ? (
        <div>
          <Label className="flex items-center gap-1.5 text-xs">
            Texto que sai
            <HelpHint text="Texto pronto, sem IA. Use {{primeiro_nome}}, {{nome_bot}} e {{credor}} para personalizar, e {oi|olá} para o sistema sortear uma palavra. Cada variação abaixo é sorteada por envio — texto repetido é o que o WhatsApp lê como robô." />
          </Label>
          <div className="mt-1 flex flex-col gap-2">
            {textos.map((t, j) => (
              <div key={j} className="rounded-xl border border-line bg-ink-900 p-2">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] text-mist">
                  variação {j + 1}
                  {textos.length > 1 && (
                    <button onClick={() => mudar("textos", textos.filter((_, m) => m !== j))}
                            className="ml-auto text-mist hover:text-rose" aria-label="remover variação">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <textarea
                  value={t} rows={5}
                  onChange={(e) => mudar("textos", textos.map((x, m) => (m === j ? e.target.value : x)))}
                  placeholder="{Oi|Olá}, {{primeiro_nome}}! Aqui é a {{nome_bot}}…"
                  className="w-full rounded-lg border border-line bg-ink-850 px-2.5 py-2 text-xs text-chalk outline-none placeholder:text-mist focus:border-emerald"
                />
              </div>
            ))}
            <button onClick={() => mudar("textos", [...textos, ""])}
                    className="self-start text-[11px] text-emerald underline-offset-2 hover:underline">
              + variação
            </button>
          </div>
        </div>
      ) : (
        <div>
          <Label className="text-xs">O que o robô faz aqui</Label>
          <textarea
            value={aberta.instrucao ?? ""} rows={6}
            onChange={(e) => mudar("instrucao", e.target.value)}
            placeholder="Instrução direta para o robô nesta etapa."
            className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2 text-sm text-chalk outline-none placeholder:text-mist focus:border-emerald"
          />
        </div>
      )}

      {/* disparo/follow-up só têm um caminho: para onde a conversa começa quando a pessoa responde */}
      {tipo === "disparo" && (
        <div>
          <Label className="flex items-center gap-1.5 text-xs">
            Quando a pessoa responder, comece em
            <HelpHint text="A partir da resposta quem assume é a IA, seguindo os blocos de conversa. Vale também para quem responde a um follow-up." />
          </Label>
          <select
            value={(aberta.casos ?? [])[0]?.vai_para ?? ""}
            onChange={(e) => mudar("casos", e.target.value ? [{ quando: "a pessoa responder", vai_para: e.target.value }] : [])}
            className="h-9 w-full rounded-lg border border-line bg-ink-900 px-2 font-mono text-[11px] text-chalk outline-none focus:border-emerald"
          >
            <option value="">robô livre (sem bloco de conversa)</option>
            {conversas.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}
          </select>
        </div>
      )}

      {tipo === "pos_pagamento" && (
        <p className="rounded-lg border border-violet/25 bg-violet/5 px-3 py-2 text-[11px] text-mist">
          Sai sozinho quando o Asaas confirma o Pix. Havendo mais de um bloco destes, saem na ordem em
          que aparecem no fluxo (confirmação e depois o termo, por exemplo).
        </p>
      )}

      {tipo === "conversa" && (
        <div>
          <Label className="text-xs">Caminhos</Label>
          <div className="mt-1 flex flex-col gap-2">
            {(aberta.casos ?? []).map((c, j) => (
              <div key={j} className="rounded-xl border border-line bg-ink-900 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-mist">
                  <CornerDownRight className="h-3 w-3" /> se…
                  <button
                    onClick={() => mudar("casos", (aberta.casos ?? []).filter((_, m) => m !== j))}
                    className="ml-auto text-mist hover:text-rose" aria-label="remover caminho"
                  ><Trash2 className="h-3 w-3" /></button>
                </div>
                <input
                  value={c.quando}
                  onChange={(e) => mudar("casos", (aberta.casos ?? []).map((x, m) => (m === j ? { ...x, quando: e.target.value } : x)))}
                  placeholder="a pessoa confirmar que é ela"
                  className="mt-1.5 h-8 w-full rounded-lg border border-line bg-ink-850 px-2.5 text-xs text-chalk outline-none placeholder:text-mist focus:border-emerald"
                />
                <select
                  value={c.vai_para}
                  onChange={(e) => mudar("casos", (aberta.casos ?? []).map((x, m) => (m === j ? { ...x, vai_para: e.target.value } : x)))}
                  className="mt-1.5 h-8 w-full rounded-lg border border-line bg-ink-850 px-2 font-mono text-[11px] text-chalk outline-none focus:border-emerald"
                >
                  <option value="">vai para…</option>
                  {conversas.filter((e) => e.id !== aberta.id).map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}
                </select>
              </div>
            ))}
            <button
              onClick={() => mudar("casos", [...(aberta.casos ?? []), { quando: "", vai_para: "" }])}
              className="self-start text-[11px] text-emerald underline-offset-2 hover:underline"
            >+ caminho</button>
            {(aberta.casos ?? []).length === 0 && (
              <p className="text-[11px] text-mist">Sem caminhos, este bloco encerra o atendimento.</p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={remover}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-xl border border-rose/30 px-3 py-2 text-xs text-rose transition-colors hover:bg-rose/10"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remover este bloco
      </button>
    </div>
  );
}

function Cabecalho({ ativo, setAtivo }: { ativo: boolean; setAtivo: (v: boolean) => void }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald/12 text-emerald">
          <Bot className="h-4 w-4" />
        </span>
        <div className="max-w-2xl">
          <h4 className="font-display text-base font-600 text-chalk">Fluxo do robô</h4>
          <p className="mt-0.5 text-xs text-mist">
            A linha do tempo inteira desta carteira num desenho só: a{" "}
            <b className="text-chalk">1ª mensagem</b> e os <b className="text-chalk">reenvios</b> saem com
            texto pronto (sem IA, é o que segura o anti-ban), e a partir da resposta a{" "}
            <b className="text-chalk">conversa</b> segue por etapas — é assim que a confirmação de
            identidade deixa de ser um pedido no texto e vira uma etapa que segura o resto.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-mist">{ativo ? "Conversa guiada ligada" : "Conversa guiada desligada"}</span>
        <HelpHint text="Desligado, os blocos de mensagem continuam valendo (disparo, reenvios e pós-pagamento), mas a conversa depois da resposta volta a ser livre pelo prompt." />
        <Switch checked={ativo} onChange={setAtivo} />
      </div>
    </Card>
  );
}

export function AbaRoteiro(props: {
  carteira: any; padrao: Record<string, any>; salvar: (body: any) => Promise<boolean>;
}) {
  // o ReactFlowProvider é necessário para o useReactFlow() do canvas
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}
