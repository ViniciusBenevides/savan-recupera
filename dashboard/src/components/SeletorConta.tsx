"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Building2, Globe2, User } from "lucide-react";

type Cobrador = { id: string; nome: string | null; email: string | null };

// Seletor de CONTA para o admin: escolhe ver/editar o padrão global da plataforma ou a conta
// de um cobrador específico. Deixa explícito "de quem é" o que está na tela (separação),
// mantendo o controle total do admin. Não aparece para o próprio cobrador (ele só vê o seu).
export function SeletorConta({ cobradores, conta }: { cobradores: Cobrador[]; conta: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const ehGlobal = !conta || conta === "global";
  const atual = cobradores.find((c) => c.id === conta);

  function ir(novo: string) {
    const q = new URLSearchParams(params.toString());
    if (!novo || novo === "global") q.delete("conta"); else q.set("conta", novo);
    start(() => router.push(`${pathname}${q.toString() ? `?${q}` : ""}`));
  }

  return (
    <div className="mb-4 rounded-xl border border-violet/25 bg-violet/5 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet/15 text-violet">
            {ehGlobal ? <Globe2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </span>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mist">Admin · você está vendo</div>
            <div className="text-sm font-medium text-chalk">
              {ehGlobal
                ? "Padrão global da plataforma"
                : <>Conta de <span className="text-violet-soft">{atual?.nome || atual?.email || "cobrador"}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-mist" />
          <select
            value={ehGlobal ? "global" : conta}
            onChange={(e) => ir(e.target.value)}
            disabled={pending}
            className="h-9 rounded-lg border border-line bg-ink-850 px-3 text-sm text-chalk outline-none"
          >
            <option value="global">Padrão global da plataforma</option>
            {cobradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome || c.email}</option>
            ))}
          </select>
        </div>
      </div>
      {ehGlobal ? (
        <p className="mt-2 text-[11px] text-mist">
          Estes são os valores-padrão. Cada cobrador que não personalizar herda daqui. Escolha um cobrador acima para ver/editar a conta dele — separadamente.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-mist">
          Você está editando a conta deste cobrador. O que está em branco/sem personalização cai no padrão global.
        </p>
      )}
    </div>
  );
}
