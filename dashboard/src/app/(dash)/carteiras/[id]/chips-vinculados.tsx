"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Label, Badge, HelpHint } from "@/components/ui/primitives";
import { Smartphone, Loader2, CheckCircle2, AlertTriangle, QrCode, Cloud } from "lucide-react";

type ChipItem = {
  id: number; nome: string; numero_e164: string | null;
  conector: string; status: string; vinculado: boolean;
};

const PRONTO = new Set(["conectado", "aquecendo", "ativo"]);

/**
 * Quais chips atendem esta carteira.
 *
 * Existe porque a relação não existia: qualquer chip ativo puxava item de qualquer carteira ativa.
 * Com um número só ninguém notava; com vários números Baileys e rotatividade alta (ADR-0004) isso
 * vira o chip de uma carteira abrindo conversa da carteira de outro.
 */
export function ChipsVinculados({ carteiraId }: { carteiraId: number }) {
  const router = useRouter();
  const [chips, setChips] = React.useState<ChipItem[] | null>(null);
  const [sel, setSel] = React.useState<Set<number>>(new Set());
  const [salvando, setSalvando] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/carteiras/${carteiraId}/chips`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao carregar os chips."); setChips([]); return; }
      setChips(d.chips ?? []);
      setSel(new Set((d.chips ?? []).filter((c: ChipItem) => c.vinculado).map((c: ChipItem) => c.id)));
    } catch { setErro("Falha ao carregar os chips."); setChips([]); }
  }, [carteiraId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  const original = React.useMemo(
    () => new Set((chips ?? []).filter((c) => c.vinculado).map((c) => c.id)),
    [chips],
  );
  const mudou = React.useMemo(() => {
    if (sel.size !== original.size) return true;
    for (const id of sel) if (!original.has(id)) return true;
    return false;
  }, [sel, original]);

  const marcados = (chips ?? []).filter((c) => sel.has(c.id));
  const temBaileys = marcados.some((c) => c.conector === "baileys");
  const temMeta = marcados.some((c) => c.conector !== "baileys");
  const nenhumPronto = marcados.length > 0 && !marcados.some((c) => PRONTO.has(c.status));

  function alternar(id: number) {
    setMsg(null);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function salvar() {
    setSalvando(true); setErro(null); setMsg(null);
    try {
      const r = await fetch(`/api/carteiras/${carteiraId}/chips`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chip_ids: [...sel] }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao salvar."); return; }
      setMsg(`${d.vinculados} chip(s) atendendo esta carteira.`);
      await carregar();
      router.refresh();
    } catch { setErro("Falha ao salvar."); }
    finally { setSalvando(false); }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="mb-0 flex items-center gap-1.5">
          <Smartphone className="h-4 w-4 text-emerald" /> Chips desta carteira
          <HelpHint text="Só os chips marcados abrem conversa por esta carteira. Sem nenhum marcado a carteira não dispara — nem pelo pool livre, nem pela distribuição." />
        </Label>
        <Badge tone={sel.size ? "green" : "amber"}>{sel.size} vinculado(s)</Badge>
      </div>

      {chips === null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-mist">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando chips…
        </div>
      ) : chips.length === 0 ? (
        <p className="rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-xs text-mist">
          Nenhum chip de bot cadastrado. Adicione um em <b className="text-chalk">Ajustes → Chips</b>.
        </p>
      ) : (
        <div className="space-y-1.5">
          {chips.map((c) => {
            const marcado = sel.has(c.id);
            return (
              <button
                key={c.id} type="button" onClick={() => alternar(c.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  marcado ? "border-emerald/50 bg-emerald/8" : "border-line bg-ink-850 hover:border-ink-500"
                }`}
              >
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                  marcado ? "border-emerald bg-emerald text-ink-900" : "border-ink-500"
                }`}>
                  {marcado && <CheckCircle2 className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-chalk">{c.nome}</span>
                  <span className="block font-mono text-[11px] text-mist tabnums">{c.numero_e164 ?? "sem número"}</span>
                </span>
                {c.conector === "baileys"
                  ? <Badge tone="amber"><QrCode className="h-3 w-3" /> QR</Badge>
                  : <Badge tone="green"><Cloud className="h-3 w-3" /> Meta</Badge>}
                <Badge tone={PRONTO.has(c.status) ? "blue" : "neutral"}>{c.status}</Badge>
              </button>
            );
          })}
        </div>
      )}

      {temBaileys && temMeta && (
        <div className="flex gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-xs text-amber">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Esta carteira tem chip dos <b>dois canais</b>. A primeira mensagem sai de fontes diferentes:
            o chip QR usa o <b>texto do bloco de disparo</b> e o chip Meta usa o <b>modelo aprovado</b>.
            Mantenha os dois preenchidos e dizendo a mesma coisa, ou metade das pessoas recebe outra
            mensagem sem nenhum erro aparecer.
          </span>
        </div>
      )}

      {nenhumPronto && (
        <div className="flex gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-xs text-amber">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Nenhum chip marcado está conectado. A carteira não vai disparar até um deles entrar.</span>
        </div>
      )}

      {sel.size === 0 && chips !== null && chips.length > 0 && (
        <p className="rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-xs text-mist">
          Sem chip vinculado esta carteira <b className="text-chalk">não dispara nada</b>.
        </p>
      )}

      {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}
      {msg && <p className="text-xs text-emerald">{msg}</p>}

      <Button size="sm" onClick={salvar} disabled={!mudou || salvando}>
        {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : "Salvar vínculos"}
      </Button>
    </Card>
  );
}
