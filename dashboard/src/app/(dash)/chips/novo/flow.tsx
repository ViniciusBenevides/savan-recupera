"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { MaturidadeField, type MaturidadeValor } from "@/components/MaturidadeField";
import { ConectarChip } from "../conectar-chip";
import {
  CheckCircle2, ArrowRight, AlertTriangle, BadgeCheck, Copy, Webhook, FileText, QrCode, ShieldAlert,
} from "lucide-react";

type MetaResultado = {
  numero: string | null;
  saude: { quality_rating: string; messaging_limit_tier: string; verified_name: string | null } | null;
  chatwoot: { ok: boolean; mensagem?: string };
  callback_url: string | null;
  verify_token: string | null;
  waba_assinada: boolean;
  webhook: { ok: boolean; motivo: string; mensagem: string };
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

// Cadastro de número. Três caminhos:
//  - Baileys (padrão): número comum, vinculado por QR na Evolution. É o canal em uso desde que a
//    conta oficial foi banida em 17/08/2026 (§38);
//  - Meta Cloud API: continua existindo para o dia em que houver conta oficial de novo, mas é
//    escolha explícita — ninguém cai nela por omissão;
//  - escalador humano: não conecta em nada, fica registrado só para receber transferências.
export function NovoChipFlow() {
  const router = useRouter();

  const [etapa, setEtapa] = useState<"form" | "conectar" | "meta_ok">("form");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"bot" | "equipe">("bot");
  const [canal, setCanal] = useState<"baileys" | "meta_cloud">("baileys");
  const [maturidade, setMaturidade] = useState<MaturidadeValor>({ maturidade: "novo", limite_dia_override: null, limite_hora_override: null });

  // Baileys
  const [numero, setNumero] = useState("");
  const [chipCriado, setChipCriado] = useState<{ id: number; nome: string } | null>(null);

  // Meta Cloud API
  const [metaPhone, setMetaPhone] = useState("");
  const [metaWaba, setMetaWaba] = useState("");
  const [metaToken, setMetaToken] = useState("");
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaResultado, setMetaResultado] = useState<MetaResultado | null>(null);

  // Escalador humano
  const [agente, setAgente] = useState("");
  const [numeroEquipe, setNumeroEquipe] = useState("");

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function voltarParaLista() {
    router.push("/ajustes?aba=chips");
    router.refresh();
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setSalvando(true);

    const equipe = papel === "equipe";
    const ritmo = {
      maturidade: maturidade.maturidade,
      limite_dia_override: maturidade.limite_dia_override,
      limite_hora_override: maturidade.limite_hora_override,
    };
    // O `conector` vai SEMPRE explícito. Sem ele a API cai no padrão e o erro mente sobre a causa.
    const body = equipe
      ? { nome, papel: "equipe", agente_nome: agente, numero_e164: numeroEquipe }
      : canal === "baileys"
        ? { nome, papel: "bot", conector: "baileys", numero_e164: numero, ...ritmo }
        : {
            nome, papel: "bot", conector: "meta_cloud",
            meta_phone_number_id: metaPhone, meta_waba_id: metaWaba, meta_token: metaToken,
            meta_app_id: metaAppId, meta_app_secret: metaAppSecret, ...ritmo,
          };

    const r = await fetch("/api/chips", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSalvando(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(d.erro ?? "Falha ao cadastrar."); return; }

    // escalador humano só registrado: não conecta em nada — volta para a lista
    if (equipe) { voltarParaLista(); return; }

    if (canal === "baileys") {
      setChipCriado({ id: d.chip_id, nome });
      setEtapa("conectar");
      return;
    }

    setMetaResultado({
      numero: d.numero ?? null, saude: d.saude ?? null,
      chatwoot: d.chatwoot ?? { ok: false }, callback_url: d.callback_url ?? null,
      verify_token: d.verify_token ?? null, waba_assinada: !!d.waba_assinada,
      webhook: d.webhook ?? { ok: false, motivo: "indisponivel", mensagem: "" },
    });
    setEtapa("meta_ok");
  }

  // ── Passo 2 do Baileys: o QR ────────────────────────────────────────────────────────────
  if (etapa === "conectar" && chipCriado) {
    return (
      <div className="max-w-lg space-y-4">
        <ConectarChip chipId={chipCriado.id} nome={chipCriado.nome} onFechar={voltarParaLista} />
        <Card className="flex gap-2.5 border-amber/30 bg-amber/5 py-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <div className="text-xs leading-relaxed text-mist">
            <b className="text-amber">A sessão é a credencial.</b> Depois de conectado, não desconecte o
            aparelho pelo celular nem apague a instância: não existe token para trocar, e um número que já
            rodou automação costuma não voltar a registrar. Se cair, o caminho é outro número.
          </div>
        </Card>
      </div>
    );
  }

  // ── Formulário ──────────────────────────────────────────────────────────────────────────
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
              ele só recebe as transferências no WhatsApp, <b className="text-chalk">não dispara nada e não conecta em nada</b>.
              Você informa só o número dele.
            </p>
          </div>

          {papel === "bot" ? (
            <>
              <div>
                <Label>Canal</Label>
                <select value={canal} onChange={(e) => setCanal(e.target.value as "baileys" | "meta_cloud")}
                        className="h-10 w-full rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                  <option value="baileys">WhatsApp comum (QR) — em uso</option>
                  <option value="meta_cloud">API oficial da Meta (Cloud API) — suspensa</option>
                </select>
              </div>

              {canal === "baileys" ? (
                <>
                  <div className="flex gap-2 rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-soft">
                    <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Você vai vincular o número lendo um <b>QR code</b> com o celular dele, como no WhatsApp Web.
                      Deixe o aparelho em mãos: o código expira em segundos. Depois de cadastrar, a tela do QR abre
                      sozinha.
                    </span>
                  </div>
                  <div>
                    <Label>Número de WhatsApp deste chip</Label>
                    <Input value={numero} onChange={(e) => setNumero(e.target.value)}
                           placeholder="(11) 99999-9999" required inputMode="tel" />
                    <p className="mt-1.5 text-xs text-mist">
                      Com DDD. É o número que vai aparecer para o devedor — e é dele que você precisa ter o
                      celular em mãos para escanear o QR.
                    </p>
                  </div>
                  <MaturidadeField value={maturidade} onChange={setMaturidade} />
                </>
              ) : (
                <>
                  <div className="flex gap-2 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2.5 text-[11px] leading-relaxed text-rose">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <b>O canal oficial da Meta está suspenso desde 17/08/2026</b> — a conta de WhatsApp da
                      empresa foi banida em definitivo. Este caminho continua aqui para o dia em que houver uma
                      conta nova, e só funciona se você tiver credenciais válidas.
                    </span>
                  </div>
                  <div className="flex gap-2 rounded-lg border border-blue/30 bg-blue/10 px-3 py-2.5 text-[11px] leading-relaxed text-blue">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Antes: crie um app no <b>Meta Business</b> com o produto <b>WhatsApp</b>, adicione o número e
                      gere um <b>token permanente de usuário do sistema</b>. Cole abaixo o <b>ID do número</b>, o{" "}
                      <b>ID da WABA</b> e o <b>token</b> — mais o <b>App ID</b> e o <b>App Secret</b>, que deixam o
                      SAVAN configurar o webhook sozinho.
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
                    <Label>App ID</Label>
                    <Input value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)}
                           placeholder="1234567890123456" className="font-mono text-xs" />
                  </div>
                  <div>
                    <Label>App Secret</Label>
                    <Input type="password" value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)}
                           placeholder="chave secreta do app" className="font-mono text-xs" />
                    <p className="mt-1.5 text-xs text-mist">
                      Com <b className="text-chalk">App ID + App Secret</b> o SAVAN aponta o webhook do seu app para o
                      Chatwoot na hora — é o que faz as respostas dos contatos chegarem. Sem eles o número conecta
                      igual, mas você terá que colar a URL de callback no painel da Meta à mão.
                    </p>
                  </div>
                  <MaturidadeField value={maturidade} onChange={setMaturidade} />
                </>
              )}
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
                : canal === "baileys"
                  ? <>Cadastrar e ler o QR <QrCode className="h-4 w-4" /></>
                  : <>Conectar número oficial <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </Card>
      </form>
    );
  }

  const m = metaResultado!;
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
          <div className="flex items-center gap-2">
            {m.webhook.ok ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <AlertTriangle className="h-4 w-4 text-amber" />}
            <span className="text-mist">Webhook {m.webhook.ok ? "configurado no app da Meta" : "pendente (configure abaixo)"}</span>
          </div>
          {!m.chatwoot.ok && m.chatwoot.mensagem && <p className="text-rose">{m.chatwoot.mensagem}</p>}
        </div>
        <Button onClick={voltarParaLista}>Voltar para chips</Button>
      </Card>

      {/* Webhook do app da Meta: o SAVAN configura sozinho quando tem App ID + App Secret.
          Se não deu, o passo manual continua disponível como plano B. */}
      {m.webhook.ok ? (
        <Card className="flex gap-2.5 border-emerald/30 bg-emerald/5 py-4">
          <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
          <div className="text-xs leading-relaxed text-mist">
            <b className="text-emerald">Webhook configurado automaticamente.</b> Apontamos o app da Meta para o
            Chatwoot e a Meta validou a URL — as respostas dos contatos já chegam. Nada a fazer no painel da Meta.
          </div>
        </Card>
      ) : m.callback_url ? (
        <Card className="flex flex-col gap-2.5 border-amber/30 py-4">
          <div className="flex items-center gap-2 text-sm text-chalk">
            <Webhook className="h-4 w-4 text-amber" /> Falta configurar o webhook no app da Meta
          </div>
          {m.webhook.mensagem && <p className="text-xs text-amber">{m.webhook.mensagem}</p>}
          <p className="text-xs text-mist">
            Você pode informar o <b className="text-chalk">App ID</b> e o <b className="text-chalk">App Secret</b> na
            edição do chip e clicar em <b className="text-chalk">Configurar webhook</b> — ou fazer à mão: no painel da
            Meta (seu app → WhatsApp → Configuração), cole a <b className="text-chalk">URL de callback</b> e o{" "}
            <b className="text-chalk">token de verificação</b> abaixo. É o que faz as respostas dos contatos chegarem.
          </p>
          <CampoCopiavel rotulo="URL de callback" valor={m.callback_url} onCopiar={copiar} />
          {m.verify_token && <CampoCopiavel rotulo="Token de verificação" valor={m.verify_token} onCopiar={copiar} />}
        </Card>
      ) : null}

      {/* Lembrete do regime: template aprovado para o 1º contato frio */}
      <Card className="flex gap-2.5 border-amber/30 bg-amber/5 py-4">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <div className="text-xs leading-relaxed text-mist">
          <b className="text-amber">Para disparar a campanha por este número</b>, a 1ª mensagem a um contato novo
          precisa ser um <b className="text-chalk">modelo (template) aprovado pela Meta</b>. Crie e acompanhe a
          aprovação em <a href="/ajustes?aba=integracoes" className="text-emerald-soft underline">Ajustes → Integrações</a>. A qualidade
          do número cai se as pessoas bloquearem/denunciarem — acompanhe o semáforo no card do chip.
        </div>
      </Card>
    </div>
  );
}
