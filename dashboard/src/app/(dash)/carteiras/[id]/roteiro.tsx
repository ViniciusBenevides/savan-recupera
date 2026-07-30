"use client";
import * as React from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  addEdge, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, Button, Input, Label, Badge, Switch } from "@/components/ui/primitives";
import { useTheme } from "@/components/ThemeToggle";
import {
  Bot, Sparkles, Save, Check, Plus, Trash2, X, MessageSquareText, Flag, CornerDownRight,
} from "lucide-react";
import {
  calcularPosicoes, idUnico, validar, inalcancaveis, LARGURA_NO,
  type EtapaRoteiro,
} from "./roteiro-layout";

/* ---------------------------------------------------------------- nó de etapa */

type DadosNo = {
  etapa: EtapaRoteiro;
  primeira: boolean;
  final: boolean;
  selecionado: boolean;
  aoAbrir: () => void;
};

function NoEtapa({ data }: NodeProps<Node<DadosNo>>) {
  const { etapa, primeira, final, selecionado, aoAbrir } = data;
  return (
    <div
      onClick={aoAbrir}
      style={{ width: LARGURA_NO }}
      className={`cursor-pointer rounded-2xl border bg-ink-850 shadow-lg transition-colors ${
        selecionado ? "border-emerald ring-1 ring-emerald/40" : "border-line hover:border-ink-500"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-ink-900 !bg-mist" />

      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
          primeira ? "bg-emerald/15 text-emerald" : final ? "bg-violet/15 text-violet" : "bg-blue/15 text-blue"
        }`}>
          {primeira ? <Bot className="h-3.5 w-3.5" /> : final ? <Flag className="h-3.5 w-3.5" /> : <MessageSquareText className="h-3.5 w-3.5" />}
        </span>
        <span className="truncate font-mono text-[11px] text-chalk">{etapa.id}</span>
        {primeira && <Badge tone="green">início</Badge>}
        {final && !primeira && <Badge tone="violet">fim</Badge>}
      </div>

      <div className="px-3 py-2.5">
        {etapa.objetivo && <div className="mb-1 truncate text-xs font-600 text-chalk">{etapa.objetivo}</div>}
        <p className="line-clamp-3 text-[11px] leading-snug text-mist">
          {etapa.instrucao || <span className="italic opacity-60">sem instrução — clique para escrever</span>}
        </p>
      </div>

      {(etapa.casos ?? []).length > 0 && (
        <div className="border-t border-line px-3 py-1.5 text-[10px] text-mist">
          {(etapa.casos ?? []).length} caminho(s)
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-ink-900 !bg-emerald" />
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
  const orfas = inalcancaveis(etapas);

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
        primeira: i === 0,
        final: (e.casos ?? []).length === 0,
        selecionado: abertaId === e.id,
        aoAbrir: () => setAbertaId(e.id),
      },
    })));
    setArestas(etapas.flatMap((e) =>
      (e.casos ?? [])
        .filter((c) => c.vai_para)
        .map((c, j) => ({
          id: `${e.id}->${c.vai_para}-${j}`,
          source: e.id,
          target: c.vai_para,
          label: c.quando || "quando…",
          animated: true,
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 6,
          style: { strokeWidth: 1.5 },
        }))));
  }, [etapas, abertaId, setNos, setArestas]);

  // arrastar o nó guarda a posição na etapa
  const aoTerminarArraste = React.useCallback((_: unknown, no: Node) => {
    setEtapas((es) => es.map((e) => (e.id === no.id ? { ...e, pos: { x: Math.round(no.position.x), y: Math.round(no.position.y) } } : e)));
  }, []);

  // ligar dois nós arrastando = novo caminho na etapa de origem
  const aoConectar = React.useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    setEtapas((es) => es.map((e) => (e.id !== c.source ? e
      : { ...e, casos: [...(e.casos ?? []), { quando: "", vai_para: c.target! }] })));
    setAbertaId(c.source);
    setArestas((as) => addEdge({ ...c, animated: true }, as));
  }, [setArestas]);

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

  function novaEtapa() {
    const id = idUnico("nova_etapa", etapas.map((e) => e.id));
    const ultima = etapas[etapas.length - 1];
    const pos = ultima?.pos ? { x: ultima.pos.x + 340, y: ultima.pos.y } : { x: etapas.length * 340, y: 0 };
    setEtapas((es) => [...es, { id, objetivo: "", instrucao: "", casos: [], pos }]);
    setAbertaId(id);
  }

  function removerEtapa(id: string) {
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
            Esta carteira ainda não tem fluxo — o robô conversa livremente seguindo o prompt. Comece pelo
            modelo pronto (identificação → proposta → objeção → pagamento, já com as regras jurídicas
            embutidas) e ajuste arrastando os blocos.
          </p>
          <div className="flex gap-2">
            <Button disabled={!modelo} onClick={() => { setEtapas(modelo?.etapas ?? []); setAtivo(true); }}>
              <Sparkles className="h-4 w-4" /> Usar o modelo pronto
            </Button>
            <Button variant="outline" onClick={novaEtapa}><Plus className="h-4 w-4" /> Começar do zero</Button>
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
          minZoom={0.25}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-ink-850" />
        </ReactFlow>

        {/* barra flutuante */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-line bg-ink-850/95 p-1.5 shadow-lg backdrop-blur">
          <button onClick={novaEtapa} title="Nova etapa"
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-chalk transition-colors hover:bg-ink-800">
            <Plus className="h-3.5 w-3.5" /> Etapa
          </button>
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

        {/* painel lateral da etapa selecionada */}
        {aberta && (
          <div className="absolute right-0 top-0 z-20 flex h-full w-[340px] flex-col gap-3 overflow-y-auto border-l border-line bg-ink-850 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-mist">Etapa</span>
                <h4 className="font-mono text-sm text-chalk">{aberta.id}</h4>
              </div>
              <button onClick={() => setAbertaId(null)} className="text-mist hover:text-chalk" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <Label className="text-xs">Nome da etapa</Label>
              <Input defaultValue={aberta.objetivo || aberta.id}
                     onBlur={(e) => { mudarAberta("objetivo", e.target.value); renomearAberta(e.target.value); }}
                     placeholder="Ex.: Confirmar identidade" />
              <p className="mt-1 text-[10px] text-mist">Ao sair do campo, o identificador é atualizado junto.</p>
            </div>

            <div>
              <Label className="text-xs">O que o robô faz aqui</Label>
              <textarea
                value={aberta.instrucao ?? ""} rows={6}
                onChange={(e) => mudarAberta("instrucao", e.target.value)}
                placeholder="Instrução direta para o robô nesta etapa."
                className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2 text-sm text-chalk outline-none placeholder:text-mist focus:border-emerald"
              />
            </div>

            <div>
              <Label className="text-xs">Caminhos</Label>
              <div className="mt-1 flex flex-col gap-2">
                {(aberta.casos ?? []).map((c, j) => (
                  <div key={j} className="rounded-xl border border-line bg-ink-900 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-mist">
                      <CornerDownRight className="h-3 w-3" /> se…
                      <button
                        onClick={() => mudarAberta("casos", (aberta.casos ?? []).filter((_, m) => m !== j))}
                        className="ml-auto text-mist hover:text-rose" aria-label="remover caminho"
                      ><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <input
                      value={c.quando}
                      onChange={(e) => mudarAberta("casos", (aberta.casos ?? []).map((x, m) => (m === j ? { ...x, quando: e.target.value } : x)))}
                      placeholder="a pessoa confirmar que é ela"
                      className="mt-1.5 h-8 w-full rounded-lg border border-line bg-ink-850 px-2.5 text-xs text-chalk outline-none placeholder:text-mist focus:border-emerald"
                    />
                    <select
                      value={c.vai_para}
                      onChange={(e) => mudarAberta("casos", (aberta.casos ?? []).map((x, m) => (m === j ? { ...x, vai_para: e.target.value } : x)))}
                      className="mt-1.5 h-8 w-full rounded-lg border border-line bg-ink-850 px-2 font-mono text-[11px] text-chalk outline-none focus:border-emerald"
                    >
                      <option value="">vai para…</option>
                      {etapas.filter((e) => e.id !== aberta.id).map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}
                    </select>
                  </div>
                ))}
                <button
                  onClick={() => mudarAberta("casos", [...(aberta.casos ?? []), { quando: "", vai_para: "" }])}
                  className="self-start text-[11px] text-emerald underline-offset-2 hover:underline"
                >+ caminho</button>
                {(aberta.casos ?? []).length === 0 && (
                  <p className="text-[11px] text-mist">Sem caminhos, esta etapa encerra o atendimento.</p>
                )}
              </div>
            </div>

            <button
              onClick={() => removerEtapa(aberta.id)}
              className="mt-auto flex items-center justify-center gap-1.5 rounded-xl border border-rose/30 px-3 py-2 text-xs text-rose transition-colors hover:bg-rose/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover esta etapa
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-mist">
        Clique num bloco para editar. Arraste da bolinha verde à direita até outro bloco para criar um caminho.
      </p>

      {problemas.map((p) => (
        <div key={p} className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">{p}</div>
      ))}
      {orfas.length > 0 && (
        <div className="rounded-xl border border-line bg-ink-850 px-4 py-3 text-sm text-mist">
          Etapas que ninguém alcança a partir do início: <b className="text-chalk">{orfas.join(", ")}</b>.
        </div>
      )}
      {erro && <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">{erro}</div>}

      <div className="flex items-center gap-3">
        <Button disabled={salvando || problemas.length > 0} onClick={gravar}>
          {ok ? <><Check className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar fluxo</>}
        </Button>
        <button onClick={() => { setEtapas([]); setAtivo(false); setAbertaId(null); }}
                className="text-xs text-mist hover:text-rose">limpar e voltar ao robô livre</button>
      </div>
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
            Cada bloco é uma etapa da conversa: o robô sabe o que fazer ali e para onde ir conforme a resposta
            da pessoa. É assim que a <b className="text-chalk">confirmação de identidade</b> deixa de ser um
            pedido no texto e vira uma etapa que segura o resto da conversa.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-mist">{ativo ? "Fluxo ligado" : "Fluxo desligado"}</span>
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
