"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Input, Label } from "@/components/ui/primitives";
import { MaturidadeField, type MaturidadeValor } from "@/components/MaturidadeField";
import { TipoChipField, type TipoChip } from "@/components/TipoChipField";
import { num } from "@/lib/utils";
import { Play, Pause, QrCode, Smartphone, AlertTriangle, MoreVertical, Pencil, Trash2, X, Eye, EyeOff, Loader2, Cloud, Activity, RotateCw } from "lucide-react";
import Link from "next/link";

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

const TIPO: Record<string, { tone: any; label: string }> = {
  fisico: { tone: "neutral", label: "Físico" },
  esim: { tone: "blue", label: "eSIM" },
  voip: { tone: "amber", label: "VoIP" },
  virtual_api: { tone: "rose", label: "Virtual API" },
};

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

export function ChipCard({ chip, metrica, donoNome }: { chip: any; metrica?: any; donoNome?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");

  const [eNome, setENome] = useState(chip.nome);
  const [eInstance, setEInstance] = useState("");
  const [eToken, setEToken] = useState("");
  const [eClientToken, setEClientToken] = useState("");
  const [eMaturidade, setEMaturidade] = useState<MaturidadeValor>({ maturidade: "novo", limite_dia_override: null });
  const [origMat, setOrigMat] = useState<MaturidadeValor>({ maturidade: "novo", limite_dia_override: null });
  const [ePapel, setEPapel] = useState<string>("bot");
  const [eAgente, setEAgente] = useState<string>("");
  const [eNumero, setENumero] = useState<string>("");
  const [origPapel, setOrigPapel] = useState({ papel: "bot", agente: "", numero: "" });
  const [eTipo, setETipo] = useState<TipoChip>("fisico");
  const [origTipo, setOrigTipo] = useState<TipoChip>("fisico");
  const [carregando, setCarregando] = useState(false);
  const [orig, setOrig] = useState({ instance: "", token: "", clientToken: "" });

  // conector Meta (oficial): credenciais e saúde do número
  const ehMeta = (chip.conector ?? "zapi") === "meta_cloud";
  const [eMetaPhone, setEMetaPhone] = useState("");
  const [eMetaWaba, setEMetaWaba] = useState("");
  const [eMetaToken, setEMetaToken] = useState("");
  const [origMeta, setOrigMeta] = useState({ phone: "", waba: "", token: "" });
  const [saude, setSaude] = useState<any>(chip.saude ?? null);
  const [atualizandoSaude, setAtualizandoSaude] = useState(false);

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
  // escalador humano "só registrado" (sem Z-API): papel=equipe, número à mão, sem inbox no Chatwoot.
  // Não tem QR, não dispara e não aparece no Chatwoot — esconde os controles que não se aplicam.
  const escaladorManual = (chip.papel ?? "bot") === "equipe" && !!chip.numero_e164 && !chip.chatwoot_inbox_id;
  const escaladorManualEdit = ePapel === "equipe" && !chip.chatwoot_inbox_id;

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
        setEInstance(d.instance_id ?? "");
        setEToken(d.token ?? "");
        setEClientToken(d.client_token ?? "");
        setOrig({ instance: d.instance_id ?? "", token: d.token ?? "", clientToken: d.client_token ?? "" });
        const mat: MaturidadeValor = { maturidade: d.maturidade ?? "novo", limite_dia_override: d.limite_dia_override ?? null };
        setEMaturidade(mat); setOrigMat(mat);
        setEPapel(d.papel ?? "bot"); setEAgente(d.agente_nome ?? ""); setENumero(d.numero_e164 ?? "");
        setOrigPapel({ papel: d.papel ?? "bot", agente: d.agente_nome ?? "", numero: d.numero_e164 ?? "" });
        setETipo((d.tipo ?? "fisico") as TipoChip); setOrigTipo((d.tipo ?? "fisico") as TipoChip);
        setEMetaPhone(d.meta_phone_number_id ?? ""); setEMetaWaba(d.meta_waba_id ?? ""); setEMetaToken(d.meta_token ?? "");
        setOrigMeta({ phone: d.meta_phone_number_id ?? "", waba: d.meta_waba_id ?? "", token: d.meta_token ?? "" });
      })
      .catch(() => setErro("Falha ao carregar os dados do chip."))
      .finally(() => setCarregando(false));
  }

  function salvar() {
    setErro("");
    const body: Record<string, unknown> = {};
    if (eNome.trim() && eNome.trim() !== chip.nome) body.nome = eNome.trim();
    if (eInstance.trim() && eInstance.trim() !== orig.instance) body.instance_id = eInstance.trim();
    if (eToken.trim() && eToken.trim() !== orig.token) body.token = eToken.trim();
    if (eClientToken.trim() && eClientToken.trim() !== orig.clientToken) body.client_token = eClientToken.trim();
    if (eMaturidade.maturidade !== origMat.maturidade) body.maturidade = eMaturidade.maturidade;
    if (eMaturidade.limite_dia_override !== origMat.limite_dia_override) {
      body.limite_dia_override = eMaturidade.limite_dia_override;
    }
    if (ePapel !== origPapel.papel) body.papel = ePapel;
    if (eAgente.trim() !== origPapel.agente) body.agente_nome = eAgente.trim();
    if (eNumero.trim() !== origPapel.numero) body.numero_e164 = eNumero.trim();
    if (eTipo !== origTipo) body.tipo = eTipo;
    if (eMetaPhone.trim() !== origMeta.phone) body.meta_phone_number_id = eMetaPhone.trim();
    if (eMetaWaba.trim() !== origMeta.waba) body.meta_waba_id = eMetaWaba.trim();
    if (eMetaToken.trim() !== origMeta.token) body.meta_token = eMetaToken.trim();
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

  const podeAtivar = ["cadastrado", "conectado", "desconectado"].includes(chip.status);
  const podePausar = ["ativo", "aquecendo"].includes(chip.status);

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
            {escaladorManualEdit ? (
              <div>
                <Label>Número de WhatsApp do cobrador</Label>
                <Input value={eNumero} onChange={(e) => setENumero(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
                <p className="mt-1.5 text-xs text-mist">
                  Com DDD. É o número que recebe as transferências. Este escalador não usa Z-API nem aparece no Chatwoot.
                </p>
              </div>
            ) : ehMeta ? (
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
                <MaturidadeField value={eMaturidade} onChange={setEMaturidade} />
              </>
            ) : (
              <>
                <div>
                  <Label>Instance ID (Z-API)</Label>
                  <Input value={eInstance} onChange={(e) => setEInstance(e.target.value)} className="font-mono text-xs" />
                </div>
                <CampoToken label="Token da instância (Z-API)" value={eToken} onChange={setEToken} />
                <CampoToken label="Token de Segurança (Z-API)" value={eClientToken} onChange={setEClientToken} />
                <TipoChipField value={eTipo} onChange={setETipo} />
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
              {ehMeta && <Badge tone="green"><Cloud className="h-3 w-3" /> Meta oficial</Badge>}
              {!escaladorManual && !ehMeta && (() => { const t = TIPO[chip.tipo ?? "fisico"] ?? TIPO.fisico; return <Badge tone={t.tone}>{t.label}</Badge>; })()}
              {donoNome && <Badge tone="neutral">Conta: {donoNome}</Badge>}
            </div>
            <div className="font-mono text-xs text-mist tabnums">{chip.numero_e164 ?? "sem número"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!escaladorManual && <Badge tone={st.tone}>{st.label}</Badge>}
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

      {!escaladorManual && ehMeta && (() => {
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
            {saude?.quality_rating === "RED" && (
              <p className="text-[11px] text-rose">Qualidade vermelha: pause os disparos. Mais bloqueio/denúncia → a Meta restringe o número.</p>
            )}
          </div>
        );
      })()}

      {!escaladorManual && !ehMeta && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3 py-2.5">
          <span className="text-xs text-mist">Enviados hoje</span>
          <span className="font-mono text-sm font-600 text-chalk tabnums">{num(enviados)}</span>
        </div>
      )}

      {!escaladorManual && !ehMeta && !chip.chatwoot_inbox_id && (
        <Link href={`/chips/novo?id=${chip.id}`}
              className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber transition-colors hover:bg-amber/15">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Chatwoot não vinculado — clique para vincular
        </Link>
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
      ) : escaladorManual ? (
        <div className="rounded-xl border border-line bg-ink-850 px-3 py-2.5 text-xs text-mist">
          Escalador humano — recebe as transferências no WhatsApp. Não dispara campanha nem aparece no Chatwoot.
        </div>
      ) : (
        <div className="flex gap-2">
          {!ehMeta && (
            <Link href={`/chips/novo?id=${chip.id}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full"><QrCode className="h-4 w-4" /> QR Code</Button>
            </Link>
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
      )}
    </Card>
  );
}
