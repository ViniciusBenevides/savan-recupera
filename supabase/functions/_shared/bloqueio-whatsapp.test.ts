import { assertEquals } from "jsr:@std/assert@1";
import {
  bloqueioVigente,
  lerBloqueioWhatsapp,
  statusComBloqueio,
  TRAVA_SEM_FIM_MS,
} from "./bloqueio-whatsapp.ts";

const AGORA = new Date("2026-09-16T15:00:00.000Z");

Deno.test("a copia do Chatwoot do Chip 2 em 16/09 e bloqueio ativo ate 18:38 UTC", () => {
  // O valor exato que estava no inbox 12 quando o chip caiu pela quarta vez.
  const b = lerBloqueioWhatsapp({
    is_active: true,
    enforcement_type: "RESTRICT_ALL_COMPANIONS",
    time_enforcement_ends: "2026-09-16T18:38:42.000Z",
  }, AGORA);
  assertEquals(b, {
    ativo: true, ate: "2026-09-16T18:38:42.000Z", tipo: "RESTRICT_ALL_COMPANIONS", semFimInformado: false,
  });
});

Deno.test("a resposta do baileys-api (camelCase) tem o mesmo significado", () => {
  const b = lerBloqueioWhatsapp({
    isActive: true, enforcementType: "WEB_COMPANION_ONLY", timeEnforcementEnds: "2026-09-16T18:38:42.000Z",
  }, AGORA);
  assertEquals(b?.ativo, true);
  assertEquals(b?.ate, "2026-09-16T18:38:42.000Z");
  assertEquals(b?.tipo, "WEB_COMPANION_ONLY");
});

Deno.test("quem decide e isActive: DEFAULT com isActive true continua bloqueado", () => {
  // O Baileys troca tipo desconhecido por DEFAULT ("sem restricao"). Confiar no tipo liberaria o chip.
  const b = lerBloqueioWhatsapp({
    isActive: true, enforcementType: "DEFAULT", timeEnforcementEnds: "2026-09-16T16:00:00.000Z",
  }, AGORA);
  assertEquals(b?.ativo, true);
});

Deno.test("bloqueio liberado vira ativo false e sem data", () => {
  // Forma exata que o chip 1 (inbox 10) tinha em 17/09.
  assertEquals(
    lerBloqueioWhatsapp({ is_active: false, enforcement_type: "DEFAULT" }, AGORA),
    { ativo: false, ate: null, tipo: "DEFAULT", semFimInformado: false },
  );
});

Deno.test("fim no passado e bloqueio encerrado, mesmo com is_active true", () => {
  // O que sobra no Chatwoot quando o chip caiu antes de o WhatsApp avisar que liberou.
  const b = lerBloqueioWhatsapp({ is_active: true, time_enforcement_ends: "2026-09-16T14:59:59.000Z" }, AGORA);
  assertEquals(b?.ativo, false);
  assertEquals(b?.ate, null);
});

Deno.test("ativo sem horario de fim trava por uma hora (falha fechada)", () => {
  for (const fim of [undefined, null, "", "0", 0]) {
    const b = lerBloqueioWhatsapp({ isActive: true, timeEnforcementEnds: fim }, AGORA);
    assertEquals(b?.ativo, true);
    assertEquals(b?.semFimInformado, true);
    assertEquals(b?.ate, new Date(AGORA.getTime() + TRAVA_SEM_FIM_MS).toISOString());
  }
});

Deno.test("epoch em segundos (formato cru do WhatsApp) e em milissegundos", () => {
  const seg = Math.floor(new Date("2026-09-16T18:38:42.000Z").getTime() / 1000);
  assertEquals(lerBloqueioWhatsapp({ isActive: true, timeEnforcementEnds: String(seg) }, AGORA)?.ate, "2026-09-16T18:38:42.000Z");
  assertEquals(lerBloqueioWhatsapp({ isActive: true, timeEnforcementEnds: seg * 1000 }, AGORA)?.ate, "2026-09-16T18:38:42.000Z");
});

Deno.test("sem estado nenhum e 'nao sei', nao 'sem bloqueio'", () => {
  assertEquals(lerBloqueioWhatsapp(null, AGORA), null);
  assertEquals(lerBloqueioWhatsapp(undefined, AGORA), null);
  assertEquals(lerBloqueioWhatsapp({}, AGORA), null);
  assertEquals(lerBloqueioWhatsapp("ativo", AGORA), null);
  assertEquals(lerBloqueioWhatsapp([], AGORA), null);
});

Deno.test("isActive diferente de true literal nao conta como ativo", () => {
  assertEquals(lerBloqueioWhatsapp({ isActive: "true", timeEnforcementEnds: "2026-09-16T18:00:00Z" }, AGORA)?.ativo, false);
});

Deno.test("bloqueioVigente olha so a data gravada", () => {
  assertEquals(bloqueioVigente("2026-09-16T18:38:42.000Z", AGORA), true);
  assertEquals(bloqueioVigente("2026-09-16T15:00:00.000Z", AGORA), false);
  assertEquals(bloqueioVigente(null, AGORA), false);
  assertEquals(bloqueioVigente(undefined, AGORA), false);
  assertEquals(bloqueioVigente("lixo", AGORA), false);
});

Deno.test("com bloqueio, ativo e aquecendo viram pausado; o resto fica como esta", () => {
  assertEquals(statusComBloqueio("aquecendo", true), "pausado");
  assertEquals(statusComBloqueio("ativo", true), "pausado");
  for (const s of ["conectado", "pausado", "desconectado", "banido", "cadastrado"]) {
    assertEquals(statusComBloqueio(s, true), s);
  }
  assertEquals(statusComBloqueio("aquecendo", false), "aquecendo");
  assertEquals(statusComBloqueio("ativo", false), "ativo");
});
