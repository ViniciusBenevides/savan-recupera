"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Badge, Switch, HelpHint } from "@/components/ui/primitives";
import { FlaskConical, Send, CheckCircle2, Loader2, AlertTriangle, Save } from "lucide-react";

type Chip = { id: number; nome: string; status: string; papel?: string | null };

// Card do "Número de teste" + botão "Enviar teste".
// O número de teste recebe a 1ª mensagem do bot quando você dispara um teste; aí você
// responde do seu WhatsApp e o bot negocia em MODO TESTE (Pix sandbox/fake, sem mover dinheiro).
export function TesteCard({ numeroInicial, ativoInicial, chips }: {
  numeroInicial: string; ativoInicial: boolean; chips: Chip[];
}) {
  const router = useRouter();
  const [numero, setNumero] = React.useState(numeroInicial ?? "");
  const [ativo, setAtivo] = React.useState(ativoInicial ?? false);
  const [salvando, setSalvando] = React.useState(false);
  const [okMsg, setOkMsg] = React.useState("");
  const [erro, setErro] = React.useState("");

  // chips do BOT que estão conectados (pode disparar a partir deles)
  const disponiveis = chips.filter((c) => (c.papel ?? "bot") === "bot" && ["conectado", "aquecendo", "ativo"].includes(c.status));
  const [chipId, setChipId] = React.useState<number | "">(disponiveis[0]?.id ?? "");
  const [enviando, setEnviando] = React.useState(false);
  const [resultado, setResultado] = React.useState<string>("");

  const mudouNumero = numero !== (numeroInicial ?? "") || ativo !== (ativoInicial ?? false);

  async function salvarNumero() {
    setSalvando(true); setErro(""); setOkMsg("");
    const r = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave: "numero_teste", valor: { e164: numero.trim(), ativo } }),
    });
    setSalvando(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d.erro ?? "Falha ao salvar."); return; }
    setOkMsg("Número de teste salvo"); setTimeout(() => setOkMsg(""), 2500); router.refresh();
  }

  async function enviarTeste() {
    if (!chipId) return;
    setEnviando(true); setErro(""); setResultado("");
    const r = await fetch("/api/chips/teste", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chip_id: chipId }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || !d.ok) { setErro(d.erro ?? "Falha ao disparar o teste."); return; }
    setResultado(`Mensagem de teste enviada para ${d.numero_teste}. Responda no seu WhatsApp para conversar com o bot (modo teste).`);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4 border-amber/25">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <FlaskConical className="h-4 w-4 text-amber" /> Número de teste
          <HelpHint text="O número que recebe a 1ª mensagem quando você dispara um teste. Você responde do seu WhatsApp e o bot negocia em modo teste — Pix sandbox/fake, sem mover dinheiro real." />
        </h3>
        <Badge tone={ativo ? "amber" : "neutral"}>{ativo ? "Ativo" : "Desligado"}</Badge>
      </div>

      <p className="text-xs text-mist">
        Para testar o bot ponta a ponta sem incomodar ninguém: coloque <b className="text-chalk">seu</b> WhatsApp aqui,
        ligue o modo teste e clique em <b className="text-chalk">Enviar teste</b>. O bot te manda a abordagem; você responde
        como se fosse o devedor.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label>Seu WhatsApp (formato +55 DDD número)</Label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+5511999998888" className="font-mono text-xs" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-850 px-3 py-2.5">
            <span className="text-xs text-mist">Ligado</span>
            <Switch checked={ativo} onChange={setAtivo} />
          </div>
          <Button size="sm" onClick={salvarNumero} disabled={salvando || !mudouNumero}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        {disponiveis.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-mist">
            <AlertTriangle className="h-3.5 w-3.5" /> Conecte um chip do bot (QR) para poder disparar o teste.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Disparar a partir do chip</Label>
              <select value={chipId} onChange={(e) => setChipId(Number(e.target.value))}
                      className="h-10 rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={enviarTeste} disabled={enviando || !numero.trim() || !chipId}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar teste
            </Button>
          </div>
        )}
      </div>

      {okMsg && <p className="flex items-center gap-1.5 text-xs text-emerald"><CheckCircle2 className="h-3.5 w-3.5" /> {okMsg}</p>}
      {resultado && <p className="flex items-center gap-1.5 rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 text-xs text-emerald-soft"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {resultado}</p>}
      {erro && <p className="flex items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {erro}</p>}
    </Card>
  );
}
