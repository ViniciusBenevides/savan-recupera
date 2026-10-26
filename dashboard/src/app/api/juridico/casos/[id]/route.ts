import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { carteiraDoJuridico } from "@/lib/juridico/acesso";
import { lerCaso } from "@/lib/juridico/casos";

/** PATCH — atualiza o andamento do caso (etapa, CNJ, prazo, próxima ação, situação…). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const adm = supabaseAdmin();
  const { data: caso } = await adm.from("juridico_casos").select("id, devedor_id").eq("id", id).maybeSingle();
  if (!caso) return NextResponse.json({ erro: "Caso não encontrado." }, { status: 404 });
  if (!(await carteiraDoJuridico(g.sessao, caso.devedor_id))) return NextResponse.json({ erro: "Você não pode decidir o Jurídico deste devedor." }, { status: 403 });

  const lido = lerCaso(await req.json().catch(() => ({})));
  if ("erro" in lido) return NextResponse.json({ erro: lido.erro }, { status: 400 });
  if (!Object.keys(lido.patch).length) return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });
  const { error } = await adm.from("juridico_casos").update(lido.patch).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
