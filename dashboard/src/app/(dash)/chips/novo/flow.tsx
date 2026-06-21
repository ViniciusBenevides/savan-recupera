"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Input, Label, Button, Badge } from "@/components/ui/primitives";
import {
  Smartphone, CheckCircle2, RefreshCw, ArrowRight,
  CreditCard, AlertTriangle, ExternalLink, KeyRound,
} from "lucide-react";

type Motivo = "assinatura" | "config" | "credencial" | "indisponivel" | null;

export function NovoChipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const idExistente = params.get("id");

  const [etapa, setEtapa] = useState<"form" | "qr">(idExistente ? "qr" : "form");
  const [chipId, setChipId] = useState<string | null>(idExistente);
  const [nome, setNome] = useState("");
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
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
    const r = await fetch("/api/chips", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, instance_id: instance, token, client_token: clientToken }),
    });
    setSalvando(false);
    const d = await r.json();
    if (!r.ok) { setErro(d.erro ?? "Falha ao cadastrar."); return; }
    setChipId(String(d.chip_id));
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
          {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}
          <Button type="submit" disabled={salvando}>
            {salvando ? "Cadastrando…" : <>Cadastrar e gerar QR <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </Card>
      </form>
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
