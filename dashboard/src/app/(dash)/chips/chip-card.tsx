"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Input, Label } from "@/components/ui/primitives";
import { MaturidadeField, type MaturidadeValor } from "@/components/MaturidadeField";
import { num } from "@/lib/utils";
import { ehConectorBaileys } from "@/lib/conector";
import { ConectarChip } from "./conectar-chip";
import { Play, Pause, Smartphone, MoreVertical, Pencil, Trash2, X, Eye, EyeOff, Loader2, Cloud, Activity, RotateCw, Gauge, PauseCircle, Webhook, QrCode } from "lucide-react";

// Semáforo da qualidade do número na Meta (saber se está perto de banir).
const QUALIDADE: Record<string, { tone: any; label: string }> = {
  GREEN: { tone: "green", label: "Qualidade alta" },
  YELLOW: { tone: "amber", label: "Qualidade média" },
  RED: { tone: "rose", label: "Qualidade baixa — risco de restrição" },
  UNKNOWN: { tone: "neutral", label: "Qualidade —" },
};
const TETO_TIER: Record<string, number | null> = {
  TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: null,
};

// Campo de token oculto (tipo senha) com botão de ver/ocultar.
function CampoToken({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Input type={ver ? "text" : "password"} value={value} disabled={disabled}
               onChange={(e) => onChange(e.target.value)} className="pr-10 font-mono text-xs" />
        <button type="button" onClick={() => setVer((v) => !v)} tabIndex={-1}
                aria-label={ver ? "Ocultar" : "Mostrar"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-mist hover:text-chalk">
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

const STATUS: Record<string, { tone: any; label: string }> = {
  cadastrado: { tone: "neutral", label: "Cadastrado" },
  conectado: { tone: "blue", label: "Conectado" },
  aquecendo: { tone: "amber", label: "Aquecendo" },
  ativo: { tone: "green", label: "Ativo" },
  pausado: { tone: "neutral", label: "Pausado" },
  desconectado: { tone: "rose", label: "Desconectado" },
  banido: { tone: "rose", label: "Banido" },
};

function diaAquecimento(dataAtivacao: string | null): number | null {
  if (!dataAtivacao) return null;
  return Math.floor((Date.now() - new Date(dataAtivacao).getTime()) / 86400000) + 1;
}

export function ChipCard({ chip, metrica, donoNome, ritmoHora }: {
  chip: any; metrica?: any; donoNome?: string | null;
  ritmoHora?: { limite: number | null; usados: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState("");

  // A coluna tem default 'baileys' no banco, então isto sempre vem preenchido; o fallback é rede
  // de segurança e escolhe Meta de propósito — é o que os chips anteriores à fatia realmente são.
  const conector: string = chip.conector ?? "meta_cloud";
  // `ehBaileys` fica estrito à Evolution de propósito: é o único provedor que o painel sabe
  // provisionar/reconectar por QR hoje. `usaTransporteBaileys` cobre os dois transportes
  // não-oficiais (Evolution e baileys-api/Chatwoot) para tudo que é comum aos dois — ritmo,
  // rótulo de canal, esconder o bloco de saúde da Meta.
  const ehBaileys = conector === "baileys";
  const usaTransporteBaileys = ehConectorBaileys(conector);

  const [eNome, setENome] = useState(chip.nome);
  const [eMaturidade, setEMaturidade] = useState<MaturidadeValor>({ maturidade: "novo", limite_dia_override: null, limite_hora_override: null });
  const [origMat, setOrigMat] = useState<MaturidadeValor>({ maturidade: "novo", limite_dia_override: null, limite_hora_override: null });
  const [ePapel, setEPapel] = useState<string>("bot");
  const [eAgente, setEAgente] = useState<string>("");
  const [eNumero, setENumero] = useState<string>("");
  const [origPapel, setOrigPapel] = useState({ papel: "bot", agente: "", numero: "" });
  const [carregando, setCarregando] = useState(false);

  // credenciais da Meta (o único conector) e saúde do número
  const [eMetaPhone, setEMetaPhone] = useState("");
  const [eMetaWaba, setEMetaWaba] = useState("");
  const [eMetaToken, setEMetaToken] = useState("");
  const [eMetaAppId, setEMetaAppId] = useState("");
  const [eMetaAppSecret, setEMetaAppSecret] = useState("");
  const [origMeta, setOrigMeta] = useState({ phone: "", waba: "", token: "", appId: "", appSecret: "" });
  const [saude, setSaude] = useState<any>(chip.saude ?? null);
  const [atualizandoSaude, setAtualizandoSaude] = useState(false);

  // webhook do app da Meta (o passo que o SAVAN fecha sozinho com App ID + App Secret)
  const [webhookEm, setWebhookEm] = useState<string | null>(null);
  const [webhookMsg, setWebhookMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [webhookConflito, setWebhookConflito] = useState(false);
  const [configurandoWebhook, setConfigurandoWebhook] = useState(false);

  // Aponta o webhook do app da Meta para o inbox deste chip. `forcar` substitui uma assinatura
  // que hoje aponta para outra URL — só depois do aviso de conflito.
  async function configurarWebhook(forcar = false) {
    setConfigurandoWebhook(true); setWebhookMsg(null); setWebhookConflito(false);
    try {
      const r = await fetch(`/api/chips/${chip.id}/webhook`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ forcar }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setWebhookEm(new Date().toISOString());
        setWebhookMsg({ tom: "ok", texto: d.mensagem ?? "Webhook configurado." });
      } else {
        if (r.status === 409) setWebhookConflito(true);
        setWebhookMsg({ tom: "erro", texto: d.erro ?? "Falha ao configurar o webhook." });
      }
    } catch { setWebhookMsg({ tom: "erro", texto: "Falha ao configurar o webhook." }); }
    setConfigurandoWebhook(false);
  }

  async function atualizarSaude() {
    setAtualizandoSaude(true);
    try {
      const r = await fetch(`/api/chips/${chip.id}/qualidade`, { method: "POST" });
      const d = await r.json();
      if (r.ok && d.saude) setSaude(d.saude);
      else setErro(d.erro ?? "Falha ao atualizar a saúde.");
    } catch { setErro("Falha ao atualizar a saúde."); }
    setAtualizandoSaude(false);
  }

  const st = STATUS[chip.status] ?? STATUS.cadastrado;
  const dia = diaAquecimento(chip.data_ativacao);
  const enviados = metrica?.novos_contatos ?? 0;
  // escalador humano "só registrado": papel=equipe, número à mão, sem inbox no Chatwoot.
  // Não dispara e não aparece no Chatwoot — esconde os controles que não se aplicam.
  const escalador = (chip.papel ?? "bot") === "equipe" && !!chip.numero_e164 && !chip.chatwoot_inbox_id;
  const escaladorEdit = ePapel === "equipe" && !chip.chatwoot_inbox_id;

  function acao(a: string) {
    start(async () => {
      await fetch(`/api/chips/${chip.id}/acao`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: a }),
      });
      router.refresh();
    });
  }

  function abrirEdicao() {
    setMenu(false); setErro(""); setEditando(true); setCarregando(true);
    fetch(`/api/chips/${chip.id}`)
      .then((r) => r.json())
      .then((d) => {
        setENome(d.nome ?? chip.nome);
        const mat: MaturidadeValor = { maturidade: d.maturidade ?? "novo", limite_dia_override: d.limite_dia_override ?? null, limite_hora_override: d.limite_hora_override ?? null };
        setEMaturidade(mat); setOrigMat(mat);
        setEPapel(d.papel ?? "bot"); setEAgente(d.agente_nome ?? ""); setENumero(d.numero_e164 ?? "");
        setOrigPapel({ papel: d.papel ?? "bot", agente: d.agente_nome ?? "", numero: d.numero_e164 ?? "" });
        setEMetaPhone(d.meta_phone_number_id ?? ""); setEMetaWaba(d.meta_waba_id ?? ""); setEMetaToken(d.meta_token ?? "");
        setEMetaAppId(d.meta_app_id ?? ""); setEMetaAppSecret(d.meta_app_secret ?? "");
        setOrigMeta({
          phone: d.meta_phone_number_id ?? "", waba: d.meta_waba_id ?? "", token: d.meta_token ?? "",
          appId: d.meta_app_id ?? "", appSecret: d.meta_app_secret ?? "",
        });
        setWebhookEm(d.webhook_configurado_em ?? null); setWebhookMsg(null); setWebhookConflito(false);
      })
      .catch(() => setErro("Falha ao carregar os dados do chip."))
      .finally(() => setCarregando(false));
  }

  function salvar() {
    setErro("");
    const body: Record<string, unknown> = {};
    if (eNome.trim() && eNome.trim() !== chip.nome) body.nome = eNome.trim();
    if (eMaturidade.maturidade !== origMat.maturidade) body.maturidade = eMaturidade.maturidade;
    if (eMaturidade.limite_hora_override !== origMat.limite_hora_override) {
      body.limite_hora_override = eMaturidade.limite_hora_override;
    }
    if (eMaturidade.limite_dia_override !== origMat.limite_dia_override) {
      body.limite_dia_override = eMaturidade.limite_dia_override;
    }
    if (ePapel !== origPapel.papel) body.papel = ePapel;
    if (eAgente.trim() !== origPapel.agente) body.agente_nome = eAgente.trim();
    if (eNumero.trim() !== origPapel.numero) body.numero_e164 = eNumero.trim();
    if (eMetaPhone.trim() !== origMeta.phone) body.meta_phone_number_id = eMetaPhone.trim();
    if (eMetaWaba.trim() !== origMeta.waba) body.meta_waba_id = eMetaWaba.trim();
    if (eMetaToken.trim() !== origMeta.token) body.meta_token = eMetaToken.trim();
    if (eMetaAppId.trim() !== origMeta.appId) body.meta_app_id = eMetaAppId.trim();
    if (eMetaAppSecret.trim() !== origMeta.appSecret) body.meta_app_secret = eMetaAppSecret.trim();
    if (Object.keys(body).length === 0) { setEditando(false); return; }
    start(async () => {
      const r = await fetch(`/api/chips/${chip.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d.erro ?? "Falha ao salvar."); return; }
      setEditando(false);
      router.refresh();
    });
  }

  function excluir() {
    setErro("");
    start(async () => {
      const r = await fetch(`/api/chips/${chip.id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d.erro ?? "Falha ao excluir."); setConfirmando(false); return; }
      router.refresh();
    });
  }

  // No Baileys, "ativar" um chip que nunca escaneou o QR o coloca na seleção do `campanha-lote` sem
  // sessão nenhuma — todo envio falharia e o chip apanharia por um problema que é de cadastro.
  // Só o número já conectado pode ser ativado. Na Meta o cadastro já é a conexão, então nada muda.
  const podeAtivar = usaTransporteBaileys
    ? chip.status === "conectado"
    : ["cadastrado", "conectado", "desconectado"].includes(chip.status);
  const podePausar = ["ativo", "aquecendo"].includes(chip.status);
  // 'banido' fica de fora: no Baileys um 401 é definitivo e reconectar não resolve (§8 do guia).
  const podeConectar = ehBaileys && !escalador && ["cadastrado", "desconectado"].includes(chip.status);

  if (conectando) {
    return (
      <ConectarChip
        chipId={chip.id}
        nome={chip.nome}
        onConectado={() => router.refresh()}
        onFechar={() => { setConectando(false); router.refresh(); }}
      />
    );
  }

  if (editando) {
    return (
      <Card className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-600 text-chalk">Editar chip</h3>
          <button onClick={() => { setEditando(false); setErro(""); }} className="text-mist hover:text-chalk">
            <X className="h-4 w-4" />
          </button>
        </div>
        {carregando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-mist">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados…
          </div>
        ) : (
          <>
            <div>
              <Label>Nome</Label>
              <Input value={eNome} onChange={(e) => setENome(e.target.value)} />
            </div>
            <div>
              <Label>Papel do chip</Label>
              <select value={ePapel} onChange={(e) => setEPapel(e.target.value)}
                      className="h-10 w-full rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                <option value="bot">Bot (dispara e negocia automaticamente)</option>
                <option value="equipe">Equipe (cobrador humano — só recebe escalações)</option>
              </select>
            </div>
            {ePapel === "equipe" && (
              <div>
                <Label>Nome do cobrador (dono deste chip)</Label>
                <Input value={eAgente} onChange={(e) => setEAgente(e.target.value)} placeholder="Ex.: Carlos" />
              </div>
            )}
            {escaladorEdit ? (
              <div>
                <Label>Número de WhatsApp do cobrador</Label>
                <Input value={eNumero} onChange={(e) => setENumero(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
                <p className="mt-1.5 text-xs text-mist">
                  Com DDD. É o número que recebe as transferências. Este escalador não conecta na Meta nem aparece no Chatwoot.
                </p>
              </div>
            ) : usaTransporteBaileys ? (
              <>
                <div>
                  <Label>Número de WhatsApp deste chip</Label>
                  <Input value={eNumero} onChange={(e) => setENumero(e.target.value)}
                         placeholder="(11) 99999-9999" inputMode="tel" />
                  <p className="mt-1.5 text-xs text-mist">
                    Com DDD. Trocar o número aqui <b className="text-chalk">não religa nada</b>: é só o rótulo que o
                    painel mostra.{" "}
                    {ehBaileys
                      ? <>Quem vincula de verdade é o QR, no botão <b className="text-chalk">Conectar</b>.</>
                      : "Quem vincula de verdade é o pareamento feito pelo Chatwoot."}
                  </p>
                </div>
                <MaturidadeField value={eMaturidade} onChange={setEMaturidade} />
              </>
            ) : (
              <>
                <div>
                  <Label>ID do número (phone_number_id)</Label>
                  <Input value={eMetaPhone} onChange={(e) => setEMetaPhone(e.target.value)} className="font-mono text-xs" />
                </div>
                <div>
                  <Label>ID da WABA</Label>
                  <Input value={eMetaWaba} onChange={(e) => setEMetaWaba(e.target.value)} className="font-mono text-xs" />
                </div>
                <CampoToken label="Token de acesso (Meta)" value={eMetaToken} onChange={setEMetaToken} />
                <div>
                  <Label>App ID</Label>
                  <Input value={eMetaAppId} onChange={(e) => setEMetaAppId(e.target.value)}
                         placeholder="1234567890123456" className="font-mono text-xs" />
                </div>
                <div>
                  <CampoToken label="App Secret" value={eMetaAppSecret} onChange={setEMetaAppSecret} />
                  <p className="mt-1.5 text-xs text-mist">
                    App ID + App Secret (Configurações do app → Básico, no painel da Meta) deixam o SAVAN
                    apontar o <b className="text-chalk">webhook do app</b> para o Chatwoot sozinho — é o que faz as
                    respostas dos contatos chegarem. Salve-os e use o botão abaixo.
                  </p>
                </div>

                {/* Webhook do app da Meta — estado + reparo */}
                <div className="rounded-xl border border-line bg-ink-850 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Webhook className={`h-4 w-4 ${webhookEm ? "text-emerald" : "text-amber"}`} />
                      <span className="text-mist">
                        Webhook {webhookEm ? "configurado" : "não configurado pelo SAVAN"}
                      </span>
                    </div>
                    <Button variant="outline" size="sm"
                            onClick={() => configurarWebhook(false)}
                            disabled={configurandoWebhook || !eMetaAppId.trim() || !eMetaAppSecret.trim()}>
                      {configurandoWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                      {webhookEm ? "Reconfigurar" : "Configurar webhook"}
                    </Button>
                  </div>
                  {(!eMetaAppId.trim() || !eMetaAppSecret.trim()) && (
                    <p className="mt-2 text-xs text-mist">Preencha e <b className="text-chalk">salve</b> o App ID e o App Secret para liberar o botão.</p>
                  )}
                  {webhookMsg && (
                    <p className={`mt-2 text-xs ${webhookMsg.tom === "ok" ? "text-emerald" : "text-rose"}`}>{webhookMsg.texto}</p>
                  )}
                  {webhookConflito && (
                    <Button variant="outline" size="sm" className="mt-2 w-full border-rose/40 text-rose"
                            onClick={() => configurarWebhook(true)} disabled={configurandoWebhook}>
                      Substituir mesmo assim
                    </Button>
                  )}
                </div>

                <MaturidadeField value={eMaturidade} onChange={setEMaturidade} />
              </>
            )}
          </>
        )}
        {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={salvar} disabled={pending || carregando}>Salvar</Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditando(false); setErro(""); }} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-emerald">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-chalk">{chip.nome}</span>
              {(chip.papel ?? "bot") === "equipe"
                ? <Badge tone="violet">Cobrador{chip.agente_nome ? ` · ${chip.agente_nome}` : ""}</Badge>
                : <Badge tone="blue">Bot</Badge>}
              {!escalador && (usaTransporteBaileys
                ? <Badge tone="amber"><QrCode className="h-3 w-3" /> WhatsApp comum</Badge>
                : <Badge tone="green"><Cloud className="h-3 w-3" /> Meta oficial</Badge>)}
              {donoNome && <Badge tone="neutral">Conta: {donoNome}</Badge>}
            </div>
            <div className="font-mono text-xs text-mist tabnums">{chip.numero_e164 ?? "sem número"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!escalador && <Badge tone={st.tone}>{st.label}</Badge>}
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-mist transition-colors hover:bg-ink-800 hover:text-chalk">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-xl border border-line bg-ink-900 py-1 shadow-xl">
                  <button onClick={abrirEdicao}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-chalk hover:bg-ink-800">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button onClick={() => { setMenu(false); setConfirmando(true); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose hover:bg-rose/10">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {dia !== null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-mist">
            <span>Aquecimento</span>
            <span className="font-mono text-chalk tabnums">Dia {Math.min(dia, 31)}/31</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, (dia / 31) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Ritmo por hora do chip Baileys. O bloco de saúde abaixo é da Graph API da Meta e não tem
          equivalente aqui: no canal não-oficial não existe "qualidade do número" para consultar —
          o que sinaliza queda é a taxa de entrega (_shared/saude-chip.ts). */}
      {!escalador && usaTransporteBaileys && ritmoHora?.limite ? (
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-mist">
            <Gauge className="h-3.5 w-3.5" /> Ritmo desta hora
          </span>
          <span className={`font-mono text-xs font-600 tabnums ${
            ritmoHora.usados >= ritmoHora.limite ? "text-amber" : "text-chalk"
          }`}>
            {num(ritmoHora.usados)} / {num(ritmoHora.limite)}
          </span>
        </div>
      ) : null}

      {/* Sessão revogada (401). O `chips-monitor` carimba `precisa_qr` quando a Evolution reporta
          `disconnectionReasonCode: 401`. Precisa gritar aqui porque é a única falha do canal que
          NÃO se resolve sozinha: o socket tenta reabrir com a credencial morta e nunca sai de
          connecting/close (§6.4 do guia do Baileys) — e enquanto o operador não refizer o QR a
          campanha inteira fica parada. Ficou 15h invisível em 02/09/2026.
          O texto aponta para o botão pelo NOME EXATO que ele mostra logo abaixo (ver `podeConectar`)
          — dizer só "não resolve sozinho" sem apontar o caminho gerou confusão em 03/09/2026: o
          operador leu como "não clique em nada". */}
      {usaTransporteBaileys && saude?.precisa_qr && (
        <div className="flex items-start gap-2 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
          <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            <p>
              <b>Sessão revogada.</b> O aparelho saiu da lista de conectados do WhatsApp — reabrir a
              conexão sozinho não basta. Aperte <b>&ldquo;Gerar QR novo&rdquo;</b> abaixo e escaneie
              assim que o código aparecer (ele vale só uns 40 segundos).
            </p>
            <p className="text-mist">
              {saude?.motivo_desconexao === "conflict/device_removed"
                ? "O aparelho foi removido da conta — alguém desvinculou, ou o número foi registrado em outro lugar."
                : saude?.motivo_desconexao
                  ? `Motivo: ${saude.motivo_desconexao}.`
                  : "Motivo não informado pela Evolution."}
              {saude?.desconectado_em
                ? ` Caiu em ${new Date(saude.desconectado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
                : ""}
            </p>
          </div>
        </div>
      )}

      {!escalador && !usaTransporteBaileys && (() => {
        const q = QUALIDADE[saude?.quality_rating ?? "UNKNOWN"] ?? QUALIDADE.UNKNOWN;
        const tier = saude?.messaging_limit_tier ?? "TIER_250";
        const teto = TETO_TIER[tier];
        const usado = saude?.msgs_hoje ?? enviados;
        const pct = teto ? Math.min(100, (usado / teto) * 100) : 0;
        return (
          <div className="space-y-2.5 rounded-xl border border-line bg-ink-850 px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-mist"><Activity className="h-3.5 w-3.5" /> Saúde na Meta</span>
              <button onClick={atualizarSaude} disabled={atualizandoSaude}
                      className="inline-flex items-center gap-1 text-[11px] text-mist hover:text-chalk disabled:opacity-50">
                <RotateCw className={`h-3 w-3 ${atualizandoSaude ? "animate-spin" : ""}`} /> Atualizar
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={q.tone as any}>{q.label}</Badge>
              <Badge tone="neutral">Limite {tier.replace("TIER_", "")}</Badge>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-mist">
                <span>Conversas iniciadas hoje</span>
                <span className="font-mono text-chalk tabnums">{num(usado)}{teto ? ` / ${num(teto)}` : ""}</span>
              </div>
              {teto && (
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div className={`h-full rounded-full ${pct >= 80 ? "bg-rose" : pct >= 60 ? "bg-amber" : "bg-emerald"}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            {/* Orçamento de ritmo por hora (§33): o freio que impede gastar a cota do dia numa rajada */}
            {ritmoHora?.limite ? (
              <div className="flex items-center justify-between border-t border-line pt-2">
                <span className="flex items-center gap-1.5 text-xs text-mist">
                  <Gauge className="h-3.5 w-3.5" /> Ritmo desta hora
                </span>
                <span className={`font-mono text-xs font-600 tabnums ${
                  ritmoHora.usados >= ritmoHora.limite ? "text-amber" : "text-chalk"
                }`}>
                  {num(ritmoHora.usados)} / {num(ritmoHora.limite)}
                </span>
              </div>
            ) : null}
            {saude?.quality_rating === "RED" && (
              <p className="text-[11px] text-rose">Qualidade vermelha: pause os disparos. Mais bloqueio/denúncia → a Meta restringe o número.</p>
            )}
          </div>
        );
      })()}

      {/* Trava de abordagem: o chip continua respondendo, só não inicia conversa nova */}
      {chip.abordagem_travada_ate && new Date(chip.abordagem_travada_ate) > new Date() && (
        <div className="flex items-start gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Abordagem travada até{" "}
            <b>{new Date(chip.abordagem_travada_ate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</b>.
            O chip continua respondendo quem já respondeu — só não inicia conversa nova.
          </span>
        </div>
      )}

      {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}

      {confirmando ? (
        <div className="flex flex-col gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3 py-3">
          <p className="text-xs text-rose">Excluir <b>{chip.nome}</b>? Isso remove as credenciais e o inbox no Chatwoot.</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" className="flex-1" onClick={excluir} disabled={pending}>
              <Trash2 className="h-4 w-4" /> {pending ? "Excluindo…" : "Excluir"}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmando(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : escalador ? (
        <div className="rounded-xl border border-line bg-ink-850 px-3 py-2.5 text-xs text-mist">
          Escalador humano — recebe as transferências no WhatsApp. Não dispara campanha nem aparece no Chatwoot.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* baileys_chatwoot cai (chip caiu, mesmo status) mas o painel não sabe religar por QR —
              essa é a Evolution. Sem esta nota, um chip nesse estado ficava sem nenhum botão e sem
              explicação de onde ir. */}
          {usaTransporteBaileys && !ehBaileys && chip.status === "desconectado" && (
            <div className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
              Sessão caiu. Reconecte pela tela do Chatwoot (canal Baileys nativo) — este painel não
              faz o pareamento desse provedor ainda.
            </div>
          )}
          <div className="flex gap-2">
          {podeConectar && (
            <Button size="sm" className="flex-1" onClick={() => setConectando(true)} disabled={pending}>
              {/* Sessão revogada é diagnóstico, não simples queda: "Reconectar" sugeria religar
                  sozinho, e é exatamente o que NÃO funciona aqui — precisa de QR novo, sempre. */}
              <QrCode className="h-4 w-4" />{" "}
              {ehBaileys && saude?.precisa_qr
                ? "Gerar QR novo"
                : chip.status === "desconectado" ? "Reconectar" : "Conectar"}
            </Button>
          )}
          {podeAtivar && (
            <Button size="sm" className="flex-1" onClick={() => acao("ativar")} disabled={pending}>
              <Play className="h-4 w-4" /> Ativar
            </Button>
          )}
          {podePausar && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => acao("pausar")} disabled={pending}>
              <Pause className="h-4 w-4" /> Pausar
            </Button>
          )}
          {chip.status === "pausado" && (
            <Button size="sm" className="flex-1" onClick={() => acao("retomar")} disabled={pending}>
              <Play className="h-4 w-4" /> Retomar
            </Button>
          )}
          </div>
        </div>
      )}
    </Card>
  );
}
