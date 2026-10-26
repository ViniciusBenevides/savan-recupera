"use client";
import { useState } from "react";
import { Phone } from "lucide-react";
import { Button, Input, Label, estiloBotao } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { dataCurta } from "@/lib/datas";
import type { Telefone } from "@/app/(dash)/devedores/[id]/ficha";

export const formatarFone = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
};

// Mesmo critério do robô: celular que não foi dado como sem WhatsApp
const elegivel = (t: Telefone) => t.tipo !== "fixo" && t.whatsapp_valido !== false;

/**
 * Telefones da ficha com o "Excluir" seguro da V5.5.11: o número sai do robô, da fila e desta lista,
 * e o registro fica guardado (com quem excluiu e por quê) para o histórico das conversas.
 */
export function Telefones({ telefones, excluidos, podeOperar, onMudou, onErro }: {
  telefones: Telefone[]; excluidos: Telefone[]; podeOperar: boolean; onMudou: (m: string) => void; onErro: (m: string) => void;
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);
  const semCelular = telefones.length > 0 && !telefones.some(elegivel);

  async function excluir(t: Telefone) {
    setGravando(true);
    const r = await fetch(`/api/telefones/${t.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo: motivo || null }) });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { onErro(j?.erro ?? "Não foi possível excluir o telefone."); return; }
    setConfirmando(null); setMotivo("");
    const resto = j?.voltou_para_fila ? " A abordagem que ia por ele passou para o próximo celular." : Number(j?.restam ?? 1) === 0 ? " Sem telefone agora: precisa de higienização." : "";
    onMudou(`${formatarFone(t.telefone_e164)} excluído.${resto}`);
  }

  return (
    <section aria-labelledby="t-fones">
      <h2 id="t-fones" className="font-display text-titulo font-600 text-ouro">Telefones</h2>
      {telefones.length === 0 ? (
        <p className="mt-2 text-[0.9375rem] text-lapis">Nenhum telefone ativo. Sem telefone, este devedor precisa de higienização.</p>
      ) : (
        <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
          {telefones.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-lapis" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-mono tabnums text-texto">{formatarFone(t.telefone_e164)}</span>
                    <span className="block text-sm2 text-lapis">
                      {t.tipo === "fixo" ? "fixo" : "celular"}{t.ordem === 1 ? " · principal" : ""} ·{" "}
                      <span className={cn("font-600", t.whatsapp_valido === true ? "text-pago" : t.whatsapp_valido === false ? "text-margem" : "text-lapis")}>
                        {t.whatsapp_valido === true ? "tem WhatsApp" : t.whatsapp_valido === false ? "sem WhatsApp" : "WhatsApp não verificado"}
                      </span>
                    </span>
                  </span>
                </span>
                {/* As duas ações com a mesma largura, como pediu a V5.6.05: nada de botão espremido */}
                <span className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_6rem]">
                  <a href={`tel:${t.telefone_e164}`} className={estiloBotao("outline", "sm")}>Ligar</a>
                  {podeOperar && (
                    <Button size="sm" variant="ghost" className={confirmando === t.id ? "text-texto" : "hover:text-margem"}
                      onClick={() => { setConfirmando(confirmando === t.id ? null : t.id); setMotivo(""); }} aria-expanded={confirmando === t.id}>
                      {confirmando === t.id ? "Manter" : "Excluir"}
                    </Button>
                  )}
                </span>
              </div>
              {confirmando === t.id && (
                <div className="mt-3 rounded-controle border border-margem/35 bg-margem-fundo p-3 animate-fade-up">
                  <p className="text-sm2 text-texto">
                    O número sai do robô, da fila e desta lista. O que já foi conversado por ele continua no histórico, e se a pessoa escrever dele a mensagem ainda chega.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <Label htmlFor={`motivo-${t.id}`}>Motivo <span className="font-500 text-lapis">(opcional)</span></Label>
                      <Input id={`motivo-${t.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: número de outra pessoa" maxLength={300} />
                    </div>
                    <Button variant="danger" onClick={() => excluir(t)} disabled={gravando}>{gravando ? "Excluindo…" : "Excluir este número"}</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {semCelular && (
        <p className="mt-2 text-sm2 font-600 text-atencao">Nenhum celular com WhatsApp: precisa de higienização para voltar a ser chamado.</p>
      )}
      {excluidos.length > 0 && (
        <details className="mt-3 text-sm2">
          <summary className="alvo-toque inline-flex cursor-pointer items-center font-600 text-tinta hover:underline">
            {excluidos.length === 1 ? "1 número excluído" : `${excluidos.length} números excluídos`}
          </summary>
          <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
            {excluidos.map((t) => (
              <li key={t.id} className="px-4 py-2.5">
                <span className="font-mono tabnums text-lapis line-through decoration-margem/60">{formatarFone(t.telefone_e164)}</span>
                <span className="block text-lapis">
                  Excluído{t.excluido_em ? ` em ${dataCurta(t.excluido_em)}` : ""}{t.excluido_por_nome ? ` por ${t.excluido_por_nome}` : ""}{t.motivo_exclusao ? ` · ${t.motivo_exclusao}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
