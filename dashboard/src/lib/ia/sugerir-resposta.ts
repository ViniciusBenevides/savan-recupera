// Rascunho de resposta para o operador revisar (nunca é enviado sozinho).
// Segue as regras do projeto: sem ameaça, sem Serasa/SPC, sem urgência ou escassez, honestidade sobre
// dívida antiga, valor sempre vindo de fn_proposta (a IA não faz conta), "não" respeitado na hora.
import type { Leitura } from "@/lib/ia/ler-mensagem";
import { dataCurta, prazo } from "@/lib/datas";
import { brl } from "@/lib/utils";

export type Contexto = {
  nome: string;
  credor: string;              // quem era a loja original
  ano: number | null;
  divida: number;
  proposta: number | null;     // à vista, de fn_proposta
  parcelasMax: number;
  parcelaMin: number;
};

const primeiro = (nome: string) => {
  const p = (nome || "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
};

export function sugerirResposta(l: Leitura, c: Contexto): string | null {
  const n = primeiro(c.nome);
  const valor = c.proposta ?? c.divida;
  const vezes = Math.max(1, Math.min(c.parcelasMax, Math.floor(valor / Math.max(c.parcelaMin, 1))));
  // A mesma conta do acordo (centavos; a sobra vai na última parcela): a mensagem promete exatamente
  // o que o carnê vai cobrar, nem um centavo a mais.
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / vezes);
  const ultima = centavos - base * (vezes - 1);
  const parcela = vezes > 1 ? `${vezes}x de ${brl(base / 100)}${ultima !== base ? ` (a última de ${brl(ultima / 100)})` : ""}` : null;
  const dividir = parcela ? ` Também dá para dividir em até ${parcela}.` : "";
  const quando = l.data ? `${prazo(l.data) === "hoje" ? "hoje" : prazo(l.data) === "amanhã" ? "amanhã" : `no dia ${dataCurta(l.data)}`}` : null;

  switch (l.intencao) {
    case "promessa":
      return quando
        ? `Combinado, ${n}! Anoto aqui ${quando}. No dia eu te mando o Pix de ${brl(valor)} para quitar, tudo bem?`
        : `Combinado, ${n}! Qual dia fica bom para você? Assim eu já deixo anotado e te mando o Pix de ${brl(valor)} no dia.`;
    case "quer_pagar":
      return `Que bom, ${n}! Para quitar à vista fica ${brl(valor)}${c.proposta && c.proposta < c.divida ? ` (o saldo era ${brl(c.divida)})` : ""}, com termo de quitação. Vou te mandar o Pix aqui.`;
    case "pediu_parcelar":
      return parcela
        ? `Dá sim, ${n}. Consigo dividir em até ${parcela}. Quantas vezes fica melhor para você?`
        : `Dá sim, ${n}. Me diz quanto consegue pagar por mês que eu monto a proposta.`;
    case "sem_condicao":
      return `Entendo, ${n}, sem problema nenhum.${dividir} Se preferir, eu te chamo mais para frente: qual dia é melhor?`;
    case "desconfiado":
      return `Entendo a desconfiança, ${n}, é bom mesmo ter cuidado. Aqui é da MC CRED: compramos os créditos antigos da ${c.credor} e estamos oferecendo a quitação com desconto e termo. Você não precisa pagar nada agora. Quer que eu te explique melhor?`;
    case "nao_reconhece":
      return `Tudo bem, ${n}. É um saldo antigo de compra na ${c.credor}${c.ano ? `, de ${c.ano}` : ""}. Por ser antigo, o pagamento é voluntário: se não reconhecer, me avise que eu verifico com calma.`;
    case "ja_pagou":
      return `Obrigado por avisar, ${n}! Consegue me mandar o comprovante? Eu confiro e te dou retorno ainda hoje.`;
    case "pediu_retorno":
      return quando ? `Combinado, ${n}! Te chamo ${quando}.` : `Combinado, ${n}! Qual dia e horário é melhor para eu te chamar?`;
    case "pergunta_valor":
      return `O saldo${c.ano ? ` de ${c.ano}` : ""} é ${brl(c.divida)}. Para quitar à vista fica ${brl(valor)}, com termo de quitação.${dividir}`;
    case "recusa":
      return `Tudo bem, ${n}. Obrigado pelo retorno.`;
    case "nao_perturbe":
      return `Certo, ${n}. Não vamos mais te enviar mensagens. Desculpe o incômodo.`;
    case "pessoa_errada":
      return "Desculpe o engano! Vou tirar este número da nossa lista.";
    case "falecido":
      return "Sinto muito pela sua perda. Vamos encerrar o contato. Nossos sentimentos.";
    default:
      return null;
  }
}
