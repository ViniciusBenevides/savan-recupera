import { NextResponse } from "next/server";
import { exigirConversa, cobradorDoChip } from "@/lib/conversas";
import { contaChatwoot, respostasProntas, modelosAprovados } from "@/lib/chatwoot-atendimento";
import { canalDaConversa } from "@/lib/canal-conversa";

/**
 * GET — o que a caixa de resposta precisa saber para esta conversa, agora.
 *
 * É consultado ao abrir a conversa (e não embutido na página) porque o estado muda com o relógio:
 * no canal da Meta a janela de 24h expira sozinha, e uma página aberta desde cedo mostraria "pode
 * escrever" muito depois de não poder.
 *
 * Quem decide a regra é o CONECTOR do chip, não o painel — ver `canalDaConversa`. Antes disto a
 * rota aplicava a regra da Meta em toda conversa, inclusive nas que hoje andam por Baileys, onde
 * não existe janela nem modelo aprovado.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirConversa(id);
  if (g.erro) return g.erro;
  const { conversa } = g;

  const canal = await canalDaConversa(conversa);

  const conta = await contaChatwoot();
  const [modelos, prontas] = await Promise.all([
    // Modelo aprovado só existe no canal da Meta. Buscar no Baileys era oferecer ao operador um
    // caminho que não entrega nada — a WABA que aprovou esses modelos está banida (§38).
    canal.usa_modelo ? modelosAprovados(await cobradorDoChip(conversa.chip_id)) : Promise.resolve([]),
    conta ? respostasProntas(conta) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ok: true,
    estado: conversa.estado,
    motivo_encerramento: conversa.motivo_encerramento,
    atendente_nome: conversa.atendente_nome,

    // ── canal ──
    conector: canal.conector,
    chip_nome: canal.chip?.nome ?? null,
    caminho: canal.caminho,
    impedimento: canal.impedimento,
    texto_livre: canal.texto_livre,
    usa_modelo: canal.usa_modelo,
    abordagem: canal.abordagem,

    // ── janela de 24h (só faz sentido no canal da Meta) ──
    janela_aplica: canal.janela_aplica,
    na_janela: canal.na_janela,
    ultima_entrada_em: conversa.ultima_entrada_em,
    janela_expira_em: canal.janela_expira_em,

    modelos,
    respostas_prontas: prontas,
  });
}
