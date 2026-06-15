"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, Badge, Button, Switch } from "@/components/ui/primitives";
import { Save, Plus, Trash2, Eye } from "lucide-react";

const TIPOS: Record<string, string> = {
  abordagem_inicial: "Abordagem inicial",
  followup_1: "Follow-up 1", followup_2: "Follow-up 2", followup_3: "Follow-up 3",
  proposta: "Proposta", pix: "Envio de Pix",
  confirmacao_pagamento: "Confirmação", quitacao: "Termo de quitação",
};

function resolverPreview(txt: string): string {
  const vars: Record<string, string> = {
    primeiro_nome: "Maria", nome_bot: "Ana", nome: "Maria Souza",
    ano_divida: "2009", valor_original: "213,45", valor_final: "85,38",
    desconto_pct: "60", valido_ate: "19/06/2026", pix_copia_cola: "00020126...",
    cpf: "700.469.931-50", processo: "34/35314", valor_pago: "85,38", data_pagamento: "12/06/2026",
  };
  let t = txt.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => g.split("|")[0]);
  return t.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => vars[k] ?? `{{${k}}}`);
}

export function TemplatesManager({ inicial }: { inicial: any[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(inicial);

  function atualizar(id: number, patch: any) {
    setItems((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function salvar(t: any) {
    start(async () => {
      await sb.from("templates_mensagem").update({
        nome: t.nome, conteudo: t.conteudo, peso: t.peso, ativo: t.ativo,
      }).eq("id", t.id);
      router.refresh();
    });
  }

  function excluir(id: number) {
    start(async () => { await sb.from("templates_mensagem").delete().eq("id", id); router.refresh(); });
  }

  function novo() {
    start(async () => {
      await sb.from("templates_mensagem").insert({
        nome: "Novo modelo", tipo: "abordagem_inicial", conteudo: "{Oi|Olá} {{primeiro_nome}}!", peso: 1,
      });
      router.refresh();
    });
  }

  const grupos = items.reduce((acc: Record<string, any[]>, t) => {
    (acc[t.tipo] ??= []).push(t); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={novo} disabled={pending}><Plus className="h-4 w-4" /> Novo modelo</Button>
      </div>
      {Object.entries(grupos).map(([tipo, lista]) => (
        <div key={tipo}>
          <h3 className="mb-3 font-display text-sm font-600 uppercase tracking-wider text-mist">{TIPOS[tipo] ?? tipo}</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {lista.map((t) => (
              <Card key={t.id} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <input value={t.nome} onChange={(e) => atualizar(t.id, { nome: e.target.value })}
                         className="flex-1 bg-transparent font-medium text-chalk outline-none" />
                  <Switch checked={t.ativo} onChange={(v) => atualizar(t.id, { ativo: v })} />
                </div>
                <textarea value={t.conteudo} onChange={(e) => atualizar(t.id, { conteudo: e.target.value })}
                          rows={4}
                          className="w-full resize-y rounded-xl border border-line bg-ink-850 p-3 text-sm text-chalk outline-none focus:border-emerald/60" />
                <div className="rounded-xl border border-line/60 bg-ink-900 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-mist"><Eye className="h-3 w-3" /> Pré-visualização</div>
                  <p className="whitespace-pre-wrap text-sm text-chalk/90">{resolverPreview(t.conteudo)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-mist">
                    Peso
                    <input type="number" min={1} value={t.peso}
                           onChange={(e) => atualizar(t.id, { peso: Number(e.target.value) })}
                           className="w-14 rounded-lg border border-line bg-ink-850 px-2 py-1 font-mono text-chalk tabnums" />
                  </label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => excluir(t.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4 text-rose" />
                    </Button>
                    <Button size="sm" onClick={() => salvar(t)} disabled={pending}><Save className="h-4 w-4" /> Salvar</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
