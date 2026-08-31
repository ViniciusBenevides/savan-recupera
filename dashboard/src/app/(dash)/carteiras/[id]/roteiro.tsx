"use client";
import * as React from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, Button, Input, Label, Badge, Switch, HelpHint, Textarea } from "@/components/ui/primitives";
import { useTheme } from "@/components/ThemeToggle";
import {
  Bot, Sparkles, Save, Check, Plus, Trash2, X, MessageSquareText, Flag, CornerDownRight, Play,
  Send, Clock, HandCoins, AlertTriangle, ClipboardCopy, ClipboardPaste, Undo2, Redo2,
  Expand, Search, Copy,
  Maximize2,
} from "lucide-react";
import {
  calcularPosicoes, idUnico, diagnosticar, avisos, inalcancaveis, cadeiaDeDisparo, etapaDeEntrada,
  serializarRoteiro, importarRoteiro,
  tipoDe, ehMensagem, ROTULO, LARGURA_NO,
  type EtapaRoteiro, type TipoEtapa, type CasoRoteiro,
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
  problema: boolean;
  aoAbrir: () => void;
};

function NoEtapa({ data }: NodeProps<Node<DadosNo>>) {
  const { etapa, entrada, final, selecionado, problema, aoAbrir } = data;
  const tipo = tipoDe(etapa);
  const { icone: Icone, cor } = ESTILO[tipo];
  const mensagem = ehMensagem(etapa);
  const textos = (etapa.textos ?? []).filter((t) => t.trim());
  const bolinha = "!h-2.5 !w-2.5 !border-2 !border-ink-900";
  const etiqueta = tipo === "disparo" ? "Mensagem inicial"
    : tipo === "followup" ? "Aguardar e reenviar"
      : tipo === "pos_pagamento" ? "Pós-pagamento"
        : etapa.usa_conhecimento !== false ? "IA + conhecimento" : "Mensagem pela IA";

  return (
    <div
      onClick={aoAbrir}
      style={{ width: LARGURA_NO }}
      className={`cursor-pointer rounded-2xl border bg-ink-850 shadow-lg transition-colors ${
        selecionado ? "border-emerald ring-1 ring-emerald/40" : problema ? "border-rose/70" : "border-line hover:border-ink-500"
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
        <span className="truncate text-[9px] font-600 uppercase tracking-[0.14em] text-mist">{etiqueta}</span>
        {tipo === "disparo" && <Badge tone="green">1ª mensagem</Badge>}
        {tipo === "followup" && <Badge tone="amber">{etapa.espera_horas ?? 24}h depois</Badge>}
        {tipo === "pos_pagamento" && <Badge tone="violet">após o Pix</Badge>}
        {entrada && <Badge tone="green">entrada</Badge>}
        {final && !mensagem && !entrada && <Badge tone="violet">fim</Badge>}
        {problema && <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-rose" aria-label="Bloco com erro" />}
      </div>

      <div className="px-3 py-2.5">
        <div className="mb-1 truncate text-xs font-600 text-chalk">{etapa.objetivo || etapa.id}</div>
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

type DadosResposta = {
  quando: string;
  exemplos: string[];
  selecionado: boolean;
  aoAbrir: () => void;
};

function NoRespostaEsperada({ data }: NodeProps<Node<DadosResposta>>) {
  return (
    <button type="button" onClick={data.aoAbrir} className={`w-[230px] rounded-xl border bg-ink-900 text-left shadow-lg transition-colors ${data.selecionado ? "border-blue ring-1 ring-blue/40" : "border-blue/35 hover:border-blue"}`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-ink-900 !bg-blue" />
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue/15 text-blue"><CornerDownRight className="h-3.5 w-3.5" /></span>
        <span className="text-[9px] font-600 uppercase tracking-[0.16em] text-blue">Resposta esperada</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="line-clamp-3 text-[11px] font-600 leading-snug text-chalk">{data.quando || "Defina o sentido desta resposta"}</p>
        {data.exemplos.length > 0 && <p className="mt-2 truncate text-[10px] text-mist">Ex.: {data.exemplos.join(" · ")}</p>}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-ink-900 !bg-blue" />
    </button>
  );
}

type DadosMarco = { fim?: boolean; rotulo: string };

function NoMarco({ data }: NodeProps<Node<DadosMarco>>) {
  return (
    <div title={data.fim ? undefined : "Arraste para reposicionar"} className={`flex w-[150px] items-center gap-2 rounded-xl border px-3 py-2.5 shadow-lg ${data.fim ? "border-line bg-ink-900 text-mist" : "cursor-grab border-emerald/35 bg-emerald/5 text-emerald active:cursor-grabbing"}`}>
      {data.fim && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-ink-900 !bg-mist" />}
      <span className={`grid h-6 w-6 place-items-center rounded-lg ${data.fim ? "bg-ink-700" : "bg-emerald/15"}`}>{data.fim ? <Flag className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</span>
      <span className="text-[10px] font-600 uppercase tracking-[0.14em]">{data.rotulo}</span>
      {!data.fim && <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-ink-900 !bg-emerald" />}
    </div>
  );
}

const tiposDeNo = { etapa: NoEtapa, resposta: NoRespostaEsperada, marco: NoMarco };

/* ---------------------------------------------------------------- canvas */

function Canvas({ carteira, padrao, salvar }: {
  carteira: any; padrao: Record<string, any>; salvar: (body: any) => Promise<boolean>;
}) {
  const tema = useTheme();
  const { fitView, setCenter } = useReactFlow();
  const editorRef = React.useRef<HTMLDivElement>(null);
  const modelo = padrao.roteiro_modelo ?? null;
  const salvo = carteira.roteiro ?? null;

  const historico = useHistoricoRoteiro({ ativo: !!salvo?.ativo, etapas: salvo?.etapas ?? [], pos_inicio: salvo?.pos_inicio });
  const { documento, setAtivo, setEtapas, setPosInicio, substituir, desfazer, refazer, marcarSalvo } = historico;
  const { ativo, etapas, pos_inicio: posInicio } = documento;
  const [abertaId, setAbertaId] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [consulta, setConsulta] = React.useState("");
  const [aviso, setAviso] = React.useState("");
  const [transferencia, setTransferencia] = React.useState<Transferencia | null>(null);

  // Por qual canal a 1ª mensagem desta carteira sai. O bloco de disparo só vale para chip Baileys;
  // chip Meta manda o modelo aprovado, que vive fora do fluxo. Sem isto na tela, editar o texto e
  // não ver efeito nenhum é o resultado esperado — e ninguém entende por quê.
  const [canais, setCanais] = React.useState<{ baileys: number; meta: number } | null>(null);
  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/carteiras/${carteira.id}/chips`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.chips) return;
        const ligados = d.chips.filter((c: any) => c.vinculado);
        setCanais({
          baileys: ligados.filter((c: any) => c.conector === "baileys").length,
          meta: ligados.filter((c: any) => c.conector !== "baileys").length,
        });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [carteira.id]);

  const problemas = React.useMemo(() => diagnosticar(etapas), [etapas]);
  const alertas = React.useMemo(() => avisos(etapas), [etapas]);
  const orfas = React.useMemo(() => inalcancaveis(etapas), [etapas]);
  const entrada = etapaDeEntrada(etapas);
  const temDisparo = etapas.some((e) => tipoDe(e) === "disparo");
  const idsComProblema = React.useMemo(
    () => new Set(problemas.map((problema) => problema.etapaId).filter(Boolean)),
    [problemas],
  );

  // ---- grafo derivado das etapas
  const [nos, setNos, aoMudarNos] = useNodesState<Node<any>>([]);
  const [arestas, setArestas, aoMudarArestas] = useEdgesState<Edge>([]);

  React.useEffect(() => {
    const auto = calcularPosicoes(etapas);
    const nosEtapas: Node<DadosNo>[] = etapas.map((e, i) => ({
      id: e.id,
      type: "etapa",
      position: e.pos ?? auto[e.id] ?? { x: i * 620, y: 0 },
      data: {
        etapa: e,
        entrada: e.id === entrada,
        final: (e.casos ?? []).length === 0,
        selecionado: abertaId === e.id,
        problema: idsComProblema.has(e.id),
        aoAbrir: () => setAbertaId(e.id),
      },
    }));

    const posicaoEtapa = (id: string) => etapas.find((item) => item.id === id)?.pos ?? auto[id];
    const nosResposta: Node<DadosResposta>[] = etapas.flatMap((e) =>
      (e.casos ?? []).map((caso, indice) => {
        const id = `caso:${e.id}:${indice}`;
        const origem = posicaoEtapa(e.id) ?? { x: 0, y: 0 };
        const destino = posicaoEtapa(caso.vai_para) ?? { x: origem.x + 620, y: origem.y };
        return {
          id,
          type: "resposta",
          draggable: false,
          deletable: false,
          position: {
            x: origem.x + LARGURA_NO + 42,
            y: origem.y + (destino.y - origem.y) / 2,
          },
          data: {
            quando: caso.quando,
            exemplos: caso.exemplos ?? [],
            selecionado: abertaId === id,
            aoAbrir: () => setAbertaId(id),
          },
        };
      }),
    );

    // Os casos compartilham uma raia entre duas colunas. Distribui-los nessa raia evita que duas
    // respostas esperadas fiquem uma em cima da outra sem empurrar todas para baixo.
    const casosPorRaia = new Map<number, Node<DadosResposta>[]>();
    for (const no of nosResposta) {
      const chave = Math.round(no.position.x);
      casosPorRaia.set(chave, [...(casosPorRaia.get(chave) ?? []), no]);
    }
    for (const grupo of casosPorRaia.values()) {
      grupo.sort((a, b) => a.position.y - b.position.y);
      if (grupo.length < 2) continue;
      const meio = Math.floor((grupo.length - 1) / 2);
      for (let i = meio - 1; i >= 0; i--) {
        grupo[i].position.y = Math.min(grupo[i].position.y, grupo[i + 1].position.y - 142);
      }
      for (let i = meio + 1; i < grupo.length; i++) {
        grupo[i].position.y = Math.max(grupo[i].position.y, grupo[i - 1].position.y + 142);
      }
    }
    const primeiroId = etapas.find((e) => tipoDe(e) === "disparo")?.id ?? entrada;
    const primeiraPosicao = primeiroId ? posicaoEtapa(primeiroId) : null;
    const nosMarco: Node<DadosMarco>[] = primeiraPosicao ? [{
      id: "__inicio",
      type: "marco",
      selectable: false,
      position: posInicio ?? { x: primeiraPosicao.x - 230, y: primeiraPosicao.y + 28 },
      data: { rotulo: "Início" },
    }] : [];
    for (const etapa of etapas.filter((item) => tipoDe(item) === "conversa" && (item.casos ?? []).length === 0)) {
      const posicao = posicaoEtapa(etapa.id);
      if (!posicao) continue;
      nosMarco.push({
        id: `__fim:${etapa.id}`,
        type: "marco",
        draggable: false,
        selectable: false,
        position: { x: posicao.x + 350, y: posicao.y + 28 },
        data: { fim: true, rotulo: "Fim" },
      });
    }
    setNos([...nosEtapas, ...nosResposta, ...nosMarco]);

    const doCaso: Edge[] = etapas.flatMap((e) =>
      (e.casos ?? [])
        .flatMap((c, j) => {
          const respostaId = `caso:${e.id}:${j}`;
          const entradaCaso: Edge = {
            id: `${e.id}->${respostaId}`,
            source: e.id,
            target: respostaId,
            sourceHandle: ehMensagem(e) ? "resp" : undefined,
            animated: true,
            style: { strokeWidth: 1.5, stroke: "#3daee9" },
          };
          if (!c.vai_para) return [entradaCaso];
          return [entradaCaso, {
            id: `${respostaId}->${c.vai_para}`,
            source: respostaId,
            target: c.vai_para,
            animated: true,
            style: { strokeWidth: 1.5, stroke: "#3daee9" },
          }];
        }));

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

    const marcos: Edge[] = [];
    if (primeiroId) marcos.push({ id: `inicio->${primeiroId}`, source: "__inicio", target: primeiroId, selectable: false, deletable: false, style: { strokeWidth: 1.5, stroke: "#2bd98c" } });
    for (const etapa of etapas.filter((item) => tipoDe(item) === "conversa" && (item.casos ?? []).length === 0)) {
      marcos.push({ id: `${etapa.id}->fim`, source: etapa.id, target: `__fim:${etapa.id}`, selectable: false, deletable: false, style: { strokeWidth: 1.5 } });
    }

    setArestas([...doCaso, ...derivadas, ...marcos]);
  }, [etapas, abertaId, entrada, idsComProblema, posInicio, setNos, setArestas]);

  // arrastar o nó guarda a posição na etapa
  const aoTerminarArraste = React.useCallback((_: unknown, no: Node) => {
    if (no.id === "__inicio") {
      setPosInicio({ x: Math.round(no.position.x), y: Math.round(no.position.y) });
      return;
    }
    setEtapas((es) => es.map((e) => (e.id === no.id ? { ...e, pos: { x: Math.round(no.position.x), y: Math.round(no.position.y) } } : e)));
  }, [setEtapas, setPosInicio]);

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
  const referenciaCaso = React.useMemo(() => {
    const partes = abertaId?.match(/^caso:(.+):(\d+)$/);
    if (!partes) return null;
    const etapa = etapas.find((item) => item.id === partes[1]);
    const indice = Number(partes[2]);
    const caso = etapa?.casos?.[indice];
    return etapa && caso ? { etapa, caso, indice } : null;
  }, [abertaId, etapas]);

  function mudarAberta(campo: keyof EtapaRoteiro, valor: any) {
    if (!aberta) return;
    setEtapas(
      (es) => es.map((e) => (e.id === aberta.id ? { ...e, [campo]: valor } : e)),
      `bloco:${aberta.id}:${campo}`,
    );
  }

  function mudarCaso(campo: "quando" | "vai_para" | "exemplos", valor: any) {
    if (!referenciaCaso) return;
    setEtapas((es) => es.map((etapa) => etapa.id !== referenciaCaso.etapa.id ? etapa : {
      ...etapa,
      casos: (etapa.casos ?? []).map((caso, indice) => indice === referenciaCaso.indice ? { ...caso, [campo]: valor } : caso),
    }), `caso:${referenciaCaso.etapa.id}:${referenciaCaso.indice}:${campo}`);
  }

  function removerCaso() {
    if (!referenciaCaso) return;
    setEtapas((es) => es.map((etapa) => etapa.id !== referenciaCaso.etapa.id ? etapa : {
      ...etapa,
      casos: (etapa.casos ?? []).filter((_, indice) => indice !== referenciaCaso.indice),
    }));
    setAbertaId(null);
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
      conversa: { objetivo: "", instrucao: "", casos: [], usa_conhecimento: true },
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

  function duplicarBloco(etapa: EtapaRoteiro) {
    if (tipoDe(etapa) === "disparo") return;
    const id = idUnico(`${etapa.objetivo || etapa.id} copia`, etapas.map((item) => item.id));
    const copia: EtapaRoteiro = {
      ...etapa,
      id,
      objetivo: etapa.objetivo ? `${etapa.objetivo} (cópia)` : "Cópia",
      textos: etapa.textos ? [...etapa.textos] : undefined,
      casos: (etapa.casos ?? []).map((caso) => ({ ...caso })),
      pos: etapa.pos ? { x: etapa.pos.x + 44, y: etapa.pos.y + 44 } : undefined,
    };
    setEtapas((es) => [...es, copia]);
    setAbertaId(id);
  }

  function focarBloco(id: string) {
    const no = nos.find((item) => item.id === id);
    setAbertaId(id);
    setConsulta("");
    if (no) void setCenter(no.position.x + LARGURA_NO / 2, no.position.y + 80, { zoom: 1.05, duration: 420 });
  }

  async function copiarFluxo() {
    const texto = serializarRoteiro(documento);
    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Fluxo copiado. Agora você pode colá-lo em outra carteira.");
    } catch {
      setTransferencia({ modo: "copiar", texto });
    }
  }

  async function abrirColagem() {
    let texto = "";
    try { texto = await navigator.clipboard.readText(); } catch { /* o campo manual continua disponível */ }
    setTransferencia({ modo: "colar", texto });
  }

  function importarTransferencia() {
    if (!transferencia || transferencia.modo !== "colar") return;
    const resultado = importarRoteiro(transferencia.texto);
    if (!resultado.ok) {
      setTransferencia({ ...transferencia, erro: resultado.erro });
      return;
    }
    substituir({
      ativo: resultado.roteiro.ativo !== false,
      etapas: resultado.roteiro.etapas,
      pos_inicio: resultado.roteiro.pos_inicio,
    });
    setAbertaId(null);
    setTransferencia(null);
    mostrarAviso("Fluxo importado. Revise os blocos e salve para criar uma nova versão.");
  }

  function mostrarAviso(texto: string) {
    setAviso(texto);
    window.setTimeout(() => setAviso(""), 3600);
  }

  function telaCheia() {
    if (!editorRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void editorRef.current.requestFullscreen();
  }

  function organizarFluxo() {
    const auto = calcularPosicoes(etapas);
    substituir({
      ...documento,
      pos_inicio: undefined,
      etapas: etapas.map((etapa) => ({ ...etapa, pos: auto[etapa.id] })),
    });
    setAbertaId(null);
    mostrarAviso("Fluxo reorganizado por caminhos e enquadrado na tela.");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      void fitView({ padding: 0.12, duration: 450 });
    }));
  }

  async function gravar() {
    if (salvando || problemas.length > 0 || !historico.alterado) return;
    setSalvando(true); setErro(""); setOk(false);
    const sucesso = await salvar({ roteiro: etapas.length ? { ativo, etapas, pos_inicio: posInicio } : null });
    if (sucesso) { marcarSalvo(); setOk(true); setTimeout(() => setOk(false), 2500); }
    else setErro("Falha ao salvar o fluxo.");
    setSalvando(false);
  }

  const resultadosBusca = React.useMemo(() => {
    const termo = consulta.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return [];
    return etapas.filter((etapa) => [
      etapa.id, etapa.objetivo, etapa.instrucao, ...(etapa.textos ?? []),
    ].join(" ").toLocaleLowerCase("pt-BR").includes(termo)).slice(0, 6);
  }, [consulta, etapas]);

  React.useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const digitando = alvoDeDigitacao(evento.target);
      const modificador = evento.ctrlKey || evento.metaKey;
      const tecla = evento.key.toLocaleLowerCase("pt-BR");
      if (modificador && tecla === "s") {
        evento.preventDefault();
        void gravar();
      } else if (!digitando && modificador && tecla === "z" && evento.shiftKey) {
        evento.preventDefault(); refazer();
      } else if (!digitando && modificador && (tecla === "y" || tecla === "z")) {
        evento.preventDefault(); tecla === "y" ? refazer() : desfazer();
      } else if (!digitando && (evento.key === "Delete" || evento.key === "Backspace") && abertaId) {
        evento.preventDefault();
        if (referenciaCaso) removerCaso(); else removerBloco(abertaId);
      } else if (evento.key === "Escape") {
        if (transferencia) setTransferencia(null);
        else setAbertaId(null);
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
            <Button variant="ghost" onClick={() => void abrirColagem()}><ClipboardPaste className="h-4 w-4" /> Colar fluxo</Button>
          </div>
          {historico.alterado && (
            <Button variant="outline" disabled={salvando} onClick={() => void gravar()}>
              <Save className="h-4 w-4" /> Salvar carteira sem fluxo personalizado
            </Button>
          )}
        </Card>
        {transferencia && (
          <DialogoTransferencia estado={transferencia} aoMudar={(texto) => setTransferencia({ ...transferencia, texto, erro: undefined })}
            aoFechar={() => setTransferencia(null)} aoImportar={importarTransferencia} />
        )}
      </div>
    );
  }

  return (
    <div ref={editorRef} className="flex flex-col gap-4 fullscreen:overflow-auto fullscreen:bg-ink-950 fullscreen:p-4">
      <div className="relative h-[760px] overflow-hidden rounded-2xl border border-line bg-ink-900 fullscreen:min-h-[calc(100vh-2rem)] fullscreen:flex-1">
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
          maxZoom={1.8}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-ink-850" />
        </ReactFlow>

        {/* barras flutuantes inspiradas no editor da Virtus, usando os blocos reais da cobrança */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-ink-850/95 p-1.5 shadow-lg backdrop-blur">
            <Ferramenta titulo="Desfazer (Ctrl+Z)" desabilitada={!historico.podeDesfazer} aoClicar={desfazer}><Undo2 className="h-4 w-4" /></Ferramenta>
            <Ferramenta titulo="Refazer (Ctrl+Y)" desabilitada={!historico.podeRefazer} aoClicar={refazer}><Redo2 className="h-4 w-4" /></Ferramenta>
            <span className="mx-0.5 h-5 w-px bg-line" />
            <Ferramenta titulo="Copiar o fluxo inteiro" aoClicar={() => void copiarFluxo()}><ClipboardCopy className="h-4 w-4" /></Ferramenta>
            <Ferramenta titulo="Colar e substituir o fluxo" aoClicar={() => void abrirColagem()}><ClipboardPaste className="h-4 w-4" /></Ferramenta>
            <Ferramenta titulo="Aplicar o modelo recomendado de cobrança" desabilitada={!modelo} aoClicar={() => {
              if (confirm("Substituir o desenho atual pelo modelo recomendado? Você poderá desfazer com Ctrl+Z.")) {
                substituir({ ativo: true, etapas: modelo?.etapas ?? [] }); setAbertaId(null);
              }
            }}><Sparkles className="h-4 w-4" /></Ferramenta>
            <span className="mx-0.5 hidden h-5 w-px bg-line lg:block" />
            <div className="relative hidden lg:block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" />
              <input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Ir para um bloco…" aria-label="Buscar bloco no fluxo"
                className="h-8 w-48 rounded-lg border border-transparent bg-ink-900 pl-7 pr-2 text-xs text-chalk outline-none placeholder:text-mist focus:border-emerald/50" />
              {consulta.trim() && (
                <div className="absolute left-0 top-10 w-72 rounded-xl border border-line bg-ink-850 p-1.5 shadow-2xl">
                  {resultadosBusca.length ? resultadosBusca.map((etapa) => (
                    <button key={etapa.id} onClick={() => focarBloco(etapa.id)} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-ink-800">
                      <span className="rounded bg-emerald/10 px-1.5 py-0.5 text-[9px] uppercase text-emerald">{ROTULO[tipoDe(etapa)]}</span>
                      <span className="min-w-0"><span className="block truncate font-mono text-[11px] text-chalk">{etapa.id}</span><span className="block truncate text-[10px] text-mist">{etapa.objetivo || etapa.instrucao || etapa.textos?.[0]}</span></span>
                    </button>
                  )) : <p className="px-3 py-4 text-center text-xs text-mist">Nenhum bloco encontrado.</p>}
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-ink-850/95 p-1.5 shadow-lg backdrop-blur">
            <span className="px-2 text-[10px] text-mist">IA guiada</span>
            <Switch checked={ativo} onChange={setAtivo} />
            <span className="mx-0.5 h-5 w-px bg-line" />
            <Ferramenta titulo="Enquadrar todo o fluxo" aoClicar={() => void fitView({ padding: 0.15, duration: 350 })}><Expand className="h-4 w-4" /></Ferramenta>
            <Ferramenta titulo="Tela cheia" aoClicar={telaCheia}><Maximize2 className="h-4 w-4" /></Ferramenta>
            <button type="button" onClick={() => void gravar()} disabled={salvando || problemas.length > 0 || !historico.alterado} className="ml-1 flex h-8 items-center gap-1.5 rounded-lg border border-emerald/30 bg-emerald/10 px-3 text-[11px] font-600 text-emerald disabled:border-line disabled:bg-transparent disabled:text-mist">
              {ok || !historico.alterado ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}{ok || !historico.alterado ? "Salvo" : "Salvar"}
            </button>
          </div>
        </div>

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-line bg-ink-850/95 px-3 py-2 text-[10px] text-mist shadow-lg backdrop-blur">
          <span><b className="text-chalk">{etapas.length}</b> blocos</span><span className="h-3 w-px bg-line" />
          <span className={problemas.length ? "text-rose" : "text-emerald"}><b>{problemas.length}</b> {problemas.length === 1 ? "erro" : "erros"}</span><span className="h-3 w-px bg-line" />
          <span className={historico.alterado ? "text-amber" : "text-emerald"}>{historico.alterado ? "alterações não salvas" : "salvo"}</span>
        </div>

        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-ink-850/95 p-1.5 shadow-lg backdrop-blur">
          {(["disparo", "followup", "conversa", "pos_pagamento"] as TipoEtapa[])
            .filter((t) => t !== "disparo" || !temDisparo)
            .map((t) => {
              const { icone: Icone } = ESTILO[t];
              return <Ferramenta key={t} titulo={`Novo bloco de ${ROTULO[t].toLowerCase()}`} texto={ROTULO[t]} aoClicar={() => novoBloco(t)}><Icone className="h-3.5 w-3.5" /></Ferramenta>;
            })}
          <span className="mx-0.5 h-5 w-px bg-line" />
          <Ferramenta titulo="Reorganizar automaticamente" aoClicar={organizarFluxo} texto="Organizar"><Sparkles className="h-3.5 w-3.5" /></Ferramenta>
        </div>

        {/* painel lateral do bloco selecionado */}
        {aberta && (
          <PainelBloco
            aberta={aberta}
            etapas={etapas}
            canais={canais}
            mudar={mudarAberta}
            renomear={renomearAberta}
            duplicar={() => duplicarBloco(aberta)}
            remover={() => removerBloco(aberta.id)}
            selecionarCaso={(indice) => setAbertaId(`caso:${aberta.id}:${indice}`)}
            fechar={() => setAbertaId(null)}
          />
        )}
        {referenciaCaso && (
          <PainelResposta
            origem={referenciaCaso.etapa}
            caso={referenciaCaso.caso}
            etapas={etapas}
            mudar={mudarCaso}
            remover={removerCaso}
            fechar={() => setAbertaId(null)}
          />
        )}
      </div>

      <p className="text-xs text-mist">
        Clique em qualquer etapa ou resposta esperada para editar. Arraste da bolinha verde até outra etapa
        para criar uma decisão. A linha tracejada entre mensagens representa a sequência de reenvios.
      </p>

      {problemas.map((problema, indice) => (
        <button key={`${problema.etapaId ?? "fluxo"}-${indice}`} onClick={() => problema.etapaId && focarBloco(problema.etapaId)}
          className="flex w-full items-center gap-2 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-left text-sm text-rose">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {problema.mensagem}
          {problema.etapaId && <span className="ml-auto text-[10px] underline">abrir bloco</span>}
        </button>
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

      <button onClick={() => { if (confirm("Apagar o fluxo desta carteira? Ela volta ao texto padrão do sistema e ao robô livre.")) { setEtapas([]); setAtivo(false); setAbertaId(null); } }}
              className="self-start text-xs text-mist hover:text-rose">apagar o fluxo</button>

      {aviso && <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2 rounded-xl border border-emerald/30 bg-ink-850 px-4 py-3 text-xs text-emerald shadow-2xl"><Check className="h-4 w-4" />{aviso}</div>}
      {transferencia && (
        <DialogoTransferencia estado={transferencia} aoMudar={(texto) => setTransferencia({ ...transferencia, texto, erro: undefined })}
          aoFechar={() => setTransferencia(null)} aoImportar={importarTransferencia} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- painel lateral */

function PainelResposta({ origem, caso, etapas, mudar, remover, fechar }: {
  origem: EtapaRoteiro;
  caso: CasoRoteiro;
  etapas: EtapaRoteiro[];
  mudar: (campo: "quando" | "vai_para" | "exemplos", valor: any) => void;
  remover: () => void;
  fechar: () => void;
}) {
  const [novoExemplo, setNovoExemplo] = React.useState("");
  const exemplos = caso.exemplos ?? [];
  const destinos = etapas.filter((etapa) => tipoDe(etapa) === "conversa" && etapa.id !== origem.id);

  function adicionarExemplo() {
    const texto = novoExemplo.trim();
    if (!texto || exemplos.includes(texto)) return;
    mudar("exemplos", [...exemplos, texto]);
    setNovoExemplo("");
  }

  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-[390px] flex-col overflow-y-auto border-l border-line bg-ink-850 shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue/30 bg-blue/12 text-blue"><CornerDownRight className="h-4 w-4" /></span>
          <div>
            <span className="text-[9px] font-600 uppercase tracking-[0.18em] text-mist">Depois de {origem.objetivo || origem.id}</span>
            <h4 className="mt-1 font-display text-base font-600 text-chalk">Resposta esperada</h4>
          </div>
        </div>
        <button onClick={fechar} className="rounded-lg p-1.5 text-mist hover:bg-ink-800 hover:text-chalk" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div>
          <Label>O que a resposta deve indicar?</Label>
          <Textarea rows={5} value={caso.quando} onChange={(e) => mudar("quando", e.target.value)} placeholder="Ex.: confirma que é a pessoa certa ou responde de forma receptiva" />
          <p className="mt-2 text-[11px] leading-relaxed text-mist">A classificação é por sentido, não por palavra exata. Descreva a intenção como você explicaria a um cobrador novo.</p>
        </div>

        <div>
          <Label>Exemplos reais</Label>
          <p className="mb-2 text-[11px] text-mist">Inclua abreviações e o jeito como seus clientes costumam escrever.</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {exemplos.map((exemplo, indice) => (
              <span key={`${exemplo}-${indice}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-900 px-2.5 py-1 text-[11px] text-chalk">
                {exemplo}
                <button type="button" onClick={() => mudar("exemplos", exemplos.filter((_, i) => i !== indice))} className="text-mist hover:text-rose" aria-label={`Remover ${exemplo}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={novoExemplo} onChange={(e) => setNovoExemplo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarExemplo(); } }} placeholder="Ex.: sim, pode mandar…" />
            <Button type="button" variant="outline" onClick={adicionarExemplo} disabled={!novoExemplo.trim()} aria-label="Adicionar exemplo"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        <div>
          <Label>Próxima etapa</Label>
          <select value={caso.vai_para} onChange={(e) => mudar("vai_para", e.target.value)} className="h-10 w-full rounded-xl border border-line bg-ink-900 px-3 font-mono text-xs text-chalk outline-none focus:border-blue">
            <option value="">Selecione o destino…</option>
            {destinos.map((etapa) => <option key={etapa.id} value={etapa.id}>{etapa.objetivo || etapa.id}</option>)}
          </select>
        </div>

        <button type="button" onClick={remover} className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-rose/30 px-3 py-2.5 text-xs text-rose hover:bg-rose/10">
          <Trash2 className="h-3.5 w-3.5" /> Remover resposta esperada
        </button>
      </div>
    </div>
  );
}

function PainelBloco({ aberta, etapas, canais, mudar, renomear, duplicar, remover, selecionarCaso, fechar }: {
  aberta: EtapaRoteiro;
  etapas: EtapaRoteiro[];
  canais: { baileys: number; meta: number } | null;
  mudar: (campo: keyof EtapaRoteiro, valor: any) => void;
  renomear: (rotulo: string) => void;
  duplicar: () => void;
  remover: () => void;
  selecionarCaso: (indice: number) => void;
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

      {/* De onde sai a 1ª mensagem depende do conector do chip — e o bloco de disparo é só metade
          da história quando a carteira tem chip da Meta. */}
      {tipo === "disparo" && canais && (
        canais.baileys === 0 && canais.meta === 0 ? (
          <div className="flex gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Nenhum chip vinculado a esta carteira — este texto não vai para lugar nenhum. Vincule em{" "}
              <b>Visão geral → Chips desta carteira</b>.
            </span>
          </div>
        ) : canais.baileys === 0 ? (
          <div className="flex gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Esta carteira só tem chip da <b>API oficial da Meta</b>, e nele a 1ª mensagem é um{" "}
              <b>modelo aprovado</b>, não este texto. Edite o modelo em{" "}
              <a href="/ajustes?aba=modelos" className="underline">Ajustes → Modelos</a>.
            </span>
          </div>
        ) : canais.meta > 0 ? (
          <div className="flex gap-2 rounded-xl border border-blue/30 bg-blue/10 px-3 py-2.5 text-[11px] leading-relaxed text-blue">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Carteira com os <b>dois canais</b>: este texto sai pelos {canais.baileys} chip(s) de
              WhatsApp comum, e os {canais.meta} da Meta mandam o modelo aprovado. Mantenha os dois
              dizendo a mesma coisa.
            </span>
          </div>
        ) : null
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

          {/* Abertura para quem já respondeu antes. Só no disparo: a partir do follow-up a conversa
              já existe, então não há "primeira mensagem" para escolher. */}
          {tipo === "disparo" && (
            <div className="mt-4 border-t border-line pt-3">
              <Label className="flex items-center gap-1.5 text-xs">
                Para quem já respondeu antes
                <HelpHint text="Abertura usada com quem já respondeu alguma mensagem nossa em algum momento (balde 'recontato de continuidade'). Em branco, essas pessoas recebem a mesma abertura de quem nunca ouviu falar da empresa — que soa como robô para quem já conversou." />
              </Label>
              <div className="mt-1 flex flex-col gap-2">
                {(aberta.textos_recontato ?? []).map((t, j) => (
                  <div key={j} className="rounded-xl border border-line bg-ink-900 p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] text-mist">
                      variação {j + 1}
                      <button onClick={() => mudar("textos_recontato", (aberta.textos_recontato ?? []).filter((_, m) => m !== j))}
                              className="ml-auto text-mist hover:text-rose" aria-label="remover variação">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <textarea
                      value={t} rows={4}
                      onChange={(e) => mudar("textos_recontato", (aberta.textos_recontato ?? []).map((x, m) => (m === j ? e.target.value : x)))}
                      placeholder="{Oi|Olá}, {{primeiro_nome}}! Aqui é a {{nome_bot}} de novo…"
                      className="w-full rounded-lg border border-line bg-ink-850 px-2.5 py-2 text-xs text-chalk outline-none placeholder:text-mist focus:border-emerald"
                    />
                  </div>
                ))}
                <button onClick={() => mudar("textos_recontato", [...(aberta.textos_recontato ?? []), ""])}
                        className="self-start text-[11px] text-emerald underline-offset-2 hover:underline">
                  + variação de recontato
                </button>
              </div>
              {(aberta.textos_recontato ?? []).length === 0 && (
                <p className="mt-1.5 text-[10px] text-mist">
                  Em branco = quem já respondeu recebe a mesma abertura fria acima.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-line bg-ink-900 px-3 py-2.5">
            <span className="pr-3 text-xs text-chalk">Consultar a base aprovada nesta etapa</span>
            <Switch checked={aberta.usa_conhecimento !== false} onChange={(valor) => mudar("usa_conhecimento", valor)} />
          </div>
          <div>
          <Label className="text-xs">O que o robô faz aqui</Label>
          <textarea
            value={aberta.instrucao ?? ""} rows={6}
            onChange={(e) => mudar("instrucao", e.target.value)}
            placeholder="Instrução direta para o robô nesta etapa."
            className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2 text-sm text-chalk outline-none placeholder:text-mist focus:border-emerald"
          />
          </div>
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
          <Label className="text-xs">Respostas esperadas</Label>
          <div className="mt-1 flex flex-col gap-2">
            {(aberta.casos ?? []).map((c, j) => (
              <button type="button" key={j} onClick={() => selecionarCaso(j)} className="flex items-center gap-2 rounded-xl border border-blue/25 bg-blue/5 p-2.5 text-left hover:border-blue/50">
                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-blue" />
                <span className="min-w-0 flex-1"><span className="block truncate text-xs text-chalk">{c.quando || "Resposta ainda não definida"}</span><span className="block truncate font-mono text-[10px] text-mist">→ {c.vai_para || "sem destino"}</span></span>
              </button>
            ))}
            <button
              onClick={() => {
                const indice = (aberta.casos ?? []).length;
                mudar("casos", [...(aberta.casos ?? []), { quando: "", vai_para: "", exemplos: [] }]);
                window.setTimeout(() => selecionarCaso(indice), 0);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue/30 px-3 py-2 text-[11px] text-blue hover:bg-blue/5"
            ><Plus className="h-3.5 w-3.5" /> Adicionar resposta esperada</button>
            {(aberta.casos ?? []).length === 0 && (
              <p className="text-[11px] text-mist">Sem respostas esperadas, esta etapa encerra o atendimento.</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button onClick={duplicar} disabled={tipo === "disparo"}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs text-mist transition-colors hover:bg-ink-800 hover:text-chalk disabled:hidden">
          <Copy className="h-3.5 w-3.5" /> Duplicar
        </button>
        <button onClick={remover}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-rose/30 px-3 py-2 text-xs text-rose transition-colors hover:bg-rose/10">
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </button>
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

type DocumentoRoteiro = { ativo: boolean; etapas: EtapaRoteiro[]; pos_inicio?: { x: number; y: number } };
type Atualizador<T> = T | ((anterior: T) => T);
type Transferencia = { modo: "copiar" | "colar"; texto: string; erro?: string };

/** Histórico local inspirado no editor da Virtus; o banco continua recebendo o mesmo `roteiro`. */
function useHistoricoRoteiro(inicial: DocumentoRoteiro) {
  const [documento, setDocumento] = React.useState(inicial);
  const documentoRef = React.useRef(inicial);
  const passados = React.useRef<DocumentoRoteiro[]>([]);
  const futuros = React.useRef<DocumentoRoteiro[]>([]);
  const ultimoGrupo = React.useRef<{ nome: string; em: number } | null>(null);
  const [salvo, setSalvo] = React.useState(() => assinatura(inicial));

  const aplicar = React.useCallback((atualizador: Atualizador<DocumentoRoteiro>, grupo?: string) => {
    const anterior = documentoRef.current;
    const proximo = typeof atualizador === "function"
      ? (atualizador as (valor: DocumentoRoteiro) => DocumentoRoteiro)(anterior)
      : atualizador;
    if (assinatura(anterior) === assinatura(proximo)) return;

    const agora = Date.now();
    const agrupado = !!grupo && ultimoGrupo.current?.nome === grupo && agora - ultimoGrupo.current.em < 900;
    if (!agrupado) passados.current = [...passados.current.slice(-59), anterior];
    futuros.current = [];
    ultimoGrupo.current = grupo ? { nome: grupo, em: agora } : null;
    documentoRef.current = proximo;
    setDocumento(proximo);
  }, []);

  const setEtapas = React.useCallback((atualizador: Atualizador<EtapaRoteiro[]>, grupo?: string) => {
    aplicar((atual) => ({
      ...atual,
      etapas: typeof atualizador === "function"
        ? (atualizador as (valor: EtapaRoteiro[]) => EtapaRoteiro[])(atual.etapas)
        : atualizador,
    }), grupo);
  }, [aplicar]);

  const setAtivo = React.useCallback((ativo: boolean) => aplicar((atual) => ({ ...atual, ativo })), [aplicar]);
  const setPosInicio = React.useCallback((pos_inicio?: { x: number; y: number }) =>
    aplicar((atual) => ({ ...atual, pos_inicio })), [aplicar]);
  const substituir = React.useCallback((roteiro: DocumentoRoteiro) => aplicar(roteiro), [aplicar]);

  const desfazer = React.useCallback(() => {
    const anterior = passados.current.pop();
    if (!anterior) return;
    futuros.current = [documentoRef.current, ...futuros.current].slice(0, 60);
    documentoRef.current = anterior;
    ultimoGrupo.current = null;
    setDocumento(anterior);
  }, []);

  const refazer = React.useCallback(() => {
    const proximo = futuros.current.shift();
    if (!proximo) return;
    passados.current = [...passados.current.slice(-59), documentoRef.current];
    documentoRef.current = proximo;
    ultimoGrupo.current = null;
    setDocumento(proximo);
  }, []);

  const marcarSalvo = React.useCallback(() => {
    setSalvo(assinatura(documentoRef.current));
    ultimoGrupo.current = null;
  }, []);

  return {
    documento,
    setAtivo,
    setEtapas,
    setPosInicio,
    substituir,
    desfazer,
    refazer,
    marcarSalvo,
    podeDesfazer: passados.current.length > 0,
    podeRefazer: futuros.current.length > 0,
    alterado: assinatura(documento) !== salvo,
  };
}

function assinatura(documento: DocumentoRoteiro): string {
  return JSON.stringify(documento);
}

function alvoDeDigitacao(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement ||
    (alvo instanceof HTMLElement && alvo.isContentEditable);
}

function Ferramenta({ titulo, texto, aoClicar, desabilitada, children }: {
  titulo: string;
  texto?: string;
  aoClicar: () => void;
  desabilitada?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={aoClicar} disabled={desabilitada}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-mist transition-colors hover:bg-ink-800 hover:text-chalk disabled:opacity-35">
      {children}{texto && <span className="hidden 2xl:inline">{texto}</span>}
    </button>
  );
}

function DialogoTransferencia({ estado, aoMudar, aoFechar, aoImportar }: {
  estado: Transferencia;
  aoMudar: (texto: string) => void;
  aoFechar: () => void;
  aoImportar: () => void;
}) {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { areaRef.current?.focus(); areaRef.current?.select(); }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="transferencia-titulo" className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-ink-850 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="transferencia-titulo" className="font-display text-base font-600 text-chalk">
              {estado.modo === "copiar" ? "Copiar fluxo da carteira" : "Colar fluxo em JSON"}
            </h3>
            <p className="mt-1 text-xs text-mist">
              {estado.modo === "copiar"
                ? "Copie este conteúdo. Ele inclui blocos, caminhos, textos, tempos e posições."
                : "Aceita um fluxo exportado por esta tela ou o objeto de roteiro puro. O fluxo atual só muda depois da confirmação."}
            </p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-mist hover:bg-ink-800 hover:text-chalk"><X className="h-4 w-4" /></button>
        </div>
        <textarea ref={areaRef} value={estado.texto} readOnly={estado.modo === "copiar"} onChange={(e) => aoMudar(e.target.value)} rows={16}
          className="mt-4 w-full resize-y rounded-xl border border-line bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-chalk outline-none focus:border-emerald" />
        {estado.erro && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-rose"><AlertTriangle className="h-3.5 w-3.5" />{estado.erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          {estado.modo === "copiar" ? (
            <Button onClick={() => { areaRef.current?.select(); void navigator.clipboard.writeText(estado.texto); }}><ClipboardCopy className="h-4 w-4" /> Copiar texto</Button>
          ) : (
            <Button onClick={aoImportar} disabled={!estado.texto.trim()}><ClipboardPaste className="h-4 w-4" /> Usar este fluxo</Button>
          )}
        </div>
      </div>
    </div>
  );
}
