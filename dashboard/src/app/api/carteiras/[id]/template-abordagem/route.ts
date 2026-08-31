import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import { setConfig } from "@/lib/config";

// A 1ª mensagem no canal oficial da Meta NÃO é texto que se escreve: é um modelo que a Meta já
// aprovou, palavra por palavra. Editar aqui não teria efeito nenhum — o que existe é ESCOLHER
// entre os modelos aprovados e dizer o que entra em cada `{{n}}` deles.

// Variáveis que o `campanha-lote` sabe preencher ao montar o template (montarTemplate).
// Mudar esta lista sem mudar lá faz o disparador pular o chip com `meta_template_nao_montou`.
const VARIAVEIS = ["primeiro_nome", "nome", "credor", "nome_bot", "saudacao"] as const;

function corpoDoTemplate(components: unknown): string {
  const lista = Array.isArray(components) ? components : [];
  const body = lista.find((c: any) => c?.type === "BODY");
  return String((body as any)?.text ?? "");
}

/** Quantos `{{n}}` o corpo usa. É quantas escolhas de variável o modelo exige. */
function quantasVariaveis(texto: string): number {
  const achados = [...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return achados.length ? Math.max(...achados) : 0;
}

async function cobradorDaCarteira(carteiraId: number): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("carteiras").select("cobrador_id").eq("id", carteiraId).maybeSingle();
  return (data?.cobrador_id as string | null) ?? null;
}

// GET — os modelos APROVADOS que este chip pode usar, com o corpo de cada um, mais o que está
// escolhido hoje. Lê o cache local (`meta_templates`); ir à Graph API aqui deixaria a tela lenta e
// hoje falharia, já que a WABA está banida (§38).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const admin = supabaseAdmin();
  const cobradorId = await cobradorDaCarteira(carteiraId);

  const [{ data: tpls }, { data: cfgs }] = await Promise.all([
    admin.from("meta_templates").select("name, language, category, components, cobrador_id")
      .eq("status", "APPROVED").order("name"),
    admin.from("configuracoes").select("valor, cobrador_id").eq("chave", "meta_abordagem_template"),
  ]);

  // padrão global sobrescrito pelo do cobrador — a mesma precedência do campanha-lote
  const global = (cfgs ?? []).find((r) => r.cobrador_id == null)?.valor ?? null;
  const doCobrador = cobradorId ? (cfgs ?? []).find((r) => r.cobrador_id === cobradorId)?.valor ?? null : null;
  const atual: any = doCobrador ?? global;

  const visiveis = (tpls ?? []).filter((t) => t.cobrador_id == null || t.cobrador_id === cobradorId);

  return NextResponse.json({
    ok: true,
    variaveis_disponiveis: VARIAVEIS,
    atual: atual
      ? { name: atual.name ?? null, language: atual.language ?? "pt_BR", variaveis: atual.variaveis ?? [] }
      : null,
    templates: visiveis.map((t) => {
      const texto = corpoDoTemplate(t.components);
      return {
        name: t.name, language: t.language, category: t.category,
        texto, n_variaveis: quantasVariaveis(texto),
      };
    }),
  });
}

// PUT — grava a escolha. Vai para `configuracoes`, que é onde o `campanha-lote` lê, e no escopo do
// cobrador dono da carteira: a chave é por cobrador, então vale para todas as carteiras dele.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const language = String(body?.language ?? "pt_BR").trim() || "pt_BR";
  const variaveis: string[] = Array.isArray(body?.variaveis) ? body.variaveis.map((v: unknown) => String(v)) : [];

  if (!name) return NextResponse.json({ erro: "Escolha um modelo aprovado." }, { status: 400 });
  const invalida = variaveis.find((v) => !(VARIAVEIS as readonly string[]).includes(v));
  if (invalida) {
    return NextResponse.json({ erro: `Variável desconhecida: ${invalida}.` }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: tpl } = await admin.from("meta_templates")
    .select("components, status").eq("name", name).eq("language", language)
    .eq("status", "APPROVED").maybeSingle();
  if (!tpl) {
    return NextResponse.json(
      { erro: "Esse modelo não consta como aprovado. Atualize os modelos em Ajustes antes de escolher." },
      { status: 400 },
    );
  }
  // A Meta recusa parâmetro vazio: sem uma variável para cada `{{n}}`, o disparador não montaria o
  // template e pularia o chip com `meta_template_nao_montou` — falha silenciosa na hora do envio.
  const exigidas = quantasVariaveis(corpoDoTemplate(tpl.components));
  if (variaveis.length !== exigidas) {
    return NextResponse.json(
      { erro: `Este modelo usa ${exigidas} variável(is); você indicou ${variaveis.length}.` },
      { status: 400 },
    );
  }

  const cobradorId = await cobradorDaCarteira(carteiraId);
  const { error } = await setConfig(cobradorId, "meta_abordagem_template",
    { name, language, variaveis }, g.sessao.user.id);
  if (error) return NextResponse.json({ erro: error }, { status: 400 });

  return NextResponse.json({ ok: true, name, language, variaveis });
}
