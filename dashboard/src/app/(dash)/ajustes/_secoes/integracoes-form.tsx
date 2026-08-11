"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Badge, Switch } from "@/components/ui/primitives";
import { Save, CheckCircle2, KeyRound, CreditCard, Eye, EyeOff } from "lucide-react";

type Segredo = { chave: string; descricao?: string; preenchido: boolean; valor: string };

// Campo de chave: vem pré-preenchido com o valor já salvo, mascarado por padrão;
// o olho revela e o "Salvar" só ativa quando o valor muda.
function CampoSegredo({ s, onSalvar, pending }: {
  s: Segredo; onSalvar: (chave: string, valor: string) => void; pending: boolean;
}) {
  const [valor, setValor] = useState(s.valor ?? "");
  const [ver, setVer] = useState(false);
  useEffect(() => { setValor(s.valor ?? ""); }, [s.valor]);
  const mudou = valor !== (s.valor ?? "");
  return (
    <div className="rounded-xl border border-line bg-ink-850 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-chalk">{s.chave}</div>
          <div className="text-[11px] text-mist">{s.descricao}</div>
        </div>
        <Badge tone={s.preenchido ? "green" : "neutral"}>{s.preenchido ? "Configurado" : "Vazio"}</Badge>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input type={ver ? "text" : "password"} placeholder="Cole o valor…" value={valor}
                 onChange={(e) => setValor(e.target.value)} className="pr-10 font-mono text-xs" />
          <button type="button" onClick={() => setVer((v) => !v)} tabIndex={-1}
                  aria-label={ver ? "Ocultar" : "Mostrar"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-mist hover:text-chalk">
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button size="sm" onClick={() => onSalvar(s.chave, valor)} disabled={pending || !mudou}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

/**
 * Aba "Integrações" — Asaas (Pix/split) e as chaves de API. Era metade da antiga tela de
 * Configurações; a outra metade (usuários) virou a aba Equipe, e o card do robô foi para Robô.
 */
export function IntegracoesForm({ role, asaas }: { role: string; asaas: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [okMsg, setOkMsg] = useState("");
  const ehAdmin = role === "admin";

  const [amb, setAmb] = useState<string>(asaas.ambiente ?? "sandbox");
  const [wallet, setWallet] = useState<string>(asaas.wallet_savan ?? "");
  const [comissao, setComissao] = useState<number>(asaas.comissao_pct ?? 10);
  const [segredos, setSegredos] = useState<Segredo[]>([]);

  useEffect(() => {
    fetch("/api/segredos").then((r) => r.json()).then((d) => setSegredos(d.segredos ?? []));
  }, []);

  function flash(m: string) { setOkMsg(m); setTimeout(() => setOkMsg(""), 2500); }

  function salvarAsaas() {
    start(async () => {
      await fetch("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [
          { chave: "asaas", valor: { ambiente: amb, wallet_savan: wallet, comissao_pct: comissao } },
        ] }),
      });
      flash("Configurações salvas"); router.refresh();
    });
  }

  function salvarSegredo(chave: string, valor: string) {
    start(async () => {
      await fetch("/api/segredos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, valor }),
      });
      const d = await (await fetch("/api/segredos")).json();
      setSegredos(d.segredos ?? []);
      flash("Chave atualizada");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {okMsg && (
        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-2.5 text-sm text-emerald-soft">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />{okMsg}
        </div>
      )}

      {/* Asaas: default global da plataforma — só admin (cada carteira pode sobrescrever) */}
      {ehAdmin && (
        <Card className="flex flex-col gap-5">
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <CreditCard className="h-4 w-4 text-emerald" /> Asaas (Pix e split) — padrão global
          </h3>
          <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3">
            <div>
              <div className="font-medium text-chalk">Ambiente de produção</div>
              <div className="text-xs text-mist">Desligado = sandbox (testes). Ligue só no go-live.</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={amb === "producao" ? "green" : "amber"}>{amb === "producao" ? "Produção" : "Sandbox"}</Badge>
              <Switch checked={amb === "producao"} onChange={(v) => setAmb(v ? "producao" : "sandbox")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Wallet ID do credor (recebe 90%)</Label>
              <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="walletId do Asaas do credor" className="font-mono text-xs" />
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input type="number" value={comissao} onChange={(e) => setComissao(Number(e.target.value))} />
            </div>
          </div>
          <Button size="sm" className="self-start" onClick={salvarAsaas} disabled={pending}>
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </Card>
      )}

      {/* Segredos: admin = chaves globais/infra; cobrador = as chaves dele */}
      <Card className="flex flex-col gap-4">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <KeyRound className="h-4 w-4 text-amber" /> {ehAdmin ? "Chaves de integração (globais)" : "Suas chaves de integração"}
        </h3>
        <p className="text-xs text-mist">
          {ehAdmin
            ? "Chaves de infra da plataforma. Cada cobrador pode ter as suas; quando vazias, caem nestas."
            : "Suas chaves (OpenAI, Asaas). Se deixar vazio, o sistema usa as chaves globais da plataforma."}
          {" "}As já salvas vêm mascaradas — clique no olho para revelar.
        </p>
        {segredos.map((s) => (
          <CampoSegredo key={s.chave} s={s} onSalvar={salvarSegredo} pending={pending} />
        ))}
      </Card>
    </div>
  );
}
