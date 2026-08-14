"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { CheckCircle2, Users, UserPlus } from "lucide-react";

type Usuario = { id: string; nome: string; email: string; role: string; cobrador_id: string | null };
type Carteira = { id: number; nome: string };
type Cobrador = { id: string; nome: string; email: string };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", cobrador: "Cobrador", credor: "Credor", visualizador: "Visualizador",
};

/**
 * Aba "Equipe" — quem entra no painel e com que papel. Era um card no fim da antiga tela de
 * Configurações, misturado com chaves de API; separar deixou as duas coisas legíveis.
 */
export function EquipeForm({ role, usuarios, carteiras, cobradores, meuId }: {
  role: string; usuarios: Usuario[]; carteiras: Carteira[]; cobradores: Cobrador[]; meuId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [okMsg, setOkMsg] = useState("");
  const ehAdmin = role === "admin";

  // papéis que o ator pode atribuir (ninguém cria admin)
  const opcoesPapel = ehAdmin ? ["cobrador", "credor", "visualizador"] : ["credor", "visualizador"];
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", role: opcoesPapel[0], cobrador_id: "" });
  const [carteirasLigadas, setCarteirasLigadas] = useState<number[]>([]);
  const [erroNovo, setErroNovo] = useState("");

  function flash(m: string) { setOkMsg(m); setTimeout(() => setOkMsg(""), 2500); }

  function mudarRole(id: string, novoRole: string) {
    start(async () => {
      const r = await fetch("/api/usuarios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: novoRole }),
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
        body: JSON.stringify({ ...novo, carteira_ids: novo.role === "credor" ? carteirasLigadas : [] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroNovo(d.erro ?? "Não foi possível criar o usuário."); return; }
      setNovo({ nome: "", email: "", senha: "", role: opcoesPapel[0], cobrador_id: "" });
      setCarteirasLigadas([]);
      flash("Usuário criado");
      router.refresh();
    });
  }

  function toggleCarteira(id: number) {
    setCarteirasLigadas((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  return (
    <div className="flex flex-col gap-4">
      {okMsg && (
        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-2.5 text-sm text-emerald-soft">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />{okMsg}
        </div>
      )}

      <Card className="flex flex-col gap-4">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <Users className="h-4 w-4 text-emerald" /> {ehAdmin ? "Usuários" : "Sua equipe (credores e visualizadores)"}
        </h3>

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
              {opcoesPapel.map((p) => <option key={p} value={p}>{ROLE_LABEL[p]}</option>)}
            </select>
          </div>

          {/* admin designa o cobrador (tenant) de um credor/visualizador */}
          {ehAdmin && (novo.role === "credor" || novo.role === "visualizador") && (
            <div className="mt-3">
              <Label>Cobrador responsável (tenant)</Label>
              <select value={novo.cobrador_id} onChange={(e) => setNovo({ ...novo, cobrador_id: e.target.value })}
                      className="h-10 w-full rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                <option value="">Conta principal (admin)</option>
                {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.email})</option>)}
              </select>
              <p className="mt-1 text-[11px] text-mist">O visualizador vê todos os dados operacionais desta conta, sem poder alterá-los.</p>
            </div>
          )}

          {/* credor: liga às carteiras que ele será dono */}
          {novo.role === "credor" && (
            <div className="mt-3">
              <Label>Carteiras deste credor</Label>
              {carteiras.length === 0
                ? <p className="text-[11px] text-mist">Nenhuma carteira disponível para ligar.</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {carteiras.map((c) => (
                      <button type="button" key={c.id} onClick={() => toggleCarteira(c.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                          carteirasLigadas.includes(c.id)
                            ? "border-emerald/50 bg-emerald/15 text-emerald-soft"
                            : "border-line bg-ink-850 text-mist hover:text-chalk"}`}>
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}

          {erroNovo && <p className="mt-3 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erroNovo}</p>}
          <Button size="sm" className="mt-3" onClick={criarUsuario}
                  disabled={pending || !novo.email || !novo.senha}>
            <UserPlus className="h-4 w-4" /> Criar usuário
          </Button>
        </div>

        {usuarios.map((u) => {
          const ehEu = u.id === meuId;
          const ehAdminAlvo = u.role === "admin";
          const trava = ehEu || ehAdminAlvo;
          return (
            <div key={u.id} className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-4 py-3">
              <div>
                <div className="font-medium text-chalk">{u.nome} {ehEu && <span className="text-[11px] text-mist">(você)</span>}</div>
                <div className="text-xs text-mist">{u.email}</div>
              </div>
              {trava ? (
                <Badge tone={ehAdminAlvo ? "violet" : "neutral"}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
              ) : (
                <select value={u.role} onChange={(e) => mudarRole(u.id, e.target.value)}
                        className="rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-sm text-chalk outline-none">
                  {opcoesPapel.map((p) => <option key={p} value={p}>{ROLE_LABEL[p]}</option>)}
                </select>
              )}
            </div>
          );
        })}
        <p className="text-xs text-mist">
          Crie o acesso aqui e passe o e-mail e a senha para a pessoa. Ela pode trocar a senha depois na aba "Minha conta".
        </p>
      </Card>
    </div>
  );
}
