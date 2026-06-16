import { gerarModeloXlsx } from "@/lib/import/modelo";

export const runtime = "nodejs";

// GET: baixa o modelo .xlsx em branco para o usuário preencher.
export async function GET() {
  const buf = gerarModeloXlsx();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-carteira.xlsx"',
    },
  });
}
