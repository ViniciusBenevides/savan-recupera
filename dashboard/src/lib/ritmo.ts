// Assessor de ritmo de envio (§33).
//
// A tela aceitava qualquer configuração sem opinar — e o incidente da §31 (2 chips restringidos com
// 3 envios) mostrou que o operador não tem como saber sozinho o que é seguro. Aqui fica o julgamento,
// em função pura, para a Campanha e o card do chip mostrarem o mesmo veredicto.
//
// Calibração: benchmark do cnpj.biz (mesma categoria de risco — prospecção fria em WhatsApp não
// oficial). A interface deles alerta acima de 20–30 msg/h; as conexões reais rodam a 5,5–10 msg/h;
// exigem intervalo mínimo de 3 min para disparo em massa; e recomendam ≤250/dia na 1ª semana.

export type NivelRitmo = "seguro" | "atencao" | "risco";

export type Veredicto = {
  nivel: NivelRitmo;
  titulo: string;
  explicacao: string;
};

export type EntradaRitmo = {
  /** teto de mensagens por hora do chip */
  msgsHora: number;
  /** teto de mensagens por dia do chip. Ausente = o chip usa a curva por idade, sem teto manual */
  limiteDia?: number | null;
  /** menor intervalo possível entre dois envios, em segundos */
  intervaloMinSegundos?: number;
  /** dias desde a ativação do chip (undefined = desconhecido) */
  idadeDias?: number;
};

export const RITMO_HORA_ALERTA = 30; // acima disso a UI deles já alerta
export const RITMO_HORA_IDEAL = 10;  // faixa em que as conexões reais deles operam
export const INTERVALO_MIN_SEGURO = 180; // 3 min
export const TETO_DIA_AQUECIMENTO = 250; // 1ª semana

/**
 * Classifica a configuração de disparo. Devolve o veredicto MAIS grave que se aplica —
 * a tela mostra um só, e mostrar o pior é o que evita o falso conforto.
 */
export function avaliarRitmo(e: EntradaRitmo): Veredicto {
  const { msgsHora, limiteDia, intervaloMinSegundos, idadeDias } = e;

  if (msgsHora > RITMO_HORA_ALERTA) {
    return {
      nivel: "risco",
      titulo: "Volume por hora elevado",
      explicacao: `${msgsHora} mensagens por hora é acima do que se considera seguro para número não oficial. ` +
        `Baixe para 20–30 por hora — acima disso o risco de bloqueio e denúncia sobe muito.`,
    };
  }

  if (intervaloMinSegundos != null && intervaloMinSegundos < INTERVALO_MIN_SEGURO) {
    return {
      nivel: "risco",
      titulo: "Intervalo curto entre envios",
      explicacao: `Com intervalo mínimo de ${intervaloMinSegundos}s as mensagens saem em rajada. ` +
        `Para disparo em massa o piso recomendado é de 3 minutos entre um envio e o próximo.`,
    };
  }

  if (idadeDias != null && idadeDias < 7 && limiteDia != null && limiteDia > TETO_DIA_AQUECIMENTO) {
    return {
      nivel: "risco",
      titulo: "Chip novo com volume alto",
      explicacao: `Este chip tem ${idadeDias} dia(s) de uso e está liberado para ${limiteDia} envios por dia. ` +
        `Na primeira semana não passe de ${TETO_DIA_AQUECIMENTO} — número novo com volume alto é o perfil clássico de bloqueio.`,
    };
  }

  if (msgsHora > RITMO_HORA_IDEAL) {
    return {
      nivel: "atencao",
      titulo: "Ritmo equilibrado",
      explicacao: `${msgsHora} mensagens por hora está dentro do aceitável, mas sem folga. ` +
        `Mantenha a qualidade das mensagens e acompanhe a taxa de resposta para não virar denúncia.`,
    };
  }

  // Só cita o teto diário quando ele foi realmente informado. Sem essa guarda, um chip que usa a
  // curva por idade aparecia como "e 0 por dia", que soa como chip travado — e não é o caso.
  return {
    nivel: "seguro",
    titulo: "Configuração segura",
    explicacao: (limiteDia != null && limiteDia > 0
      ? `${msgsHora} mensagens por hora e ${limiteDia} por dia é um ritmo conservador, `
      : `${msgsHora} mensagens por hora é um ritmo conservador, `) +
      `o que ajuda a preservar a reputação do número.`,
  };
}

/** Ritmo efetivo (msgs/hora) que um intervalo entre mensagens produz. */
export function ritmoPorIntervalo(intervaloSegundos: number): number {
  if (intervaloSegundos <= 0) return 0;
  return Math.round(3600 / intervaloSegundos);
}

/** Em quanto tempo a cota do dia acaba, no ritmo atual. Devolve minutos (null = não acaba/sem ritmo). */
export function minutosAteEsgotar(restanteDia: number, msgsHora: number): number | null {
  if (msgsHora <= 0 || restanteDia <= 0) return null;
  return Math.round((restanteDia / msgsHora) * 60);
}

/** "2h30" / "45min" — formatação curta para os cards. */
export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos}min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
