import Link from "next/link";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { Card, Button } from "@/components/ui/primitives";
import { CalculadoraCusto } from "@/components/CalculadoraCusto";
import type { Sessao } from "@/lib/auth";
import { ChipCard } from "../../chips/chip-card";
import { TesteCard } from "../../chips/teste-card";
import { Plus, Smartphone, Calculator } from "lucide-react";

/**
 * Aba "Chips" — os números de WhatsApp. O canal em uso é o comum (Baileys, vinculado por QR na
 * Evolution); a API oficial da Meta está suspensa desde 17/08/2026 (§38) e sobrevive só nos chips
 * antigos. A calculadora de custo, que era uma página inteira só para ela (/chips/custos), virou
 * um bloco recolhível no fim desta.
 */
export async function Chips({ sessao }: { sessao: Sessao }) {
  const sb = await supabaseServer();
  const hoje = new Date().toISOString().slice(0, 10);
  // hora local da operação — o orçamento de ritmo (§33) é por hora local, não UTC
  const tzOp = "America/Sao_Paulo";
  const diaLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tzOp, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const horaLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tzOp })).getHours();

  const [{ data: chips }, { data: metr }, { data: cfgTeste }, { data: metrHora }, { data: cfgRitmo }] = await Promise.all([
    sb.from("chips").select("*").order("id"),
    sb.from("chip_metricas_diarias").select("chip_id, novos_contatos, msgs_enviadas").eq("dia", hoje),
    sb.from("configuracoes").select("valor").eq("chave", "numero_teste").is("cobrador_id", null).maybeSingle(),
    sb.from("chip_metricas_horarias").select("chip_id, msgs").eq("dia", diaLocal).eq("hora", horaLocal),
    sb.from("configuracoes").select("valor").eq("chave", "ritmo").is("cobrador_id", null).maybeSingle(),
  ]);

  const porChip: Record<number, any> = {};
  for (const m of metr ?? []) porChip[m.chip_id] = m;
  const usadosHoraPorChip: Record<number, number> = {};
  for (const m of metrHora ?? []) usadosHoraPorChip[m.chip_id] = m.msgs ?? 0;
  const ritmo: Record<string, any> = (cfgRitmo?.valor as any) ?? {};

  // admin vê de quem é cada chip (separação): mapa cobrador_id -> nome
  const donoPorChip: Record<number, string | null> = {};
  if (sessao.role === "admin") {
    const { data: us } = await supabaseAdmin().from("usuarios_app").select("id, nome, email");
    const nomeDe = new Map((us ?? []).map((u) => [u.id, u.nome || u.email]));
    for (const c of chips ?? []) donoPorChip[c.id] = c.cobrador_id ? (nomeDe.get(c.cobrador_id) ?? "—") : null;
  }

  // numero_teste: formato novo {numeros:[{e164,label,ativo}]} com compat do antigo {e164,ativo}
  const ntRaw = (cfgTeste?.valor as any) ?? {};
  const numerosTeste: { e164: string; label: string; ativo: boolean }[] = Array.isArray(ntRaw.numeros)
    ? ntRaw.numeros
    : ntRaw.e164
      ? [{ e164: ntRaw.e164, label: "Principal", ativo: ntRaw.ativo ?? false }]
      : [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist">
          Cada chip é um número de WhatsApp vinculado por QR, como no WhatsApp Web.
        </p>
        <Link href="/chips/novo"><Button><Plus className="h-4 w-4" /> Adicionar chip</Button></Link>
      </div>

      {(chips ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-800 text-mist">
            <Smartphone className="h-7 w-7" />
          </span>
          <div>
            <h3 className="font-display text-lg font-600 text-chalk">Nenhum chip cadastrado</h3>
            <p className="mt-1 max-w-sm text-sm text-mist">
              Cadastre o número aqui e leia o QR com o celular dele — como conectar o WhatsApp Web.
              Depois de conectado, é só ativar.
            </p>
          </div>
          <Link href="/chips/novo"><Button><Plus className="h-4 w-4" /> Adicionar primeiro chip</Button></Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(chips ?? []).map((c) => (
              <ChipCard
                key={c.id}
                chip={c}
                metrica={porChip[c.id]}
                donoNome={donoPorChip[c.id]}
                ritmoHora={{
                  // mesma precedência de fn_limite_chip_hora: override manual > curva por maturidade
                  limite: c.limite_hora_override ?? ritmo?.[c.maturidade ?? "novo"]?.msgs_hora ?? null,
                  usados: usadosHoraPorChip[c.id] ?? 0,
                }}
              />
            ))}
          </div>
          <div className="mt-4">
            <TesteCard numerosIniciais={numerosTeste} chips={chips ?? []} />
          </div>
        </>
      )}

      {/* Antes era a página /chips/custos. É consulta ocasional — cabe recolhida aqui. */}
      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-ink-850 px-4 py-3 text-sm text-chalk transition-colors hover:border-ink-500">
          <Calculator className="h-4 w-4 text-emerald" />
          Estimar o custo mensal na Meta
          <span className="ml-auto text-xs text-mist transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3">
          <CalculadoraCusto />
        </div>
      </details>
    </>
  );
}
