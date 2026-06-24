"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card, Button, Input, Label, Textarea, Switch, Badge, HelpHint, Tooltip,
} from "@/components/ui/primitives";
import { brl, num, dataHoraBR } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DistribuicaoCard } from "./distribuicao";
import { ImportadorIA, ModoSeletor } from "../importador-ia";
import {
  Play, Pause, Archive, Trash2, Save, CheckCircle2, Loader2, Upload, Users, FileSpreadsheet, AlertTriangle,
  CreditCard, Headset,
} from "lucide-react";

const TABS = [
  { k: "status", t: "Status & envios" },
  { k: "prompt", t: "Prompt do robô" },
  { k: "descontos", t: "Descontos" },
  { k: "asaas", t: "Asaas & cobrador" },
  { k: "historico", t: "Importações" },
] as const;
type Tab = typeof TABS[number]["k"];

export function CarteiraPainel({ carteira, importacoes, padrao, tabInicial, podeEditar = true }: { carteira: any; importacoes: any[]; padrao: Record<string, any>; tabInicial?: Tab; podeEditar?: boolean }) {
  // credor/visualizador só veem o andamento (status + importações), sem editar nem ver chaves
  const tabs = podeEditar ? TABS : TABS.filter((t) => t.k === "status" || t.k === "historico");
  const inicial = tabInicial && tabs.some((t) => t.k === tabInicial) ? tabInicial : (carteira.status === "importando" && podeEditar ? "historico" : "status");
  const [tab, setTab] = React.useState<Tab>(inicial);
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors ${tab === t.k ? "border-emerald text-chalk" : "border-transparent text-mist hover:text-chalk"}`}>
            {t.t}
          </button>
        ))}
      </div>
      {tab === "status" && <AbaStatus carteira={carteira} podeEditar={podeEditar} />}
      {tab === "prompt" && podeEditar && <AbaPrompt carteira={carteira} padrao={padrao} />}
      {tab === "descontos" && podeEditar && <AbaDescontos carteira={carteira} padrao={padrao} />}
      {tab === "asaas" && podeEditar && <AbaAsaas carteira={carteira} padrao={padrao} />}
      {tab === "historico" && <AbaHistorico carteira={carteira} importacoes={importacoes} podeEditar={podeEditar} />}
    </>
  );
}

function useSalvar(carteiraId: number) {
  const router = useRouter();
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  async function patch(body: any) {
    setSalvando(true); setErro(null); setOk(false);
    const r = await fetch(`/api/carteiras/${carteiraId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(d.erro ?? "Falha ao salvar."); return false; }
    setOk(true); setTimeout(() => setOk(false), 2500); router.refresh(); return true;
  }
  return { patch, salvando, ok, erro };
}

/* ---------- Status & envios ---------- */
function AbaStatus({ carteira, podeEditar = true }: { carteira: any; podeEditar?: boolean }) {
  const router = useRouter();
  const { patch, salvando, erro } = useSalvar(carteira.id);
  const status = carteira.status as string;

  async function apagar() {
    if (!confirm(`Apagar a carteira "${carteira.nome}" e TODOS os seus devedores? Esta ação não pode ser desfeita.`)) return;
    const r = await fetch(`/api/carteiras/${carteira.id}`, { method: "DELETE" });
    if (r.ok) router.push("/carteiras");
    else alert("Não foi possível apagar.");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="mb-0">Situação atual</Label>
            <StatusBadge status={status} />
          </div>
          {podeEditar && (
            <div className="flex gap-2">
              <Tooltip text="Começa a enviar mensagens para os devedores desta carteira (respeita a janela de horário e os limites dos chips).">
                <Button variant={status === "ativa" ? "primary" : "outline"} onClick={() => patch({ status: "ativa" })} disabled={salvando || status === "ativa"}>
                  <Play className="h-4 w-4" /> Ativar
                </Button>
              </Tooltip>
              <Tooltip text="Pausa os envios. Os dados continuam aqui; nada é apagado.">
                <Button variant="outline" onClick={() => patch({ status: "pausada" })} disabled={salvando || status === "pausada"}>
                  <Pause className="h-4 w-4" /> Pausar
                </Button>
              </Tooltip>
              <Tooltip text="Guarda como histórico. Some das campanhas e não dispara mais.">
                <Button variant="ghost" onClick={() => patch({ status: "arquivada" })} disabled={salvando || status === "arquivada"}>
                  <Archive className="h-4 w-4" /> Arquivar
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
        {erro && <p className="text-xs text-rose">{erro}</p>}
        {podeEditar && (
          <p className="text-xs text-mist">
            Importante: o robô só envia para carteiras <b className="text-chalk">Ativas</b>, e ainda assim respeitando a chave geral em <Link href="/campanha" className="text-emerald hover:underline">Campanha</Link> (liga/desliga e modo simulação).
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-mist">Devedores</div>
          <div className="font-mono text-2xl text-chalk tabnums">{num(carteira.num_devedores)}</div>
          <Link href={`/devedores?carteira=${carteira.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-emerald hover:underline">
            <Users className="h-3.5 w-3.5" /> Ver devedores desta carteira
          </Link>
        </Card>
        <Card>
          <div className="text-xs text-mist">Total da carteira</div>
          <div className="font-mono text-2xl text-chalk tabnums">{brl(carteira.soma_saldo)}</div>
        </Card>
      </div>

      {podeEditar && <DistribuicaoCard carteira={carteira} />}

      {podeEditar && (
        <Card className="flex items-center justify-between border-rose/20">
          <div>
            <p className="text-sm font-medium text-chalk">Apagar carteira</p>
            <p className="text-xs text-mist">Remove a carteira e todos os devedores/telefones/fila dela. Sem volta.</p>
          </div>
          <Button variant="danger" onClick={apagar}><Trash2 className="h-4 w-4" /> Apagar</Button>
        </Card>
      )}
    </div>
  );
}

/* ---------- Prompt do robô ---------- */
function AbaPrompt({ carteira, padrao }: { carteira: any; padrao: Record<string, any> }) {
  const { patch, salvando, ok, erro } = useSalvar(carteira.id);
  const temCustom = !!(carteira.prompt_persona || carteira.contexto_negocio || carteira.guardrails);
  const [custom, setCustom] = React.useState(temCustom);

  const gPadrao = padrao.bot_guardrails ?? {};
  const g0 = carteira.guardrails ?? gPadrao;
  const [persona, setPersona] = React.useState(carteira.prompt_persona ?? padrao.bot_persona ?? "");
  const [contexto, setContexto] = React.useState(carteira.contexto_negocio ?? padrao.bot_contexto ?? "");
  const [nuncaCitar, setNuncaCitar] = React.useState((g0.nunca_citar ?? []).join(", "));
  const [confirmarId, setConfirmarId] = React.useState(g0.confirmar_identidade !== false);
  const [tom, setTom] = React.useState(g0.tom ?? "");
  const [regrasExtras, setRegrasExtras] = React.useState(g0.regras_extras ?? "");
  const nomeBot = padrao.ia?.nome_bot ?? "Ana";

  async function salvar() {
    if (!custom) { await patch({ prompt_persona: null, contexto_negocio: null, guardrails: null }); return; }
    const guardrails = {
      ...gPadrao,
      nunca_citar: String(nuncaCitar).split(",").map((s: string) => s.trim()).filter(Boolean),
      confirmar_identidade: confirmarId,
      tom,
      regras_extras: regrasExtras,
    };
    await patch({ prompt_persona: persona, contexto_negocio: contexto, guardrails });
  }

  const preview = montarPreview({ nomeBot, persona, contexto, nuncaCitar, confirmarId, tom, regrasExtras, gPadrao });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="mb-0 flex items-center gap-1.5">
            Usar o padrão global <HelpHint text="Ligado: esta carteira usa o prompt configurado em Configurações. Desligado: você personaliza o robô só para esta carteira." />
          </Label>
          <Switch checked={!custom} onChange={(v) => setCustom(!v)} />
        </div>

        {custom && (
          <>
            <div>
              <Label className="flex items-center gap-1.5">Persona / objetivo <HelpHint text="Quem é o robô e o que ele quer. Use {{nome_bot}} e {{primeiro_nome}}." /></Label>
              <Textarea rows={3} value={persona} onChange={(e) => setPersona(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Contexto do negócio <HelpHint text="Em nome de quem o robô fala e como enquadra a dívida." /></Label>
              <Textarea rows={2} value={contexto} onChange={(e) => setContexto(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Nunca citar <HelpHint text="Termos proibidos, separados por vírgula. Ex.: Serasa, SPC, processo judicial. Deixe vazio se esta carteira pode mencioná-los." /></Label>
              <Input value={nuncaCitar} onChange={(e) => setNuncaCitar(e.target.value)} placeholder="Serasa, SPC, negativação…" />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-sm text-chalk">Confirmar identidade antes de revelar dados <HelpHint text="O robô confirma que fala com a pessoa certa antes de citar CPF/valor. Recomendado por LGPD." /></span>
              <Switch checked={confirmarId} onChange={setConfirmarId} />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Tom <HelpHint text="Como o robô escreve: formal, leve, com emoji, etc." /></Label>
              <Input value={tom} onChange={(e) => setTom(e.target.value)} placeholder="humano, caloroso, frases curtas…" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Regras extras (opcional) <HelpHint text="Qualquer instrução adicional específica desta carteira." /></Label>
              <Textarea rows={2} value={regrasExtras} onChange={(e) => setRegrasExtras(e.target.value)} />
            </div>
          </>
        )}

        <div className="flex items-center gap-3">
          <Tooltip text="Salva o prompt desta carteira. Vale para todas as próximas conversas dela.">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {ok ? "Salvo!" : "Salvar prompt"}
            </Button>
          </Tooltip>
          {erro && <span className="text-xs text-rose">{erro}</span>}
        </div>
      </Card>

      <Card>
        <Label className="flex items-center gap-1.5">Prévia do que o robô recebe <HelpHint text="Montagem aproximada das instruções enviadas ao modelo de IA." /></Label>
        <pre className="max-h-[460px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-ink-950 p-3 text-[11px] leading-relaxed text-mist">{preview}</pre>
      </Card>
    </div>
  );
}

function montarPreview(o: any): string {
  const interp = (t: string) => String(t ?? "").replaceAll("{{nome_bot}}", o.nomeBot).replaceAll("{{primeiro_nome}}", "Maria");
  const regras: string[] = [];
  const nc = String(o.nuncaCitar).split(",").map((s: string) => s.trim()).filter(Boolean);
  if (nc.length) regras.push(`NUNCA mencione ${nc.join(", ")}, nem QUALQUER consequência por não pagar.`);
  regras.push("NUNCA invente valores. Use SOMENTE os números retornados pela tool consultar_divida.");
  if (o.gPadrao.responder_prescricao_honestamente !== false) regras.push("Se perguntarem sobre prescrição: responda com honestidade que pode estar prescrita e o pagamento é voluntário.");
  if (o.confirmarId) regras.push("CONFIRME A IDENTIDADE antes de revelar qualquer dado (CPF/valor).");
  regras.push("Se pedir para não ser mais contatada: chame a tool nao_perturbe.");
  regras.push("Se contestar/citar advogado/Procon/justiça ou for hostil: chame a tool escalar_humano.");
  regras.push(`Desconto extra: no máximo ${Number(o.gPadrao.max_rodadas_desconto ?? 1)} vez(es), só após recusa explícita.`);
  if (o.regrasExtras) regras.push(o.regrasExtras);
  return [
    interp(o.persona), interp(o.contexto), "",
    "REGRAS INEGOCIÁVEIS:",
    ...regras.map((r, i) => `${i + 1}. ${interp(r)}`), "",
    `ESTILO: ${o.tom || "humano, frases curtas, 1 emoji por mensagem"}.`,
  ].join("\n");
}

/* ---------- Descontos ---------- */
function AbaDescontos({ carteira, padrao }: { carteira: any; padrao: Record<string, any> }) {
  const { patch, salvando, ok, erro } = useSalvar(carteira.id);
  const over = carteira.config_override ?? {};
  const temCustom = !!over.faixas_desconto;
  const [custom, setCustom] = React.useState(temCustom);
  const base = over.faixas_desconto ?? padrao.faixas_desconto ?? { faixas: [], valor_minimo_pix: 30, margem_extra_pp: 10 };
  const [faixas, setFaixas] = React.useState<{ idade_min: number; pct: number }[]>(base.faixas ?? []);
  const [minPix, setMinPix] = React.useState(base.valor_minimo_pix ?? 30);
  const [margem, setMargem] = React.useState(base.margem_extra_pp ?? 10);
  const [validade, setValidade] = React.useState(over.validade_proposta_dias ?? padrao.validade_proposta_dias ?? 7);

  function setFaixa(i: number, campo: "idade_min" | "pct", v: number) {
    setFaixas((f) => f.map((x, j) => j === i ? { ...x, [campo]: v } : x));
  }

  async function salvar() {
    if (!custom) { await patch({ config_override: null }); return; }
    const config_override = {
      ...over,
      faixas_desconto: { faixas, valor_minimo_pix: Number(minPix), margem_extra_pp: Number(margem) },
      validade_proposta_dias: Number(validade),
    };
    await patch({ config_override });
  }

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Label className="mb-0 flex items-center gap-1.5">
          Usar os descontos globais <HelpHint text="Ligado: usa as faixas de desconto de Descontos. Desligado: define descontos só para esta carteira (útil para dívidas de naturezas diferentes)." />
        </Label>
        <Switch checked={!custom} onChange={(v) => setCustom(!v)} />
      </div>

      {custom && (
        <>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">Faixas por idade da dívida <HelpHint text="A partir de X anos de atraso, oferece Y% de desconto. A maior faixa que o devedor atinge vale." /></Label>
            {faixas.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-mist">A partir de</span>
                <Input type="number" className="w-20" value={f.idade_min} onChange={(e) => setFaixa(i, "idade_min", Number(e.target.value))} />
                <span className="text-mist">anos →</span>
                <Input type="number" className="w-20" value={f.pct} onChange={(e) => setFaixa(i, "pct", Number(e.target.value))} />
                <span className="text-mist">% de desconto</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="flex items-center gap-1.5">Pix mínimo <HelpHint text="Valor mínimo que um Pix pode ter, mesmo com desconto." /></Label>
              <Input type="number" value={minPix} onChange={(e) => setMinPix(Number(e.target.value))} />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Margem extra (pp) <HelpHint text="Pontos percentuais extras que o robô pode dar 1× se o devedor recusar." /></Label>
              <Input type="number" value={margem} onChange={(e) => setMargem(Number(e.target.value))} />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Validade (dias) <HelpHint text="Por quantos dias a proposta/Pix fica válida." /></Label>
              <Input type="number" value={validade} onChange={(e) => setValidade(Number(e.target.value))} />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {ok ? "Salvo!" : "Salvar descontos"}
        </Button>
        {erro && <span className="text-xs text-rose">{erro}</span>}
      </div>
    </Card>
  );
}

/* ---------- Asaas & cobrador ---------- */
function AbaAsaas({ carteira, padrao }: { carteira: any; padrao: Record<string, any> }) {
  const { patch, salvando, ok, erro } = useSalvar(carteira.id);
  const over = carteira.config_override ?? {};
  const a0 = over.asaas ?? {};
  const e0 = over.equipe ?? {};
  const asaasGlobal = padrao.asaas ?? {};

  const [usarGlobal, setUsarGlobal] = React.useState(!over.asaas);
  const [wallet, setWallet] = React.useState(a0.wallet ?? a0.wallet_savan ?? "");
  const [comissao, setComissao] = React.useState<number | string>(a0.comissao_pct ?? "");

  // escaladores: lista (ordem = prioridade) de chips marcados como "equipe" + estratégia.
  // Compat: o formato antigo era um objeto único em config_override.equipe.
  const escSalvo = over.escaladores ?? null;
  const [estrategia, setEstrategia] = React.useState<string>(escSalvo?.estrategia ?? "fixo");
  const [selecionados, setSelecionados] = React.useState<number[]>(
    Array.isArray(escSalvo?.lista) ? escSalvo.lista.map((e: any) => e.chip_id).filter(Boolean)
      : (e0.chip_id ? [e0.chip_id] : [])
  );
  const [chipsEquipe, setChipsEquipe] = React.useState<any[]>([]);

  React.useEffect(() => {
    supabaseBrowser().from("chips")
      .select("id, nome, agente_nome, numero_e164, status, regiao_uf, regiao_cidade")
      .eq("papel", "equipe").order("id")
      .then(({ data }) => setChipsEquipe(data ?? []));
  }, []);

  // selecionados primeiro (em ordem de prioridade), depois o resto — pra o ↑ mover a linha de fato
  const ordenados = React.useMemo(() => {
    const sel = selecionados.map((id) => chipsEquipe.find((c) => c.id === id)).filter(Boolean) as any[];
    return [...sel, ...chipsEquipe.filter((c) => !selecionados.includes(c.id))];
  }, [chipsEquipe, selecionados]);

  function toggle(id: number) {
    setSelecionados((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  function subir(id: number) {
    setSelecionados((s) => {
      const i = s.indexOf(id);
      if (i <= 0) return s;
      const n = [...s]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n;
    });
  }

  async function salvar() {
    const novoOver: Record<string, any> = { ...over };
    if (usarGlobal) { delete novoOver.asaas; }
    else { novoOver.asaas = { wallet: String(wallet).trim(), comissao_pct: Number(comissao || 10) }; }
    delete novoOver.equipe; // formato antigo (objeto único) deixa de ser usado
    if (selecionados.length) {
      const lista = selecionados.map((id) => {
        const c = chipsEquipe.find((x) => x.id === id);
        return { chip_id: id, nome: c?.agente_nome || c?.nome || null, numero: c?.numero_e164 || null };
      });
      novoOver.escaladores = { estrategia, lista };
    } else { delete novoOver.escaladores; }
    await patch({ config_override: Object.keys(novoOver).length ? novoOver : null });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <CreditCard className="h-4 w-4 text-emerald" /> Split do Pix desta carteira
        </h3>
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-sm text-chalk">
            Usar o Asaas global <HelpHint text="Ligado: usa o Wallet ID e a comissão de Configurações. Desligado: este credor recebe em um Wallet ID próprio (cada carteira é de um credor diferente)." />
          </span>
          <Switch checked={usarGlobal} onChange={setUsarGlobal} />
        </div>
        {!usarGlobal && (
          <>
            <div>
              <Label className="flex items-center gap-1.5">Wallet ID do credor (recebe 90%) <HelpHint text="O walletId da conta Asaas do credor desta carteira. É para lá que vão os 90%." /></Label>
              <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="walletId do Asaas do credor" className="font-mono text-xs" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">Sua comissão (%) <HelpHint text="Quanto fica para o operador. O resto (100 − comissão) vai para o credor." /></Label>
              <Input type="number" value={comissao} onChange={(e) => setComissao(e.target.value)} placeholder="10" />
            </div>
            {!String(wallet).trim() && (
              <p className="flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Sem o Wallet ID, em produção o Pix é recusado (o split 90/10 não acontece).
              </p>
            )}
          </>
        )}
        {usarGlobal && (
          <p className="text-xs text-mist">
            Usando o global: credor recebe no Wallet <b className="text-chalk">{asaasGlobal.wallet_savan || asaasGlobal.wallet || "—"}</b>, comissão <b className="text-chalk">{asaasGlobal.comissao_pct ?? 10}%</b>.
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <Headset className="h-4 w-4 text-violet" /> Escaladores (cobradores humanos)
        </h3>
        <p className="text-xs text-mist">
          Quando o bot escala um caso desta carteira, ele escolhe um escalador, avisa o devedor e passa o WhatsApp dele. Só aparecem os chips conectados marcados como <b className="text-chalk">Equipe</b> em Chips — assim a conversa dele cai no Chatwoot pra você acompanhar.
        </p>

        <div>
          <Label className="flex items-center gap-1.5">Como escolher quando há vários <HelpHint text="Fixo + reserva: o 1º da lista atende sempre; os outros só entram se o chip dele estiver indisponível. Rodízio: equilibra a carga (quem tem menos caso aberto pega o próximo). Por região: casa a UF/cidade do devedor com a região do chip do escalador (Status & envios → Distribuição), caindo no rodízio quem não casar." /></Label>
          <select value={estrategia} onChange={(e) => setEstrategia(e.target.value)}
                  className="h-10 w-full rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
            <option value="fixo">Fixo + reserva (o 1º atende; os outros são backup)</option>
            <option value="rodizio">Rodízio (equilibra a carga)</option>
            <option value="regiao">Por região (UF/cidade do devedor)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="mb-0">Escaladores desta carteira</Label>
          {chipsEquipe.length === 0 ? (
            <p className="text-[11px] text-mist">Nenhum chip marcado como "Equipe" ainda — cadastre o chip do cobrador em Chips e marque o papel como Equipe.</p>
          ) : ordenados.map((c) => {
            const sel = selecionados.includes(c.id);
            const pos = selecionados.indexOf(c.id);
            return (
              <div key={c.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${sel ? "border-violet/40 bg-violet/5" : "border-line bg-ink-850"}`}>
                <input type="checkbox" checked={sel} onChange={() => toggle(c.id)} className="h-4 w-4 accent-violet" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-chalk">
                    {c.agente_nome || c.nome}
                    {sel && estrategia === "fixo" && <Badge tone={pos === 0 ? "violet" : "neutral"}>{pos === 0 ? "Principal" : `Reserva ${pos}`}</Badge>}
                  </div>
                  <div className="font-mono text-[11px] tabnums">
                    {c.numero_e164 ? <span className="text-mist">{c.numero_e164}</span> : <span className="text-amber">sem número — conecte o chip</span>}
                  </div>
                </div>
                {sel && estrategia === "fixo" && pos > 0 && (
                  <button type="button" onClick={() => subir(c.id)} title="Subir prioridade"
                          className="rounded-lg px-2 py-1 text-mist hover:bg-ink-800 hover:text-chalk">↑</button>
                )}
              </div>
            );
          })}
          {selecionados.some((id) => { const c = chipsEquipe.find((x) => x.id === id); return c && !c.numero_e164; }) && (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Escalador sem número conectado é ignorado na escalação. Conecte o chip em Chips (QR) pra puxar o WhatsApp.
            </p>
          )}
        </div>
      </Card>

      <div className="lg:col-span-2 flex items-center gap-3">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {ok ? "Salvo!" : "Salvar"}
        </Button>
        {erro && <span className="text-xs text-rose">{erro}</span>}
      </div>
    </div>
  );
}

/* ---------- Importações ---------- */
function AbaHistorico({ carteira, importacoes, podeEditar = true }: { carteira: any; importacoes: any[]; podeEditar?: boolean }) {
  const router = useRouter();
  const [modo, setModo] = React.useState<"modelo" | "ia">("modelo");
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);

  async function enviar() {
    if (!arquivo) return;
    setCarregando(true); setErro(null); setOkMsg(null);
    const fd = new FormData(); fd.append("arquivo", arquivo);
    const r = await fetch(`/api/carteiras/${carteira.id}/importar`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setCarregando(false);
    if (!r.ok) { setErro(d.erro ?? "Falha ao importar."); return; }
    setOkMsg(`Importadas ${d.relatorio?.importados ?? 0} linhas.`); setArquivo(null); router.refresh();
  }

  function importadoPelaIA(rel: any) {
    setOkMsg(`Importadas ${rel?.importados ?? 0} linhas.`); router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      {podeEditar && carteira.status === "importando" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Esta carteira ainda não tem planilha. Envie o arquivo abaixo para concluir a criação — ou apague a carteira na aba <b>Status &amp; envios</b>.</span>
        </div>
      )}
      {podeEditar && (
        <Card className="space-y-3">
          <Label className="flex items-center gap-1.5">Subir planilha para esta carteira <HelpHint text="Acrescenta/atualiza devedores. Mesmo CPF é atualizado (não duplica). Não aceita um arquivo com nome já usado." /></Label>
          <ModoSeletor modo={modo} setModo={setModo} />
          {modo === "modelo" ? (
            <>
              <div className="flex items-center gap-2">
                <a href="/api/carteiras/modelo"><Button variant="outline">Baixar modelo</Button></a>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-ink-900 px-3 py-2 hover:border-emerald/50">
                  <FileSpreadsheet className="h-4 w-4 text-emerald" />
                  <span className="flex-1 truncate text-sm text-chalk">{arquivo ? arquivo.name : "Escolher .xlsx"}</span>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                </label>
                <Button onClick={enviar} disabled={carregando || !arquivo}>
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar
                </Button>
              </div>
              {erro && <p className="flex items-center gap-1.5 text-xs text-rose"><AlertTriangle className="h-3.5 w-3.5" /> {erro}</p>}
            </>
          ) : (
            <ImportadorIA carteiraId={carteira.id} onImportado={importadoPelaIA} />
          )}
          {okMsg && <p className="flex items-center gap-1.5 text-xs text-emerald"><CheckCircle2 className="h-3.5 w-3.5" /> {okMsg}</p>}
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
              <th className="px-5 py-3 font-medium">Arquivo</th>
              <th className="px-5 py-3 font-medium">Importadas</th>
              <th className="px-5 py-3 font-medium">Ignoradas</th>
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {importacoes.map((imp) => (
              <tr key={imp.id} className="border-b border-line/50">
                <td className="px-5 py-3 text-chalk">{imp.arquivo_nome}</td>
                <td className="px-5 py-3 font-mono text-chalk tabnums">{num(imp.linhas_importadas)}</td>
                <td className="px-5 py-3 font-mono text-mist tabnums">{num(imp.linhas_ignoradas)}</td>
                <td className="px-5 py-3 text-mist">{dataHoraBR(imp.criado_em)}</td>
                <td className="px-5 py-3"><Badge tone={imp.status === "concluida" ? "green" : imp.status === "falhou" ? "rose" : "amber"}>{imp.status}</Badge></td>
              </tr>
            ))}
            {importacoes.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-mist">Nenhuma importação ainda.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: any; label: string }> = {
    importando: { tone: "amber", label: "Importando" },
    ativa: { tone: "green", label: "Ativa (enviando)" },
    pausada: { tone: "neutral", label: "Pausada" },
    arquivada: { tone: "rose", label: "Arquivada" },
  };
  const s = map[status] ?? map.pausada;
  return <div className="mt-1"><Badge tone={s.tone}>{s.label}</Badge></div>;
}
