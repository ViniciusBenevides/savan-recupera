"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Input, Label } from "@/components/ui/primitives";
import { Logo } from "@/components/Brand";
import { brl } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setLoading(true);
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) { setErro("E-mail ou senha incorretos."); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="grain relative grid min-h-screen lg:grid-cols-2">
      {/* lado esquerdo — pitch */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <Logo size={32} />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-4xl font-700 leading-[1.1] tracking-tight text-chalk">
            Transforme carteira parada em <span className="text-emerald">caixa recuperado</span>.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-mist">
            Recuperação extrajudicial automatizada por WhatsApp, com negociação
            inteligente, Pix instantâneo e repasse automático. Tudo em um painel.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            <div className="card-surface p-4">
              <div className="font-mono text-2xl font-600 text-chalk tabnums">50.000</div>
              <div className="mt-1 text-xs text-mist">devedores na base</div>
            </div>
            <div className="card-surface p-4">
              <div className="font-mono text-2xl font-600 text-emerald tabnums">{brl(10000000)}</div>
              <div className="mt-1 text-xs text-mist">em estoque a recuperar</div>
            </div>
          </div>
        </div>
        <p className="relative z-10 text-xs text-mist/70">Recuperação extrajudicial de crédito por WhatsApp</p>
      </div>

      {/* lado direito — form */}
      <div className="relative flex items-center justify-center p-6">
        <form onSubmit={entrar} className="card-surface w-full max-w-sm p-8">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h2 className="font-display text-xl font-700 text-chalk">Entrar</h2>
          <p className="mt-1 mb-6 text-sm text-mist">Acesse o painel de recuperação.</p>

          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="voce@empresa.com" autoComplete="email" required />

          <div className="mt-4">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                   placeholder="••••••••" autoComplete="current-password" required />
          </div>

          {erro && <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar no painel"}
          </Button>
        </form>
      </div>
    </div>
  );
}
