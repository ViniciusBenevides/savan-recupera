/**
 * Quem escreveu uma mensagem de SAÍDA que chegou pelo Chatwoot sem ter sido registrada por nós.
 *
 * Por que importa: o robô só se cala quando a conversa está em `humano`. O painel já marca isso ao
 * responder, mas em 29/09/2026 o operador respondeu pelo WhatsApp do próprio celular do chip
 * ("vou assumir por aqui"), a mensagem entrou como se fosse do robô, e o robô respondeu por cima
 * dele mais três vezes.
 *
 * Os sinais, conferidos contra as 100 conversas mais recentes do chip 1 (29/09):
 *   · tudo o que o sistema manda pelo baileys-api leva um `messageId` que NÓS geramos
 *     (`crypto.randomUUID()` em `baileys-api-client.ts`), e o Chatwoot o guarda como `source_id`
 *     — 126 de 126 mensagens do sistema tinham UUID;
 *   · o que é digitado no celular chega sem remetente e com o id que o próprio WhatsApp gerou
 *     (hexadecimal maiúsculo, sem hífen) — exatamente as 3 mensagens do operador;
 *   · o que é digitado na tela do Chatwoot chega com `sender.type = "user"`. O usuário dono do token
 *     de integração é também o que as automações usam, então só um OUTRO usuário prova que foi gente.
 *
 * O sinal do celular só vale no canal nativo do Chatwoot (`baileys_chatwoot`). Na Evolution o id
 * das mensagens do sistema é gerado pelo próprio Baileys e não dá para separar pelo formato — ali,
 * sem outro sinal, a mensagem continua contando como do robô.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AutorSaida = {
  origem: "bot" | "humano";
  /** Um humano assumiu: o robô para até alguém devolver a conversa a ele. */
  pausarRobo: boolean;
  /** Por onde a pessoa escreveu — vira o "atendente" da conversa no painel. */
  via: "celular" | "chatwoot" | null;
};

export function classificarAutorSaida(o: {
  senderType?: string | null;
  senderId?: number | null;
  sourceId?: string | null;
  conector?: string | null;
  usuarioIntegracaoId?: number | null;
}): AutorSaida {
  const tipo = String(o.senderType ?? "").toLowerCase();
  if (tipo === "user") {
    // Sem saber quem é o usuário da integração, não dá para afirmar que foi uma pessoa — e pausar por
    // engano cala o robô com um devedor que ninguém está atendendo. Falha para o lado de não pausar.
    const outraPessoa = o.usuarioIntegracaoId != null && o.senderId != null
      && Number(o.senderId) !== Number(o.usuarioIntegracaoId);
    return { origem: "humano", pausarRobo: outraPessoa, via: outraPessoa ? "chatwoot" : null };
  }
  if (tipo === "agent_bot" || tipo === "agentbot") return { origem: "bot", pausarRobo: false, via: null };

  const id = String(o.sourceId ?? "").trim();
  if (o.conector === "baileys_chatwoot" && id && !UUID.test(id)) {
    return { origem: "humano", pausarRobo: true, via: "celular" };
  }
  return { origem: "bot", pausarRobo: false, via: null };
}

/** Como a conversa aparece no painel depois que alguém assumiu por fora dele. */
export function nomeDoAtendenteExterno(via: "celular" | "chatwoot", nomeRemetente?: string | null): string {
  if (via === "chatwoot") return String(nomeRemetente ?? "").trim() || "Chatwoot";
  return "Pelo celular do chip";
}
