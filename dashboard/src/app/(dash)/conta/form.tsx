"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { Save, CheckCircle2, KeyRound, User, Mail } from "lucide-react";

export function ContaForm({ email, nome, role }: { email: string; nome: string; role: string }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [pending, start] = useTransition();

  const [nomeNovo, setNomeNovo] = useState(nome);
  const [msgNome, setMsgNome] = useState("");

  const [emailNovo, setEmailNovo] = useState(email);
  const [msgEmail, setMsgEmail] = useState("");
  const [erroEmail, setErroEmail] = useState("");

  const [senha1, setSenha1] = useState("");
  const [senha2, setSenha2] = useState("");
  const [msgSenha, setMsgSenha] = useState("");
  const [erroSenha, setErroSenha] = useState("");

  function salvarNome() {
    start(async () => {
      const r = await fetch("/api/conta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeNovo }),
      });
      if (r.ok) { setMsgNome("Nome atualizado"); setTimeout(() => setMsgNome(""), 2500); router.refresh(); }
    });
  }

  function salvarEmail() {
    setErroEmail(""); setMsgEmail("");
    start(async () => {
      const r = await fetch("/api/conta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailNovo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroEmail(d.erro ?? "Não foi possível alterar o e-mail."); return; }
      setMsgEmail("E-mail alterado — use o novo no próximo login");
      setTimeout(() => setMsgEmail(""), 4000);
      router.refresh();
    });
  }

  function trocarSenha() {
    setErroSenha(""); setMsgSenha("");
    if (senha1.length < 8) { setErroSenha("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (senha1 !== senha2) { setErroSenha("As senhas não coincidem."); return; }
    start(async () => {
      const { error } = await sb.auth.updateUser({ password: senha1 });
      if (error) { setErroSenha("Não foi possível alterar. Tente sair e entrar de novo."); return; }
      setSenha1(""); setSenha2(""); setMsgSenha("Senha alterada com sucesso");
      setTimeout(() => setMsgSenha(""), 3000);
    });
  }

  return (
    <div className="grid max-w-3xl gap-4">
      {/* Identidade */}
      <Card className="flex flex-col gap-5">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <User className="h-4 w-4 text-emerald" /> Seus dados
        </h3>
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3">
          <span className="text-xs text-mist">Acesso atual</span>
          <Badge tone="violet" className="capitalize">{role}</Badge>
        </div>
        <div>
          <Label>Nome de exibição</Label>
          <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={salvarNome} disabled={pending}>
            {msgNome ? <><CheckCircle2 className="h-4 w-4" /> {msgNome}</> : <><Save className="h-4 w-4" /> Salvar nome</>}
          </Button>
        </div>

        <div className="border-t border-line/60 pt-5">
          <Label><Mail className="mr-1 inline h-3.5 w-3.5" /> E-mail de acesso (login)</Label>
          <Input type="email" value={emailNovo} onChange={(e) => setEmailNovo(e.target.value)}
                 autoComplete="email" placeholder="voce@empresa.com" />
          {erroEmail && <p className="mt-2 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erroEmail}</p>}
          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" onClick={salvarEmail} disabled={pending || !emailNovo || emailNovo === email}>
              {msgEmail ? <><CheckCircle2 className="h-4 w-4" /> {msgEmail}</> : <><Save className="h-4 w-4" /> Salvar e-mail</>}
            </Button>
          </div>
          <p className="mt-2 text-xs text-mist">A troca vale na hora. Use o novo e-mail no próximo login.</p>
        </div>
      </Card>

      {/* Senha */}
      <Card className="flex flex-col gap-5">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <KeyRound className="h-4 w-4 text-amber" /> Trocar senha
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nova senha</Label>
            <Input type="password" value={senha1} onChange={(e) => setSenha1(e.target.value)}
                   placeholder="mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)}
                   placeholder="repita a senha" autoComplete="new-password" />
          </div>
        </div>
        {erroSenha && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erroSenha}</p>}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={trocarSenha} disabled={pending || !senha1}>
            {msgSenha ? <><CheckCircle2 className="h-4 w-4" /> {msgSenha}</> : <><KeyRound className="h-4 w-4" /> Alterar senha</>}
          </Button>
        </div>
      </Card>
    </div>
  );
}
