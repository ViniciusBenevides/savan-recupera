// "O que a IA leu": interpreta a mensagem do devedor sem depender de chave de API.
// Resolve as duas falhas que o robô tinha na prática:
//   1. "consigo pagar dia 10" num dia 16 → o dia 10 DESTE mês já passou; a promessa é para o dia 10
//      do mês que vem — e isso tem que virar compromisso com data, não ficar no ar.
//   2. "quero pagar" seguido de silêncio → a conversa é marcada como quente e volta para a fila.
// É deliberadamente conservador: na dúvida, não inventa data (devolve `data: null`).
import { instanteSP, partesSP, somarDias, inicioDoDiaSP, diasEntre, dataCurta, nomeDoDia } from "@/lib/datas";

export type Intencao =
  | "quer_pagar" | "promessa" | "pediu_parcelar" | "pediu_retorno" | "ja_pagou" | "desconfiado"
  | "nao_reconhece" | "sem_condicao" | "recusa" | "nao_perturbe" | "pessoa_errada" | "falecido"
  | "pergunta_valor" | "outro";

export type Leitura = {
  intencao: Intencao;
  rotulo: string;          // frase curta para o operador
  data: Date | null;       // data interpretada (promessa ou retorno), no fuso de SP
  dataTexto: string | null;// "10/11 — o dia 10 deste mês já passou"
  sensivel: boolean;       // pede humano com cuidado (golpe, contestação, falecimento…)
  bloquear: boolean;       // "não", "pare", "não me mande mais" → bloqueio permanente
};

const tirarAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

// Interpreta datas comuns no WhatsApp. `agora` permite testar.
export function lerData(texto: string, agora = new Date()): { data: Date; obs: string } | null {
  const t = tirarAcento(texto);
  const hoje = partesSP(agora);
  const h10 = (d: Date) => { const p = partesSP(d); return instanteSP(p.ano, p.mes, p.dia, 10, 0); };

  // dd/mm ou dd/mm/aaaa
  const dm = t.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?\b/);
  if (dm) {
    const dia = Number(dm[1]); const mes = Number(dm[2]);
    let ano = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : hoje.ano;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let d = instanteSP(ano, mes, dia, 10, 0);
      if (!dm[3] && diasEntre(agora, d) < 0) { ano += 1; d = instanteSP(ano, mes, dia, 10, 0); }
      return { data: d, obs: "" };
    }
  }
  if (/\b(hoje|hj)\b/.test(t)) return { data: h10(agora), obs: "hoje" };
  if (/\bdepois de amanha\b/.test(t)) return { data: h10(somarDias(agora, 2)), obs: "depois de amanhã" };
  if (/\bamanha\b/.test(t)) return { data: h10(somarDias(agora, 1)), obs: "amanhã" };
  if (/\bsemana que vem\b|\bproxima semana\b/.test(t)) {
    // segunda-feira da semana que vem
    const falta = ((8 - hoje.semana) % 7) || 7;
    return { data: h10(somarDias(agora, falta)), obs: "segunda da semana que vem" };
  }
  if (/\bfim do mes\b|\bfinal do mes\b/.test(t)) {
    const ultimo = new Date(Date.UTC(hoje.ano, hoje.mes, 0)).getUTCDate();
    let d = instanteSP(hoje.ano, hoje.mes, ultimo, 10, 0);
    if (diasEntre(agora, d) < 0) d = instanteSP(hoje.ano, hoje.mes + 1, new Date(Date.UTC(hoje.ano, hoje.mes + 1, 0)).getUTCDate(), 10, 0);
    return { data: d, obs: "fim do mês" };
  }
  for (const [nome, idx] of Object.entries(DIAS_SEMANA)) {
    if (new RegExp(`\\b${nome}(-feira)?\\b`).test(t)) {
      let falta = (idx - hoje.semana + 7) % 7;
      if (falta === 0) falta = 7;
      const d = h10(somarDias(agora, falta));
      return { data: d, obs: nomeDoDia(d) };
    }
  }
  // "dia 10", "no dia 5", "dia dez"
  const extenso: Record<string, number> = { um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30 };
  const dd = t.match(/\bdia\s+(\d{1,2}|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\b/);
  if (dd) {
    const dia = /\d/.test(dd[1]) ? Number(dd[1]) : extenso[dd[1]];
    if (dia >= 1 && dia <= 31) {
      let d = instanteSP(hoje.ano, hoje.mes, dia, 10, 0);
      let obs = "";
      if (diasEntre(agora, d) < 0) {
        d = instanteSP(hoje.ano, hoje.mes + 1, dia, 10, 0);
        obs = `o dia ${dia} deste mês já passou`;
      }
      return { data: d, obs };
    }
  }
  if (/\bquando (eu )?receber\b|\bdia do pagamento\b|\bquinto dia util\b/.test(t)) {
    // 5º dia útil do mês que vem é o costume de quem recebe salário; fica como sugestão.
    let d = instanteSP(hoje.ano, hoje.mes + 1, 1, 10, 0);
    let uteis = 0;
    while (true) { const s = partesSP(d).semana; if (s !== 0 && s !== 6) uteis++; if (uteis === 5) break; d = somarDias(d, 1); }
    return { data: d, obs: "5º dia útil (quando recebe)" };
  }
  return null;
}

const tem = (t: string, ...ps: RegExp[]) => ps.some((p) => p.test(t));

export function lerMensagem(texto: string, agora = new Date()): Leitura {
  const t = tirarAcento(texto ?? "").trim();
  const base = { data: null as Date | null, dataTexto: null as string | null, sensivel: false, bloquear: false };
  const comData = (intencao: Intencao, rotulo: string, extra: Partial<Leitura> = {}): Leitura => {
    const d = lerData(texto, agora);
    if (!d) return { ...base, intencao, rotulo, ...extra };
    const n = diasEntre(inicioDoDiaSP(agora), d.data);
    const quando = n === 0 ? "hoje" : n === 1 ? "amanhã" : `daqui a ${n} dias`;
    const obs = [quando, d.obs].filter(Boolean).join(" — ");
    return { ...base, intencao, rotulo, data: d.data, dataTexto: `${dataCurta(d.data)} · ${obs}`, ...extra };
  };

  if (!t) return { ...base, intencao: "outro", rotulo: "Mensagem sem texto (áudio, imagem ou figurinha)." };
  if (tem(t, /^\s*(nao|n)\s*[.!]*$/, /\bnao (me )?(mande|manda|envie|perturbe|ligue)\b/, /\bpare de\b/, /\bpara de (me )?mandar\b/, /\bme tira (dessa|da) lista\b/, /\bdescadastr/))
    return { ...base, intencao: "nao_perturbe", rotulo: "Pediu para não receber mais mensagens. Vira bloqueio permanente.", bloquear: true, sensivel: true };
  if (tem(t, /\bfaleceu\b/, /\bfalecid/, /\bmorreu\b/, /\bobito\b/))
    return { ...base, intencao: "falecido", rotulo: "Informou falecimento do titular. Encerrar com respeito, sem cobrar.", sensivel: true, bloquear: true };
  if (tem(t, /\bnumero errado\b/, /\bnao (e|eh|sou) (ele|ela|essa pessoa|o|a)\b/, /\bnao conheco\b/, /\bpessoa errada\b/, /\bmudou de numero\b/, /\btroquei de numero\b/))
    return { ...base, intencao: "pessoa_errada", rotulo: "Diz que não é a pessoa certa. Não revele a dívida.", sensivel: true };
  if (tem(t, /\bgolpe\b/, /\bfraude\b/, /\bquem (e|fala|esta falando)\b/, /\bcomo (conseguiu|pegou|tem) (meu|esse) numero\b/, /\bque empresa\b/, /\bnunca ouvi\b/))
    return { ...base, intencao: "desconfiado", rotulo: "Desconfiou (golpe, quem fala). Explique a cessão da dívida uma vez, com calma.", sensivel: true };
  if (tem(t, /\bnunca comprei\b/, /\bnao reconheco\b/, /\bnao devo\b/, /\bja prescreveu\b/, /\bprescrit/, /\badvogad/, /\bprocon\b/, /\bprocesso\b/))
    return { ...base, intencao: "nao_reconhece", rotulo: "Não reconhece ou contesta a dívida. Responda com honestidade, sem pressionar.", sensivel: true };
  if (tem(t, /\bja paguei\b/, /\bpaguei\b/, /\bcomprovante\b/, /\bta pago\b/, /\besta pago\b/, /\bfiz o pix\b/))
    return { ...base, intencao: "ja_pagou", rotulo: "Diz que já pagou. Confira o pagamento antes de qualquer cobrança.", sensivel: true };
  if (tem(t, /\bparcel/, /\bem vezes\b/, /\bdividir\b/, /\bentrada\b/))
    return comData("pediu_parcelar", "Quer parcelar. Monte o acordo dentro do limite da carteira.");
  if (tem(t, /\bdesempregad/, /\bsem (dinheiro|condic)/, /\bnao tenho como\b/, /\bnao consigo pagar\b/, /\bta dificil\b/, /\bapertad/))
    return comData("sem_condicao", "Diz que está sem condição agora. Ofereça parcelar ou marque um retorno.");
  if (tem(t, /\bconsigo pagar\b/, /\bvou pagar\b/, /\bposso pagar\b/, /\bpago (no |dia|amanha|hoje|semana|sexta|segunda|depois)/, /\bte pago\b/, /\bpagar (dia|no dia|amanha|semana|quando)\b/))
    return comData("promessa", "Prometeu pagar.");
  if (tem(t, /\bquero (pagar|quitar|resolver|negociar)\b/, /\bmanda o pix\b/, /\bme (manda|passa|envia) o pix\b/, /\bqual (o|e o) pix\b/, /\bchave pix\b/, /\bboleto\b/, /\bcomo (eu )?pago\b/, /\bpode mandar\b/))
    return { ...base, intencao: "quer_pagar", rotulo: "Quer pagar agora. Gere o Pix e acompanhe até cair." };
  if (tem(t, /\bme (chama|liga|procura)\b/, /\bfala comigo\b/, /\bdepois (eu )?(vejo|falo|te falo)\b/, /\bvou ver\b/, /\bmais tarde\b/))
    return comData("pediu_retorno", "Pediu para falar depois. Marque o retorno.");
  if (tem(t, /\bqual (e )?o valor\b/, /\bquanto (e|fica|da)\b/, /\bvalor\b/, /\bdesconto\b/))
    return { ...base, intencao: "pergunta_valor", rotulo: "Perguntou o valor. Passe a proposta à vista e a parcelada." };
  if (tem(t, /^\s*(nao|n)\b/, /\bnao quero\b/, /\bnao vou pagar\b/, /\bnao tenho interesse\b/))
    return { ...base, intencao: "recusa", rotulo: "Recusou. Respeite; não insista no mesmo dia." };
  return comData("outro", "Respondeu. Leia e decida o próximo passo.");
}
