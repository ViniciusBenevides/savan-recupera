import { NextResponse } from "next/server";
import { exigirConversa, cobradorDoChip } from "@/lib/conversas";
import {
  contaChatwoot, respostasProntas, modelosAprovados, dentroDaJanela, JANELA_MS,
} from "@/lib/chatwoot-atendimento";

/**
 * GET — o que a caixa de resposta precisa saber para esta conversa, agora.
 *
 * É consultado ao abrir a conversa (e não embutido na página) porque a janela de 24h expira com
 * o relógio: uma página aberta desde cedo mostraria "pode escrever" muito depois de não poder.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirConversa(id);
  if (g.erro) return g.erro;
  const { conversa } = g;

  const naJanela = dentroDaJanela(conversa.ultima_entrada_em);
  const expiraEm = conversa.ultima_entrada_em
    ? new Date(new Date(conversa.ultima_entrada_em).getTime() + JANELA_MS).toISOString()
    : null;

  const conta = await contaChatwoot();
  const [modelos, prontas] = await Promise.all([
    // Fora da janela o modelo aprovado é o único caminho; dentro dela ele continua disponível,
    // mas a caixa de texto livre é o padrão.
    modelosAprovados(await cobradorDoChip(conversa.chip_id)),
    conta ? respostasProntas(conta) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ok: true,
    estado: conversa.estado,
    motivo_encerramento: conversa.motivo_encerramento,
    atendente_nome: conversa.atendente_nome,
    ligada_ao_chatwoot: !!conversa.chatwoot_conversation_id,
    na_janela: naJanela,
    ultima_entrada_em: conversa.ultima_entrada_em,
    janela_expira_em: expiraEm,
    modelos,
    respostas_prontas: prontas,
  });
}
