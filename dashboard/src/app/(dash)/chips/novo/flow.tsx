"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { MaturidadeField, type MaturidadeValor } from "@/components/MaturidadeField";
import { TipoChipField, type TipoChip } from "@/components/TipoChipField";
import { ConectorChipField, type Conector } from "@/components/ConectorChipField";
import {
  Smartphone, CheckCircle2, RefreshCw, ArrowRight,
  CreditCard, AlertTriangle, ExternalLink, KeyRound,
  BadgeCheck, Copy, Webhook, FileText,
} from "lucide-react";

type Motivo = "assinatura" | "config" | "credencial" | "indisponivel" | null;

type MetaResultado = {
  numero: string | null;
  saude: { quality_rating: string; messaging_limit_tier: string; verified_name: string | null } | null;
  chatwoot: { ok: boolean; mensagem?: string };
  callback_url: string | null;
  verify_token: string | null;
  waba_assinada: boolean;
};

// Campo somente-leitura com botão de copiar (URL de callback / verify token da Meta).
function CampoCopiavel({ rotulo, valor, onCopiar }: { rotulo: string; valor: string; onCopiar: (v: string) => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <Label>{rotulo}</Label>
      <div className="relative">
        <Input readOnly value={valor} className="pr-10 font-mono text-[11px]" />
        <button type="button" tabIndex={-1} aria-label="Copiar"
                onClick={() => { onCopiar(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-mist hover:text-chalk">
          {copiado ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function NovoChipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const idExistente = params.get("id");

  const [etapa, setEtapa] = useState<"form" | "qr" | "meta_ok">(idExistente ? "qr" : "form");
  const [chipId, setChipId] = useState<string | null>(idExistente);
  const [nome, setNome] = useState("");
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [maturidade, setMaturidade] = useState<MaturidadeValor>({ maturidade: "novo", limite_dia_override: null });
  const [tipo, setTipo] = useState<TipoChip>("fisico");
  const [conector, setConector] = useState<Conector>("zapi");
  // credenciais Meta Cloud (conector oficial)
  const [metaPhone, setMetaPhone] = useState("");
  const [metaWaba, setMetaWaba] = useState("");
  const [metaToken, setMetaToken] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaResultado, setMetaResultado] = useState<MetaResultado | null>(null);
  const [papel, setPapel] = useState<"bot" | "equipe">("bot");
  const [agente, setAgente] = useState("");
  const [numeroEquipe, setNumeroEquipe] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [carregandoQr, setCarregandoQr] = useState(false);
  const [motivo, setMotivo] = useState<Motivo>(null);
  const [erroQr, setErroQr] = useState<string | null>(null);

  // estado do vínculo com o Chatwoot
  const [chatwootVinculado, setChatwootVinculado] = useState(false);
  const [chatwootMsg, setChatwootMsg] = useState<{ ok: boolean; mensagem?: string } | null>(null);
  const [vinculandoCw, setVinculandoCw] = useState(false);

  type Final = { telefone: string | null; telefone_ok: boolean; webhook_ok: boolean; chatwoot_ok: boolean; mensagem?: string };
  const [finalizacao, setFinalizacao] = useState<Final | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setSalvando(true);
    const equipe = papel === "equipe";
    const meta = !equipe && conector === "meta_cloud";
    const body = equipe
      ? { nome, papel: "equipe", agente_nome: agente, numero_e164: numeroEquipe }
      : meta
        ? {
            nome, papel: "bot", conector: "meta_cloud",
            meta_phone_number_id: metaPhone, meta_waba_id: metaWaba, meta_token: metaToken, meta_app_secret: metaAppSecret,
            maturidade: maturidade.maturidade, limite_dia_override: maturidade.limite_dia_override,
          }
        : {
            nome, instance_id: instance, token, client_token: clientToken, tipo, papel: "bot",
            maturidade: maturidade.maturidade, limite_dia_override: maturidade.limite_dia_override,
          };
    const r = await fetch("/api/chips", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSalvando(false);
    const d = await r.json();
    if (!r.ok) { setErro(d.erro ?? "Falha ao cadastrar."); return; }
    // escalador humano só registrado: não tem QR nem Chatwoot — volta para a lista
    if (equipe) { router.push("/chips"); router.refresh(); return; }
    setChipId(String(d.chip_id));
    // Meta oficial: número já conectado (sem QR) — vai para a tela de confirmação
    if (meta) {
      setMetaResultado({
        numero: d.numero ?? null, saude: d.saude ?? null,
        chatwoot: d.chatwoot ?? { ok: false }, callback_url: d.callback_url ?? null,
        verify_token: d.verify_token ?? null, waba_assinada: !!d.waba_assinada,
      });
      setEtapa("meta_ok");
      return;
    }
    setChatwootVinculado(d.chatwoot?.ok === true);
    if (d.chatwoot && d.chatwoot.ok === false) setChatwootMsg({ ok: false, mensagem: d.chatwoot.mensagem });
    setEtapa("qr");
  }

  async function buscarQr() {
    if (!chipId) return;
    setCarregandoQr(true);
    try {
      const r = await fetch(`/api/chips/${chipId}/qrcode`);
      const d = await r.json();
      if (typeof d.chatwoot_vinculado === "boolean") setChatwootVinculado(d.chatwoot_vinculado);
      if (d.finalizacao) setFinalizacao(d.finalizacao);
      if (d.conectado) {
        setConectado(true); setQr(null); setMotivo(null); setErroQr(null);
      } else {
        setQr(d.qr ?? null); setMotivo((d.motivo as Motivo) ?? null); setErroQr(d.erro ?? null);
      }
    } catch { /* ignora — tenta de novo no próximo ciclo */ }
    setCarregandoQr(false);
  }

  async function vincularCw() {
    if (!chipId) return;
    setVinculandoCw(true);
    try {
      const r = await fetch(`/api/chips/${chipId}/chatwoot`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const d = await r.json();
      if (r.ok && d.ok) { setChatwootVinculado(true); setChatwootMsg({ ok: true }); }
      else setChatwootMsg({ ok: false, mensagem: d.erro ?? "Falha ao vincular o Chatwoot." });
    } catch (e) { setChatwootMsg({ ok: false, mensagem: String(e) }); }
    setVinculandoCw(false);
  }

  // polling do QR/status — pausa em erro definitivo (assinatura/config/credencial)
  const erroDefinitivo = motivo === "assinatura" || motivo === "config" || motivo === "credencial";
  useEffect(() => {
    if (etapa !== "qr" || conectado || erroDefinitivo) return;
    buscarQr();
    const t = setInterval(buscarQr, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, conectado, chipId, erroDefinitivo]);

  if (etapa === "form") {
    return (
      <form onSubmit={criar} className="max-w-lg">
        <Card className="flex flex-col gap-5">
          <div>
            <Label>Nome do chip</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Chip 01" required />
          </div>
          <div>
            <Label>Papel do chip</Label>
            <select value={papel} onChange={(e) => setPapel(e.target.value as "bot" | "equipe")}
                    className="h-10 w-full rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
              <option value="bot">Bot (dispara e negocia automaticamente)</option>
              <option value="equipe">Equipe (cobrador humano — só recebe escalações)</option>
            </select>
            <p className="mt-1.5 text-xs text-mist">
              Marque <b className="text-chalk">Equipe</b> se este é o chip de um <b className="text-chalk">escalador humano</b>:
              ele só recebe as transferências no WhatsApp, <b className="text-chalk">não dispara nada e não precisa de Z-API</b>.
              Você informa só o número dele.
            </p>
          </div>

          {papel === "bot" ? (
            <>
              <ConectorChipField value={conector} onChange={setConector} />

              {conector === "zapi" ? (
                <>
                  <div>
                    <Label>Instance ID (Z-API)</Label>
                    <Input value={instance} onChange={(e) => setInstance(e.target.value)}
                           placeholder="3F258A682CEAA17C040FFAB71E115C52" required className="font-mono text-xs" />
                  </div>
                  <div>
                    <Label>Token da instância (Z-API)</Label>
                    <Input value={token} onChange={(e) => setToken(e.target.value)}
                           placeholder="B777F7686FC2C33DB62C18FE" required className="font-mono text-xs" />
                  </div>
                  <div>
                    <Label>Token de Segurança (Z-API)</Label>
                    <Input value={clientToken} onChange={(e) => setClientToken(e.target.value)}
                           placeholder="F73f… (token de segurança da conta)" required className="font-mono text-xs" />
                    <p className="mt-1.5 text-xs text-mist">
                      Os três vêm do painel da Z-API: <b className="text-chalk">Instance ID</b> e <b className="text-chalk">Token</b> na sua
                      instância; o <b className="text-chalk">Token de Segurança</b> na aba <b className="text-chalk">Segurança</b> da conta.
                      Cada conta Z-API tem o seu — por isso ele é informado aqui por chip.
                    </p>
                  </div>
                  <TipoChipField value={tipo} onChange={setTipo} />
                </>
              ) : (
                <>
                  <div className="flex gap-2 rounded-lg border border-blue/30 bg-blue/10 px-3 py-2.5 text-[11px] leading-relaxed text-blue">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Antes: crie um app no <b>Meta Business</b> com o produto <b>WhatsApp</b>, adicione o número e
                      gere um <b>token permanente de usuário do sistema</b> (Etapa 5 da doc da Meta). Cole abaixo
                      o <b>ID do número</b>, o <b>ID da WABA</b> e o <b>token</b>.
                    </span>
                  </div>
                  <div>
                    <Label>ID do número de telefone (phone_number_id)</Label>
                    <Input value={metaPhone} onChange={(e) => setMetaPhone(e.target.value)}
                           placeholder="1098765432109876" required className="font-mono text-xs" />
                  </div>
                  <div>
                    <Label>ID da conta WhatsApp Business (WABA)</Label>
                    <Input value={metaWaba} onChange={(e) => setMetaWaba(e.target.value)}
                           placeholder="1023456789012345" required className="font-mono text-xs" />
                  </div>
                  <div>
                    <Label>Token de acesso permanente</Label>
                    <Input type="password" value={metaToken} onChange={(e) => setMetaToken(e.target.value)}
                           placeholder="EAAG… (token do usuário do sistema)" required className="font-mono text-xs" />
                  </div>
                  <div>
                    <Label>App Secret (opcional)</Label>
                    <Input type="password" value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)}
                           placeholder="só se for usar alertas em tempo real" className="font-mono text-xs" />
                    <p className="mt-1.5 text-xs text-mist">
                      Validamos o token na Meta na hora — se estiver certo, o número conecta sem QR e já aparece a
                      <b className="text-chalk"> qualidade</b> dele.
                    </p>
                  </div>
                </>
              )}
              <MaturidadeField value={maturidade} onChange={setMaturidade} />
            </>
          ) : (
            <>
              <div>
                <Label>Nome do cobrador (dono deste chip)</Label>
                <Input value={agente} onChange={(e) => setAgente(e.target.value)} placeholder="Ex.: Carlos" required />
              </div>
              <div>
                <Label>Número de WhatsApp do cobrador</Label>
                <Input value={numeroEquipe} onChange={(e) => setNumeroEquipe(e.target.value)}
                       placeholder="(11) 99999-9999" required inputMode="tel" />
                <p className="mt-1.5 text-xs text-mist">
                  Com DDD. É para este número que o bot avisa quando transferir um devedor — e é ele que o
                  devedor recebe para falar com o cobrador. O chip dele <b className="text-chalk">não conecta no Chatwoot</b>:
                  fica só registrado para ser escolhido como escalador na carteira.
                </p>
              </div>
            </>
          )}
          {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}
          <Button type="submit" disabled={salvando}>
            {salvando ? "Cadastrando…"
              : papel === "equipe"
                ? <>Cadastrar escalador <ArrowRight className="h-4 w-4" /></>
                : conector === "meta_cloud"
                  ? <>Conectar número oficial <ArrowRight className="h-4 w-4" /></>
                  : <>Cadastrar e gerar QR <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </Card>
      </form>
    );
  }

  if (etapa === "meta_ok" && metaResultado) {
    const m = metaResultado;
    const qTone = m.saude?.quality_rating === "GREEN" ? "green" : m.saude?.quality_rating === "RED" ? "rose" : "amber";
    const copiar = (v: string) => navigator.clipboard?.writeText(v).catch(() => {});
    return (
      <div className="max-w-lg space-y-4">
        <Card className="flex flex-col items-center gap-5 py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald/15 text-emerald glow-ring">
            <BadgeCheck className="h-8 w-8" />
          </span>
          <div>
            <h3 className="font-display text-lg font-700 text-chalk">Número oficial conectado!</h3>
            {m.numero && <p className="mt-1 font-mono text-sm text-chalk tabnums">{m.numero}</p>}
            {m.saude?.verified_name && <p className="mt-0.5 text-xs text-mist">{m.saude.verified_name}</p>}
          </div>
          {m.saude && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge tone={qTone as any}>Qualidade: {m.saude.quality_rating}</Badge>
              <Badge tone="neutral">Limite: {m.saude.messaging_limit_tier.replace("TIER_", "")}</Badge>
            </div>
          )}
          <div className="w-full space-y-1.5 text-left text-xs">
            <div className="flex items-center gap-2">
              {m.chatwoot.ok ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <AlertTriangle className="h-4 w-4 text-amber" />}
              <span className="text-mist">Chatwoot {m.chatwoot.ok ? "vinculado (canal Cloud API)" : "não vinculado"}</span>
            </div>
            <div className="flex items-center gap-2">
              {m.waba_assinada ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <AlertTriangle className="h-4 w-4 text-amber" />}
              <span className="text-mist">WABA {m.waba_assinada ? "assinada ao app" : "não assinada (verifique permissões do token)"}</span>
            </div>
            {!m.chatwoot.ok && m.chatwoot.mensagem && <p className="text-rose">{m.chatwoot.mensagem}</p>}
          </div>
          <Button onClick={() => { router.push("/chips"); router.refresh(); }}>Voltar para chips</Button>
        </Card>

        {/* Etapa manual única: apontar o webhook do app da Meta para o Chatwoot */}
        {m.callback_url && (
          <Card className="flex flex-col gap-2.5 py-4">
            <div className="flex items-center gap-2 text-sm text-chalk">
              <Webhook className="h-4 w-4 text-blue" /> Configure o webhook no app da Meta
            </div>
            <p className="text-xs text-mist">
              No painel da Meta (seu app → WhatsApp → Configuração), cole a <b className="text-chalk">URL de callback</b> e
              o <b className="text-chalk">token de verificação</b> abaixo. É o que faz as respostas dos contatos chegarem.
            </p>
            <CampoCopiavel rotulo="URL de callback" valor={m.callback_url} onCopiar={copiar} />
            {m.verify_token && <CampoCopiavel rotulo="Token de verificação" valor={m.verify_token} onCopiar={copiar} />}
          </Card>
        )}

        {/* Lembrete do regime: template aprovado para o 1º contato frio */}
        <Card className="flex gap-2.5 border-amber/30 bg-amber/5 py-4">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <div className="text-xs leading-relaxed text-mist">
            <b className="text-amber">Para disparar a campanha por este número</b>, a 1ª mensagem a um contato novo
            precisa ser um <b className="text-chalk">modelo (template) aprovado pela Meta</b>. Crie e acompanhe a
            aprovação em <a href="/templates-meta" className="text-emerald-soft underline">Templates Meta</a>. A qualidade
            do número cai se as pessoas bloquearem/denunciarem — acompanhe o semáforo no card do chip.
          </div>
        </Card>
      </div>
    );
  }

  function tentarDeNovo() { setErroQr(null); setMotivo(null); }

  return (
    <div className="max-w-lg space-y-4">
      <Card className="flex flex-col items-center gap-5 py-8 text-center">
        {conectado ? (
          <>
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald/15 text-emerald glow-ring">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <div>
              <h3 className="font-display text-lg font-700 text-chalk">WhatsApp conectado!</h3>
              {finalizacao?.telefone && (
                <p className="mt-1 font-mono text-sm text-chalk tabnums">{finalizacao.telefone}</p>
              )}
              <p className="mt-1 text-sm text-mist">O chip está pronto. Agora é só ativar para iniciar o aquecimento.</p>
            </div>
            {finalizacao && (
              <div className="w-full space-y-1.5 text-left text-xs">
                <div className="flex items-center gap-2">
                  {finalizacao.chatwoot_ok ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <AlertTriangle className="h-4 w-4 text-amber" />}
                  <span className="text-mist">Chatwoot {finalizacao.chatwoot_ok ? "vinculado com o número real" : "não vinculado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {finalizacao.webhook_ok ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <AlertTriangle className="h-4 w-4 text-amber" />}
                  <span className="text-mist">Webhook da Z-API {finalizacao.webhook_ok ? "apontando para o Chatwoot" : "não configurado"}</span>
                </div>
                {finalizacao.mensagem && (!finalizacao.webhook_ok || !finalizacao.chatwoot_ok) && (
                  <p className="text-rose">{finalizacao.mensagem}</p>
                )}
              </div>
            )}
            <Button onClick={() => router.push("/chips")}>Voltar para chips</Button>
          </>
        ) : motivo === "assinatura" ? (
          <>
            <Badge tone="rose"><CreditCard className="h-3.5 w-3.5" /> Assinatura pendente</Badge>
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber/15 text-amber">
              <CreditCard className="h-8 w-8" />
            </span>
            <div>
              <h3 className="font-display text-lg font-700 text-chalk">Assinatura da instância Z-API pendente</h3>
              <p className="mt-1.5 text-sm text-mist">
                O QR code não aparece porque a assinatura <b className="text-chalk">desta instância</b> na Z-API
                está expirada, pendente ou cancelada. Acesse o painel da Z-API, quite a assinatura
                (<b className="text-chalk">não pode estar cancelada</b>) e volte aqui para gerar o QR.
              </p>
            </div>
            {erroQr && (
              <p className="w-full rounded-lg border border-line bg-ink-850 px-3 py-2 text-left text-xs text-mist">
                <span className="text-mist/70">Z-API: </span>{erroQr}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <a href="https://app.z-api.io" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">Abrir painel da Z-API <ExternalLink className="h-4 w-4" /></Button>
              </a>
              <Button size="sm" onClick={tentarDeNovo} disabled={carregandoQr}>
                <RefreshCw className={`h-4 w-4 ${carregandoQr ? "animate-spin" : ""}`} /> Já paguei, tentar de novo
              </Button>
            </div>
          </>
        ) : motivo === "config" ? (
          <>
            <Badge tone="amber"><KeyRound className="h-3.5 w-3.5" /> Configuração pendente</Badge>
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber/15 text-amber">
              <KeyRound className="h-8 w-8" />
            </span>
            <div>
              <h3 className="font-display text-lg font-700 text-chalk">Token de segurança não configurado</h3>
              <p className="mt-1.5 text-sm text-mist">
                {erroQr ?? "Token de segurança da Z-API não informado neste chip. Edite o chip e preencha o Token de Segurança."}
              </p>
            </div>
            <Button size="sm" onClick={tentarDeNovo} disabled={carregandoQr}>
              <RefreshCw className={`h-4 w-4 ${carregandoQr ? "animate-spin" : ""}`} /> Tentar de novo
            </Button>
          </>
        ) : (
          <>
            <Badge tone="amber"><Smartphone className="h-3.5 w-3.5" /> Aguardando conexão</Badge>
            <div className="grid h-64 w-64 place-items-center rounded-2xl border border-line bg-white p-3">
              {qr ? (
                <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                     alt="QR Code" className="h-full w-full object-contain" />
              ) : (
                <RefreshCw className={`h-8 w-8 text-ink-600 ${carregandoQr ? "animate-spin" : ""}`} />
              )}
            </div>
            <div className="max-w-xs text-sm text-mist">
              Abra o WhatsApp no celular do chip → <b className="text-chalk">Aparelhos conectados</b> →
              <b className="text-chalk"> Conectar aparelho</b> e escaneie o código.
            </div>
            {motivo === "indisponivel" && erroQr && (
              <p className="w-full rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-left text-xs text-amber">
                Não foi possível obter o QR agora. Z-API: {erroQr}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={buscarQr} disabled={carregandoQr}>
              <RefreshCw className="h-4 w-4" /> Atualizar QR
            </Button>
          </>
        )}
      </Card>

      {/* Vínculo com o Chatwoot — o token de segurança liga a instância ao atendimento */}
      {chipId && (
        <Card className="flex flex-col gap-2 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {chatwootVinculado
                ? <CheckCircle2 className="h-4 w-4 text-emerald" />
                : <AlertTriangle className="h-4 w-4 text-amber" />}
              <span className="text-mist">
                Chatwoot {chatwootVinculado ? <b className="text-emerald-soft">vinculado</b> : <b className="text-amber">não vinculado</b>}
              </span>
            </div>
            {!chatwootVinculado && (
              <Button variant="outline" size="sm" onClick={vincularCw} disabled={vinculandoCw}>
                {vinculandoCw ? "Vinculando…" : "Vincular"}
              </Button>
            )}
          </div>
          {chatwootMsg && !chatwootMsg.ok && (
            <p className="text-xs text-rose">{chatwootMsg.mensagem}</p>
          )}
        </Card>
      )}
    </div>
  );
}
