"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";
import { bloqueiosExclusao, levaJunto, type Vinculos } from "@/lib/vinculos";
import { dataLonga } from "@/lib/datas";

/**
 * Zona de risco do Cadastro (V5.7.01), só do administrador. Inativar tira o cliente da operação e
 * guarda tudo; excluir apaga de vez e serve só para cadastro de teste, duplicado ou importado por
 * engano — e fica travado quando há dinheiro, acordo, Jurídico, documento ou "não perturbe".
 * As duas pedem a palavra digitada: um clique sozinho não faz nada irreversível.
 */
export function ZonaDeRisco({ devedorId, nome, inativoEm, vinculos, onMudou }: {
  devedorId: number; nome: string; inativoEm: string | null; vinculos: Vinculos; onMudou: (m: string) => void;
}) {
  const router = useRouter();
  const [palavraInativar, setPalavraInativar] = useState("");
  const [palavraExcluir, setPalavraExcluir] = useState("");
  const [gravando, setGravando] = useState<"inativar" | "reativar" | "excluir" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const bloqueios = bloqueiosExclusao(vinculos);
  const junto = levaJunto(vinculos);

  async function chamar(acao: "inativar" | "reativar" | "excluir") {
    setGravando(acao); setErro(null);
    const r = acao === "excluir"
      ? await fetch(`/api/devedores/${devedorId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmacao: palavraExcluir }) })
      : await fetch(`/api/devedores/${devedorId}/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmacao: palavraInativar }) });
    const j = await r.json().catch(() => ({}));
    setGravando(null);
    if (!r.ok) { setErro(j?.erro ?? "Não foi possível concluir."); return; }
    if (acao === "excluir") { router.replace("/devedores"); router.refresh(); return; }
    setPalavraInativar("");
    onMudou(acao === "inativar"
      ? `${nome} foi inativado. Saiu da fila do robô, da agenda e das listas; o histórico ficou.`
      : `${nome} voltou para a operação. A fila do robô e a agenda canceladas não voltam sozinhas: marque o próximo passo.`);
  }

  return (
    <section aria-labelledby="t-risco" className="rounded-painel border border-margem/35 bg-folha">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-margem/25 px-5 py-3.5">
        <h2 id="t-risco" className="font-display text-titulo font-600 text-margem">Zona de risco</h2>
        <span className="text-meta font-600 text-lapis">Só o administrador vê</span>
      </div>
      <p className="max-w-[68ch] px-5 pt-3.5 text-[0.9375rem] text-lapis">
        Para tirar alguém da cobrança, inative: some das filas e listas e o histórico continua. Excluir é para cadastro de teste, duplicado ou importado por engano.
      </p>
      {erro && <p role="alert" className="mx-5 mt-3 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">{erro}</p>}

      <div className="grid gap-px bg-pauta lg:grid-cols-2">
        <div className="bg-folha px-5 py-4">
          {inativoEm ? (
            <>
              <h3 className="font-700 text-texto">Reativar cliente</h3>
              <p className="mt-1 text-sm2 text-lapis">Inativo desde {dataLonga(inativoEm)}. Volta com a situação que tinha antes.</p>
              <Button variant="outline" className="mt-3" onClick={() => chamar("reativar")} disabled={gravando !== null}>
                {gravando === "reativar" ? "Reativando…" : "Reativar cliente"}
              </Button>
            </>
          ) : (
            <>
              <h3 className="font-700 text-texto">Inativar cliente</h3>
              <p className="mt-1 text-sm2 text-lapis">Cancela a fila do robô e a agenda, encerra a conversa do robô e guarda contatos, acordos e histórico.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <Label htmlFor="conf-inativar">Digite INATIVAR para confirmar</Label>
                  <Input id="conf-inativar" value={palavraInativar} onChange={(e) => setPalavraInativar(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
                <Button variant="outline" onClick={() => chamar("inativar")} disabled={palavraInativar.trim().toUpperCase() !== "INATIVAR" || gravando !== null}>
                  {gravando === "inativar" ? "Inativando…" : "Inativar"}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="bg-folha px-5 py-4">
          <h3 className="font-700 text-texto">Excluir definitivamente</h3>
          {bloqueios.length ? (
            <p className="mt-1 text-sm2 text-margem">
              Não pode ser excluído: tem {bloqueios.join(", ")}. Inative para tirar da operação sem perder a prova.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm2 text-lapis">
                Apaga a ficha{junto.length ? ` com ${junto.join(", ")}` : ""}. Não tem volta; a auditoria guarda quem excluiu e o que havia.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <Label htmlFor="conf-excluir">Digite EXCLUIR para confirmar</Label>
                  <Input id="conf-excluir" value={palavraExcluir} onChange={(e) => setPalavraExcluir(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
                <Button variant="danger" onClick={() => chamar("excluir")} disabled={palavraExcluir.trim().toUpperCase() !== "EXCLUIR" || gravando !== null}>
                  {gravando === "excluir" ? "Excluindo…" : "Excluir de vez"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
