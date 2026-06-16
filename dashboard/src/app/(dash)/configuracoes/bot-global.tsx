"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Textarea, Switch, HelpHint, Tooltip } from "@/components/ui/primitives";
import { Bot, Save, CheckCircle2, Loader2 } from "lucide-react";

// Editor do PADRÃO GLOBAL do robô (persona/contexto/guardrails). Cada carteira pode
// sobrescrever isto na própria tela; aqui é o que vale quando ela não sobrescreve.
export function BotGlobal({ persona, contexto, guardrails }: { persona: string; contexto: string; guardrails: any }) {
  const router = useRouter();
  const g = guardrails ?? {};
  const [p, setP] = React.useState(persona ?? "");
  const [c, setC] = React.useState(contexto ?? "");
  const [nuncaCitar, setNuncaCitar] = React.useState((g.nunca_citar ?? []).join(", "));
  const [confirmarId, setConfirmarId] = React.useState(g.confirmar_identidade !== false);
  const [prescricao, setPrescricao] = React.useState(g.responder_prescricao_honestamente !== false);
  const [tom, setTom] = React.useState(g.tom ?? "");
  const [maxRodadas, setMaxRodadas] = React.useState(Number(g.max_rodadas_desconto ?? 1));
  const [regrasExtras, setRegrasExtras] = React.useState(g.regras_extras ?? "");
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);

  async function salvar() {
    setSalvando(true); setOk(false);
    const guardrailsNovo = {
      ...g,
      nunca_citar: String(nuncaCitar).split(",").map((s: string) => s.trim()).filter(Boolean),
      confirmar_identidade: confirmarId,
      responder_prescricao_honestamente: prescricao,
      tom,
      max_rodadas_desconto: Number(maxRodadas),
      regras_extras: regrasExtras,
    };
    await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: [
        { chave: "bot_persona", valor: p },
        { chave: "bot_contexto", valor: c },
        { chave: "bot_guardrails", valor: guardrailsNovo },
      ] }),
    });
    setSalvando(false); setOk(true); setTimeout(() => setOk(false), 2500); router.refresh();
  }

  return (
    <Card className="flex flex-col gap-5">
      <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
        <Bot className="h-4 w-4 text-violet" /> Comportamento do robô (padrão global)
        <HelpHint text="Define como o robô fala e suas regras. Cada carteira pode personalizar; o que não for personalizado usa este padrão." />
      </h3>

      <div>
        <Label className="flex items-center gap-1.5">Persona / objetivo <HelpHint text="Quem é o robô e o que ele quer. Use {{nome_bot}} e {{primeiro_nome}}." /></Label>
        <Textarea rows={3} value={p} onChange={(e) => setP(e.target.value)} />
      </div>
      <div>
        <Label className="flex items-center gap-1.5">Contexto do negócio <HelpHint text="Em nome de quem o robô fala e como enquadra a dívida." /></Label>
        <Textarea rows={2} value={c} onChange={(e) => setC(e.target.value)} />
      </div>
      <div>
        <Label className="flex items-center gap-1.5">Nunca citar <HelpHint text="Termos proibidos, separados por vírgula. Ex.: Serasa, SPC, processo judicial." /></Label>
        <Input value={nuncaCitar} onChange={(e) => setNuncaCitar(e.target.value)} placeholder="Serasa, SPC, negativação…" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-sm text-chalk">Confirmar identidade <HelpHint text="O robô confirma falar com a pessoa certa antes de revelar CPF/valor (LGPD)." /></span>
          <Switch checked={confirmarId} onChange={setConfirmarId} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-sm text-chalk">Honesto sobre prescrição <HelpHint text="Se perguntarem, o robô assume que a dívida pode estar prescrita e o pagamento é voluntário." /></span>
          <Switch checked={prescricao} onChange={setPrescricao} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="flex items-center gap-1.5">Tom <HelpHint text="Como o robô escreve." /></Label>
          <Input value={tom} onChange={(e) => setTom(e.target.value)} placeholder="humano, frases curtas, 1 emoji…" />
        </div>
        <div>
          <Label className="flex items-center gap-1.5">Rodadas de desconto extra <HelpHint text="Quantas vezes o robô pode dar a margem extra após recusa. Padrão: 1." /></Label>
          <Input type="number" value={maxRodadas} onChange={(e) => setMaxRodadas(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <Label className="flex items-center gap-1.5">Regras extras (opcional) <HelpHint text="Instruções adicionais para todas as carteiras sem prompt próprio." /></Label>
        <Textarea rows={2} value={regrasExtras} onChange={(e) => setRegrasExtras(e.target.value)} />
      </div>

      <Tooltip text="Salva o comportamento padrão do robô para todas as carteiras que não têm prompt próprio.">
        <Button size="sm" className="self-start" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {ok ? "Salvo!" : "Salvar comportamento"}
        </Button>
      </Tooltip>
    </Card>
  );
}
