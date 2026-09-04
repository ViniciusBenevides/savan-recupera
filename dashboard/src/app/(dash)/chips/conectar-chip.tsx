"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { Loader2, CheckCircle2, AlertTriangle, RotateCw, QrCode, Smartphone, X } from "lucide-react";

// O QR da Evolution roda sozinho a cada poucas dezenas de segundos. Pedimos um novo um pouco antes
// disso: um QR morto na tela é indistinguível de um QR vivo, e a pessoa fica apontando o celular
// para um código que já não vale.
//
// No canal nativo do Chatwoot é ao contrário: o baileys-api empurra o QR novo sozinho e o polling
// já traz. Lá o servidor responde `auto_renova_qr` e este relógio some da tela — pedir outro
// recriaria o socket e mataria o pareamento em andamento.
const VIDA_QR_S = 38;
// De quanto em quanto tempo perguntamos ao servidor se o número já entrou.
const PASSO_ESTADO_S = 3;

type Fase = "carregando" | "aguardando" | "conectado" | "banido" | "erro";

/**
 * Tela de conexão de um chip Baileys: pede a instância na Evolution, mostra o QR e fica olhando o
 * estado até o número entrar.
 *
 * Vive fora do cadastro de propósito — o mesmo componente serve para o chip novo e para religar um
 * número que caiu, que é a operação frequente aqui (números virtuais caem; ver ADR-0004).
 */
export function ConectarChip({ chipId, nome, onConectado, onFechar }: {
  chipId: number;
  nome: string;
  onConectado?: () => void;
  onFechar?: () => void;
}) {
  const [fase, setFase] = useState<Fase>("carregando");
  const [qr, setQr] = useState<string | null>(null);
  const [pareamento, setPareamento] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [avisoChatwoot, setAvisoChatwoot] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState<number | null>(null);
  const [autoRenovaQr, setAutoRenovaQr] = useState(false);
  const [, redesenhar] = useState(0);

  const vivo = useRef(true);
  const idadeQr = useRef(0);
  // Guardamos o callback num ref para que `verEstado` não mude de identidade a cada render. Ele é
  // dependência do intervalo: se mudasse, o intervalo seria destruído e recriado a cada segundo —
  // e o relógio do QR nunca chegaria ao fim.
  const aoConectar = useRef(onConectado);
  aoConectar.current = onConectado;

  const pedirQr = useCallback(async () => {
    setFase("carregando"); setErro("");
    try {
      const r = await fetch(`/api/chips/${chipId}/conectar`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!vivo.current) return;
      if (!r.ok) { setErro(d.erro ?? "O provedor do WhatsApp não respondeu."); setFase("erro"); return; }
      idadeQr.current = 0;
      setQr(d.qr ?? null);
      setPareamento(d.pairing_code ?? null);
      setAutoRenovaQr(!!d.auto_renova_qr);
      setInboxId(d.inbox_id ?? null);
      setAvisoChatwoot(d.chatwoot?.ok === false ? (d.chatwoot?.mensagem ?? "Chatwoot não vinculado.") : null);
      setFase("aguardando");
    } catch {
      if (vivo.current) { setErro("Não consegui falar com o painel."); setFase("erro"); }
    }
  }, [chipId]);

  const verEstado = useCallback(async () => {
    try {
      const r = await fetch(`/api/chips/${chipId}/conectar`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!vivo.current || !r.ok) return;
      if (d.inbox_id) setInboxId(d.inbox_id);
      // No canal nativo o QR chega por aqui: o baileys-api empurra cada código novo para o
      // Chatwoot e é o polling que os vê. Sem esta linha a tela abriria sem QR nenhum.
      if (d.qr) { setQr(d.qr); idadeQr.current = 0; }
      if (d.status === "conectado" || d.estado === "open") { setFase("conectado"); aoConectar.current?.(); }
      else if (d.status === "banido") setFase("banido");
    } catch {
      // Oscilação de rede durante o pareamento é comum e não é notícia: a próxima volta resolve.
    }
  }, [chipId]);

  useEffect(() => {
    vivo.current = true;
    pedirQr();
    return () => { vivo.current = false; };
  }, [pedirQr]);

  useEffect(() => {
    if (fase !== "aguardando") return;
    const t = setInterval(() => {
      idadeQr.current += 1;
      redesenhar((n) => n + 1);
      if (idadeQr.current % PASSO_ESTADO_S === 0) verEstado();
      if (!autoRenovaQr && idadeQr.current >= VIDA_QR_S) pedirQr();
    }, 1000);
    return () => clearInterval(t);
  }, [fase, autoRenovaQr, pedirQr, verEstado]);

  const restante = Math.max(0, VIDA_QR_S - idadeQr.current);

  if (fase === "conectado") {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald/15 text-emerald glow-ring">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <div>
          <h3 className="font-display text-lg font-700 text-chalk">{nome} conectado!</h3>
          <p className="mt-1 text-sm text-mist">O número entrou. Ative o chip para ele começar a trabalhar.</p>
        </div>
        {inboxId ? (
          <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Chatwoot vinculado (inbox {inboxId})</Badge>
        ) : (
          <div className="flex gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-left text-xs text-amber">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Conectou, mas o <b>inbox do Chatwoot ainda não apareceu</b>. Sem ele o chip não dispara e o
              bot não recebe resposta. Abra esta tela de novo em alguns segundos — o vínculo se resolve sozinho.
            </span>
          </div>
        )}
        {onFechar && <Button onClick={onFechar}>Voltar</Button>}
      </Card>
    );
  }

  if (fase === "banido") {
    return (
      <Card className="flex flex-col items-center gap-4 border-rose/30 py-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-rose/15 text-rose">
          <AlertTriangle className="h-8 w-8" />
        </span>
        <div>
          <h3 className="font-display text-lg font-700 text-chalk">Sessão recusada pelo WhatsApp</h3>
          <p className="mt-1 max-w-sm text-sm text-mist">
            O WhatsApp devolveu <b className="text-chalk">401</b> para este número. Reconectar não resolve:
            o chip está banido. Siga com outro número — a operação é feita para isso (ADR-0004).
          </p>
        </div>
        {onFechar && <Button variant="outline" onClick={onFechar}>Fechar</Button>}
      </Card>
    );
  }

  if (fase === "erro") {
    return (
      <Card className="flex flex-col items-center gap-4 border-rose/30 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-rose" />
        <p className="max-w-sm text-sm text-rose">{erro}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={pedirQr}><RotateCw className="h-4 w-4" /> Tentar de novo</Button>
          {onFechar && <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-emerald" />
          <h3 className="font-display font-600 text-chalk">Conectar {nome}</h3>
        </div>
        {onFechar && (
          <button onClick={onFechar} aria-label="Fechar" className="text-mist hover:text-chalk">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid place-items-center rounded-xl border border-line bg-white p-3">
        {fase === "carregando" ? (
          <div className="flex h-56 w-56 items-center justify-center text-ink-900">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code para conectar o número" className="h-56 w-56" />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center px-4 text-center text-xs text-ink-900">
            {autoRenovaQr
              ? "O código ainda não chegou do provedor. Ele aparece aqui em alguns segundos."
              : pareamento
                ? "O provedor não devolveu a imagem do QR. Use o código de pareamento abaixo."
                : "O provedor não devolveu a imagem do QR. Gere um novo código."}
          </div>
        )}
      </div>

      {fase === "aguardando" && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-mist">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Esperando você escanear…
            </span>
            <span className="font-mono tabnums">
              {autoRenovaQr ? "o código se renova sozinho" : `novo código em ${restante}s`}
            </span>
          </div>
          {!autoRenovaQr && (
            <div className="h-1 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-emerald transition-[width] duration-1000 ease-linear"
                   style={{ width: `${(restante / VIDA_QR_S) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      <ol className="space-y-1 rounded-xl border border-line bg-ink-850 px-3 py-3 text-xs leading-relaxed text-mist">
        <li>1. Abra o WhatsApp <b className="text-chalk">no celular deste número</b>.</li>
        <li>2. Menu <b className="text-chalk">→ Aparelhos conectados → Conectar um aparelho</b>.</li>
        <li>3. Aponte a câmera para o código acima.</li>
      </ol>

      {pareamento && (
        <div className="rounded-xl border border-line bg-ink-850 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-mist">
            <Smartphone className="h-3.5 w-3.5" /> Ou digite o código de pareamento
          </div>
          <p className="mt-1 font-mono text-lg font-600 tracking-widest text-chalk">{pareamento}</p>
        </div>
      )}

      {avisoChatwoot && (
        <div className="flex gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Chatwoot não vinculado: {avisoChatwoot} O número conecta igual, mas o bot só responde
            depois que o inbox existir.
          </span>
        </div>
      )}

      {/* No canal nativo isto não é "pegar o próximo código" — é recomeçar a conexão do zero, e
          joga fora o pareamento que estiver em andamento. Daí o rótulo diferente: o botão só serve
          para quando a tela travar sem QR nenhum. */}
      <Button variant="outline" size="sm" onClick={pedirQr} disabled={fase === "carregando"}>
        <RotateCw className="h-4 w-4" /> {autoRenovaQr ? "Recomeçar o pareamento" : "Gerar novo código"}
      </Button>
    </Card>
  );
}
