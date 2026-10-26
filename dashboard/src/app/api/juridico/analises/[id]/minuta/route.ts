import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao } from "@/lib/auth";

/** GET — baixa a minuta da análise em .txt. Lida pela sessão: só quem enxerga o devedor baixa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessao())) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const id = Number((await params).id);
  const sb = await supabaseServer();
  const { data: a } = await sb.from("juridico_analises").select("id, minuta, devedores(processo)").eq("id", id).maybeSingle();
  if (!a) return NextResponse.json({ erro: "Análise não encontrada." }, { status: 404 });
  const processo = ((a.devedores as unknown as { processo: string | null } | null)?.processo ?? "devedor").replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(a.minuta ?? "Minuta não gerada.", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="MINUTA_${processo}_${a.id}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
