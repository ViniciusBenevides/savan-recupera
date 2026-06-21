"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Badge, Switch } from "@/components/ui/primitives";
import { Save, CheckCircle2, KeyRound, Users, CreditCard, Bot, UserPlus, Eye, EyeOff } from "lucide-react";

type Segredo = { chave: string; descricao?: string; preenchido: boolean; valor: string };

// Campo de chave: vem pré-preenchido com o valor já salvo, mascarado por padrão;
// o olho revela e o "Salvar" só ativa quando o valor muda.
function CampoSegredo({ s, onSalvar, pending }: {
  s: Segredo; onSalvar: (chave: string, valor: string) => void; pending: boolean;
}) {
  const [valor, setValor] = useState(s.valor ?? "");
  const [ver, setVer] = useState(false);
  // re-sincroniza quando a lista é recarregada após salvar
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

export function ConfigForm({ ehAdmin, asaas, ia, usuarios }: {
  ehAdmin: boolean; asaas: any; ia: any; usuarios: any[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [okMsg, setOkMsg] = useState("");

  const [amb, setAmb] = useState<string>(asaas.ambiente ?? "sandbox");
  const [wallet, setWallet] = useState<string>(asaas.wallet_savan ?? "");
  const [comissao, setComissao] = useState<number>(asaas.comissao_pct ?? 10);
  const [nomeBot, setNomeBot] = useState<string>(ia.nome_bot ?? "Ana");
  const [modelo, setModelo] = useState<string>(ia.modelo ?? "gpt-4.1-mini");

  const [segredos, setSegredos] = useState<Segredo[]>([]);

  // criar usuário
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", role: "operador" });
  const [erroNovo, setErroNovo] = useState("");

  useEffect(() => {
    if (!ehAdmin) return;
    fetch("/api/segredos").then((r) => r.json()).then((d) => setSegredos(d.segredos ?? []));
  }, [ehAdmin]);

  function flash(m: string) { setOkMsg(m); setTimeout(() => setOkMsg(""), 2500); }

  function salvarAsaas() {
    start(async () => {
      await fetch("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [
          { chave: "asaas", valor: { ambiente: amb, wallet_savan: wallet, comissao_pct: comissao } },
          { chave: "ia", valor: { ...ia, nome_bot: nomeBot, modelo } },
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

  function mudarRole(id: string, role: string) {
    start(async () => {
      const r = await fetch("/api/usuarios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.erro ?? "Não foi possível alterar."); }
      router.refresh();
    });
  }

  function criarUsuario() {
    setErroNovo("");
    start(async () => {
      const r = await fetch("/api/usuarios/criar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroNovo(d.erro ?? "Não foi possível criar o usuário."); return; }
      setNovo({ nome: "", email: "", senha: "", role: "operador" });
      flash("Usuário criado");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {okMsg && (
        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-2.5 text-sm text-emerald-soft">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />{okMsg}
        </div>
      )}

      {/* Asaas */}
      <Card className="flex flex-col gap-5">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <CreditCard className="h-4 w-4 text-emerald" /> Asaas (Pix e split)
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
            <Label>Sua comissão (%)</Label>
            <Input type="number" value={comissao} onChange={(e) => setComissao(Number(e.target.value))} />
          </div>
        </div>
        <Button size="sm" className="self-start" onClick={salvarAsaas} disabled={pending}>
          <Save className="h-4 w-4" /> Salvar
        </Button>
      </Card>

      {/* Bot */}
      <Card className="flex flex-col gap-5">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <Bot className="h-4 w-4 text-violet" /> Bot negociador
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nome do bot</Label>
            <Input value={nomeBot} onChange={(e) => setNomeBot(e.target.value)} />
          </div>
          <div>
            <Label>Modelo de IA</Label>
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <Button size="sm" className="self-start" onClick={salvarAsaas} disabled={pending}>
          <Save className="h-4 w-4" /> Salvar
        </Button>
      </Card>

      {/* Segredos (admin) */}
      {ehAdmin && (
        <Card className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <KeyRound className="h-4 w-4 text-amber" /> Chaves de integração
          </h3>
          <p className="text-xs text-mist">As chaves já salvas vêm preenchidas e mascaradas — clique no olho para revelar. Cada conta tem a sua própria configuração.</p>
          {segredos.map((s) => (
            <CampoSegredo key={s.chave} s={s} onSalvar={salvarSegredo} pending={pending} />
          ))}
        </Card>
      )}

      {/* Usuários (admin) */}
      {ehAdmin && (
        <Card className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <Users className="h-4 w-4 text-emerald" /> Usuários
          </h3>

          {/* criar novo */}
          <div className="rounded-xl border border-emerald/25 bg-emerald/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-chalk">
              <UserPlus className="h-4 w-4 text-emerald" /> Criar novo usuário
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              <Input type="email" placeholder="E-mail" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
              <Input type="text" placeholder="Senha (mín. 8)" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
              <select value={novo.role} onChange={(e) => setNovo({ ...novo, role: e.target.value })}
                      className="h-10 rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                <option value="admin">Admin</option>
                <option value="operador">Operador</option>
                <option value="visualizador">Visualizador</option>
              </select>
            </div>
            {erroNovo && <p className="mt-3 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erroNovo}</p>}
            <Button size="sm" className="mt-3" onClick={criarUsuario}
                    disabled={pending || !novo.email || !novo.senha}>
              <UserPlus className="h-4 w-4" /> Criar usuário
            </Button>
          </div>

          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3">
              <div>
                <div className="font-medium text-chalk">{u.nome}</div>
                <div className="text-xs text-mist">{u.email}</div>
              </div>
              <select value={u.role} onChange={(e) => mudarRole(u.id, e.target.value)}
                      className="rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-sm text-chalk outline-none">
                <option value="admin">Admin</option>
                <option value="operador">Operador</option>
                <option value="visualizador">Visualizador</option>
              </select>
            </div>
          ))}
          <p className="text-xs text-mist">Crie o acesso aqui e passe o e-mail e a senha para a pessoa. Ela pode trocar a senha depois em "Minha conta".</p>
        </Card>
      )}
    </div>
  );
}
