"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Input, Label } from "@/components/ui/primitives";
import { Logo } from "@/components/Brand";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) { setErro("E-mail ou senha incorretos. Confira e tente de novo."); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen bg-papel lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      {/* A arte do login do MC COB V5: a Justiça em bronze, enquadrada nela; o lema fica sobre o preto do
          piso, longe do letreiro que já vem na arte */}
      <aside className="relative hidden overflow-hidden border-r border-pauta bg-black lg:block">
        <Image src="/marca/login-justica.png" alt="" fill priority sizes="55vw" className="object-cover object-[34%_30%]" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/85 to-transparent" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-end p-10">
          <p className="border-l-2 border-tinta pl-4 font-display text-[0.9375rem] font-500 uppercase leading-relaxed tracking-[0.16em] text-ouro">
            Disciplina em cada processo.<br />Resultado em cada negociação.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <form onSubmit={entrar} className="w-full max-w-[380px]">
          {/* A marca fica do lado do formulário: em cima da arte ela brigava com a Justiça */}
          <div className="mb-8"><Logo largura={168} /></div>
          <h1 className="font-display text-pagina font-600 text-ouro">Entrar no sistema</h1>
          <p className="mt-1 text-[0.9375rem] text-lapis">Use o e-mail e a senha que a MC CRED cadastrou para você.</p>

          <div className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@mccred.com.br" />
            </div>
            <div>
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input id="senha" type={ver ? "text" : "password"} autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} className="pr-11" />
                <button
                  type="button"
                  onClick={() => setVer((v) => !v)}
                  aria-label={ver ? "Esconder senha" : "Mostrar senha"}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-controle text-lapis hover:bg-ink-800 hover:text-texto"
                >
                  {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {erro && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">{erro}</p>}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={carregando}>
            {carregando ? "Entrando…" : "Entrar no sistema"}
          </Button>
          <p className="mt-4 text-sm2 text-lapis">Esqueceu a senha? Peça ao dono da operação para redefinir em Configurações → Equipe.</p>
        </form>
      </main>
    </div>
  );
}
