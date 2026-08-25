# Fatia 1 — O chip volta a ter conector, e o padrão é Baileys

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o sistema aceitar chips de conector `baileys` (Evolution API) como padrão, mantendo o
código da Meta Cloud API inteiro e acessível porém marcado como canal suspenso.

**Architecture:** A migration `031` fechou `chips.conector` no valor único `meta_cloud`. Esta fatia
reabre o campo para dois valores, com `baileys` como padrão, e acrescenta ao chip o nome da instância da
Evolution que o representa. A lógica de decisão — qual conector, qual nome de instância, se o chip pode
enviar — vai para um módulo puro e testado em `_shared`, para que Edge Functions e dashboard leiam a
mesma regra. Nada envia mensagem nesta fatia.

**Tech Stack:** Postgres (Supabase) · TypeScript em Deno (Edge Functions) · Next.js 15 App Router
(dashboard) · testes com `jsr:@std/assert` rodados por `npx -y deno@2`

**Contexto obrigatório antes de começar:** [ADR-0004](../../adr/0004-numeros-voip-e-aquecimento-como-conselho.md)
(por que os chips caem tanto) e [CONTEXT.md](../../../CONTEXT.md) (o que "chip" significa aqui).

---

## Pré-requisitos do ambiente

O Deno **não está no PATH desta máquina**. Todos os comandos de teste usam `npx -y deno@2` (verificado:
deno 2.9.5). Antes de começar, confirme a linha de base:

```bash
npx -y deno@2 test supabase/functions/_shared/
```

Esperado: `ok | 26 passed | 0 failed`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260825140000_conector_baileys.sql` (criar) | Reabre `chips.conector`, acrescenta `chips.instancia_evolution` |
| `supabase/functions/_shared/conector.ts` (criar) | Lógica pura: conector válido, nome de instância, se o chip pode enviar |
| `supabase/functions/_shared/conector.test.ts` (criar) | Testes do acima |
| `dashboard/src/app/api/chips/route.ts` (modificar) | Novo ramo de cadastro para conector `baileys` |
| `dashboard/src/app/(dash)/ajustes/_secoes/integracoes.tsx` (modificar) | Marca a Meta como canal suspenso |

---

## Task 1: Migration — reabrir o conector

**Files:**
- Create: `supabase/migrations/20260825140000_conector_baileys.sql`

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/20260825140000_conector_baileys.sql`:

```sql
-- Reabre o conector do chip: a Meta Cloud API deixou de ser o único caminho.
-- A WABA da MC CRED está banida permanentemente desde 17/08/2026 (contexto-projeto.md §38), e a
-- operação passa a rodar sobre Evolution/Baileys. O código da Meta continua inteiro: o valor
-- 'meta_cloud' segue aceito para o dia em que houver uma conta oficial de novo.
-- Idempotente: pode rodar duas vezes seguidas.

-- 1) chips.conector volta a aceitar dois valores, com baileys como padrão -------------------
alter table chips drop constraint if exists chips_conector_check;
alter table chips add constraint chips_conector_check
  check (conector in ('baileys', 'meta_cloud'));
alter table chips alter column conector set default 'baileys';

comment on column chips.conector is
  'Transporte do chip: baileys (Evolution API, padrão) ou meta_cloud (API oficial, suspensa — ver §38).';

-- 2) O nome da instância na Evolution que representa este chip ------------------------------
-- Uma instância da Evolution = um número. A credencial de sessão (chaves Signal) NUNCA vem para
-- cá: ela mora no Postgres da própria Evolution. Aqui guardamos só o identificador.
alter table chips add column if not exists instancia_evolution text;

comment on column chips.instancia_evolution is
  'Nome da instância na Evolution API que atende este chip. NÃO é credencial — a sessão do WhatsApp '
  'vive no banco da Evolution. Nulo em chip papel=equipe e em chip meta_cloud.';

create unique index if not exists chips_instancia_evolution_key
  on chips (instancia_evolution)
  where instancia_evolution is not null;
```

- [ ] **Step 2: Verificar que a sintaxe está correta**

Não há Postgres local nesta máquina, então a verificação é de leitura, não de execução. Confira à mão:

1. Todo `alter table ... add column` tem `if not exists`.
2. Todo `drop constraint` tem `if exists`.
3. O `create unique index` tem `if not exists`.
4. Nenhum `create or replace function` — as migrations 005–007 vivem só no banco e não estão no repo,
   então nada de reescrever função existente aqui.

Rodar a migration em produção **não** faz parte desta fatia e exige autorização específica.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260825140000_conector_baileys.sql
git commit -m "feat(db): reabre chips.conector para baileys e acrescenta instancia_evolution"
```

---

## Task 2: Módulo puro do conector

**Files:**
- Create: `supabase/functions/_shared/conector.ts`
- Test: `supabase/functions/_shared/conector.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `supabase/functions/_shared/conector.test.ts`:

```ts
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  chipPodeAbordar,
  conectorDoChip,
  ehConectorSuportado,
  nomeInstanciaEvolution,
} from "./conector.ts";

Deno.test("conector ausente cai no padrao baileys", () => {
  assertEquals(conectorDoChip({}), "baileys");
  assertEquals(conectorDoChip({ conector: null }), "baileys");
  assertEquals(conectorDoChip({ conector: "  " }), "baileys");
});

Deno.test("conector conhecido e preservado, desconhecido cai no padrao", () => {
  assertEquals(conectorDoChip({ conector: "meta_cloud" }), "meta_cloud");
  assertEquals(conectorDoChip({ conector: "BAILEYS" }), "baileys");
  assertEquals(conectorDoChip({ conector: "zap_qualquer" }), "baileys");
});

Deno.test("ehConectorSuportado aceita so os dois valores do check do banco", () => {
  assertEquals(ehConectorSuportado("baileys"), true);
  assertEquals(ehConectorSuportado("meta_cloud"), true);
  assertEquals(ehConectorSuportado("zap_qualquer"), false);
  assertEquals(ehConectorSuportado(""), false);
});

Deno.test("nome de instancia e um slug estavel e unico por chip", () => {
  assertEquals(nomeInstanciaEvolution("Chip 1 — Goiás", 7), "chip-1-goias-7");
  assertEquals(nomeInstanciaEvolution("  ", 12), "chip-12");
  assertEquals(nomeInstanciaEvolution("A/B\\C:D", 3), "a-b-c-d-3");
});

Deno.test("nome de instancia nao passa de 48 caracteres", () => {
  const gerado = nomeInstanciaEvolution("n".repeat(200), 99);
  assertEquals(gerado.length <= 48, true);
  assertEquals(gerado.endsWith("-99"), true);
});

Deno.test("nome de instancia exige id de chip valido", () => {
  assertThrows(() => nomeInstanciaEvolution("Chip", 0));
  assertThrows(() => nomeInstanciaEvolution("Chip", -1));
});

Deno.test("chip baileys so aborda com instancia definida", () => {
  assertEquals(
    chipPodeAbordar({ conector: "baileys", papel: "bot", instancia_evolution: "chip-1" }),
    { pode: true },
  );
  assertEquals(
    chipPodeAbordar({ conector: "baileys", papel: "bot", instancia_evolution: null }),
    { pode: false, motivo: "sem_instancia_evolution" },
  );
});

Deno.test("chip meta_cloud nao aborda: canal suspenso", () => {
  assertEquals(
    chipPodeAbordar({ conector: "meta_cloud", papel: "bot", instancia_evolution: null }),
    { pode: false, motivo: "canal_meta_suspenso" },
  );
});

Deno.test("chip de equipe nunca aborda: escalador so recebe", () => {
  assertEquals(
    chipPodeAbordar({ conector: "baileys", papel: "equipe", instancia_evolution: "chip-9" }),
    { pode: false, motivo: "chip_de_equipe" },
  );
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
npx -y deno@2 test supabase/functions/_shared/conector.test.ts
```

Esperado: FALHA com `Module not found` apontando para `./conector.ts`.

- [ ] **Step 3: Escrever a implementação mínima**

Crie `supabase/functions/_shared/conector.ts`:

```ts
/**
 * Qual transporte atende um chip e se ele está apto a abordar.
 *
 * "Abordar" é mandar mensagem para quem não escreveu primeiro (ver CONTEXT.md). Responder quem
 * escreveu não passa por aqui — um chip degradado continua respondendo.
 */

export const CONECTORES = ["baileys", "meta_cloud"] as const;
export type Conector = (typeof CONECTORES)[number];

export const CONECTOR_PADRAO: Conector = "baileys";

/** Limite defensivo: nomes longos de instância complicam a URL da Evolution. */
const MAX_NOME_INSTANCIA = 48;

export function ehConectorSuportado(valor: unknown): valor is Conector {
  return typeof valor === "string" && (CONECTORES as readonly string[]).includes(valor);
}

/** Conector do chip, tolerante a nulo/maiúsculas/lixo. Desconhecido cai no padrão. */
export function conectorDoChip(chip: { conector?: unknown }): Conector {
  const bruto = typeof chip.conector === "string" ? chip.conector.trim().toLowerCase() : "";
  return ehConectorSuportado(bruto) ? bruto : CONECTOR_PADRAO;
}

/**
 * Nome da instância na Evolution. O id do chip vai no fim para garantir unicidade mesmo quando
 * dois chips têm o mesmo apelido.
 */
export function nomeInstanciaEvolution(nome: string, chipId: number): string {
  if (!Number.isInteger(chipId) || chipId <= 0) {
    throw new Error(`chipId inválido para nome de instância: ${chipId}`);
  }
  const sufixo = `-${chipId}`;
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // tira acento (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")       // tudo que não é alfanumérico vira hífen
    .replace(/^-+|-+$/g, "");          // sem hífen sobrando nas pontas

  const limite = MAX_NOME_INSTANCIA - sufixo.length;
  const prefixo = (base || "chip").slice(0, limite).replace(/-+$/g, "");
  return `${prefixo}${sufixo}`;
}

export type VeredictoAbordagem =
  | { pode: true }
  | { pode: false; motivo: "chip_de_equipe" | "canal_meta_suspenso" | "sem_instancia_evolution" };

/**
 * O chip está apto a abordar?
 *
 * Nada aqui olha ritmo, janela ou aquecimento — isso é da Fatia 5. Aqui é só o transporte:
 * existe caminho de saída para este chip?
 */
export function chipPodeAbordar(chip: {
  conector?: unknown;
  papel?: unknown;
  instancia_evolution?: unknown;
}): VeredictoAbordagem {
  // Escalador humano recebe a conversa escalada; nunca inicia contato.
  if (chip.papel === "equipe") return { pode: false, motivo: "chip_de_equipe" };

  const conector = conectorDoChip(chip);

  // A WABA da MC CRED está banida (§38). O código continua no repo, o caminho fica fechado.
  if (conector === "meta_cloud") return { pode: false, motivo: "canal_meta_suspenso" };

  const instancia = typeof chip.instancia_evolution === "string"
    ? chip.instancia_evolution.trim()
    : "";
  if (!instancia) return { pode: false, motivo: "sem_instancia_evolution" };

  return { pode: true };
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

```bash
npx -y deno@2 test supabase/functions/_shared/conector.test.ts
```

Esperado: `ok | 9 passed | 0 failed`.

- [ ] **Step 5: Rodar a suíte inteira, para garantir que nada quebrou**

```bash
npx -y deno@2 test supabase/functions/_shared/
```

Esperado: `ok | 35 passed | 0 failed` (26 da linha de base + 9 novos).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/conector.ts supabase/functions/_shared/conector.test.ts
git commit -m "feat(shared): modulo puro de conector do chip com baileys como padrao"
```

---

## Task 3: Cadastro de chip Baileys na API

**Files:**
- Modify: `dashboard/src/app/api/chips/route.ts`

O arquivo tem hoje dois ramos: `papel === "equipe"` (escalador só registrado) e, abaixo dele, o cadastro
Meta. Vamos inserir um terceiro ramo **entre os dois**, e tornar o ramo Meta explícito em vez de padrão.

- [ ] **Step 1: Copiar a lógica de nome de instância para o dashboard**

O dashboard não consegue importar de `supabase/functions/_shared` (runtime diferente, sem caminho de
módulo compartilhado). Crie `dashboard/src/lib/conector.ts` espelhando **apenas** o que a API precisa:

```ts
// Espelho de supabase/functions/_shared/conector.ts — mantenha os dois em sincronia.
// A fonte da verdade e os testes estão do lado do Deno.

export const CONECTORES = ["baileys", "meta_cloud"] as const;
export type Conector = (typeof CONECTORES)[number];
export const CONECTOR_PADRAO: Conector = "baileys";

const MAX_NOME_INSTANCIA = 48;

export function ehConectorSuportado(valor: unknown): valor is Conector {
  return typeof valor === "string" && (CONECTORES as readonly string[]).includes(valor);
}

export function nomeInstanciaEvolution(nome: string, chipId: number): string {
  if (!Number.isInteger(chipId) || chipId <= 0) {
    throw new Error(`chipId inválido para nome de instância: ${chipId}`);
  }
  const sufixo = `-${chipId}`;
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const limite = MAX_NOME_INSTANCIA - sufixo.length;
  const prefixo = (base || "chip").slice(0, limite).replace(/-+$/g, "");
  return `${prefixo}${sufixo}`;
}
```

- [ ] **Step 2: Acrescentar o ramo Baileys na rota**

Em `dashboard/src/app/api/chips/route.ts`, acrescente o import no topo, junto dos outros:

```ts
import { nomeInstanciaEvolution } from "@/lib/conector";
```

Depois, **imediatamente após** o bloco `if (papel === "equipe") { ... }` e **antes** do comentário
`// ── Chip de bot: número oficial na Meta Cloud API`, insira:

```ts
  // ── Chip de bot no Baileys (Evolution API) — o caminho padrão ─────────────────────────
  // O chip nasce 'cadastrado': quem o conecta de fato é o QR da Evolution, na Fatia 2.
  // A sessão do WhatsApp NUNCA vem para o nosso banco — ela vive no Postgres da Evolution.
  const conectorPedido = String(body.conector ?? "baileys").trim().toLowerCase();
  if (conectorPedido === "baileys") {
    const n = normalizarTelefone(numero_e164, "movel");
    if (!n) {
      return NextResponse.json(
        { erro: "Informe o número de WhatsApp do chip, com DDD." },
        { status: 400 },
      );
    }

    const novoBaileys: Record<string, unknown> = {
      nome, status: "cadastrado", cobrador_id: dono, papel: "bot", conector: "baileys",
      numero_e164: n.e164, tipo: "virtual_api",
    };
    if (maturidade === "aquecido" || maturidade === "novo") novoBaileys.maturidade = maturidade;
    if (limite_dia_override != null && limite_dia_override !== "") {
      novoBaileys.limite_dia_override = Number(limite_dia_override);
    }
    if (limite_hora_override != null && limite_hora_override !== "") {
      novoBaileys.limite_hora_override = Number(limite_hora_override);
    }

    const { data: chipB, error: errB } = await admin
      .from("chips").insert(novoBaileys).select("id").single();
    if (errB) return NextResponse.json({ erro: errB.message }, { status: 400 });

    // O nome da instância depende do id, então só dá para calcular depois do insert.
    const instancia = nomeInstanciaEvolution(nome, chipB.id);
    const { error: errU } = await admin
      .from("chips").update({ instancia_evolution: instancia }).eq("id", chipB.id);
    if (errU) return NextResponse.json({ erro: errU.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      chip_id: chipB.id,
      conector: "baileys",
      instancia_evolution: instancia,
      numero: n.e164,
      // Conectar de verdade (QR + inbox no Chatwoot) é a Fatia 2.
      conexao_pendente: true,
    });
  }
```

- [ ] **Step 3: Tornar o ramo Meta explícito**

Logo abaixo do bloco novo, substitua a linha de comentário existente:

```ts
  // ── Chip de bot: número oficial na Meta Cloud API ─────────────────────────────────────
```

por:

```ts
  // ── Chip de bot na Meta Cloud API — canal SUSPENSO desde 17/08/2026 (§38) ─────────────
  // O caminho continua funcionando para o dia em que houver uma conta oficial de novo, mas
  // exige `conector: "meta_cloud"` explícito no corpo: ninguém cai aqui por engano.
  if (conectorPedido !== "meta_cloud") {
    return NextResponse.json(
      { erro: `Conector desconhecido: ${conectorPedido}. Use "baileys" ou "meta_cloud".` },
      { status: 400 },
    );
  }
```

- [ ] **Step 4: Verificar a tipagem**

```bash
cd dashboard && npx tsc --noEmit
```

Esperado: nenhuma saída (sucesso silencioso).

- [ ] **Step 5: Verificar o build**

```bash
cd dashboard && npm run build
```

Esperado: build completa, sem erro. A lista de rotas continua a mesma — esta fatia não cria página.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/conector.ts dashboard/src/app/api/chips/route.ts
git commit -m "feat(chips): cadastro de chip baileys e ramo meta exige conector explicito"
```

---

## Task 4: Marcar a Meta como canal suspenso no painel

**Files:**
- Modify: `dashboard/src/app/(dash)/ajustes/_secoes/integracoes.tsx`

O objetivo é a decisão do ADR-0004 ficar visível para quem usa o painel: o código da Meta está lá, mas
o canal não está no ar. Ninguém deve descobrir isso tentando cadastrar um número.

- [ ] **Step 1: Ler o arquivo antes de editar**

```bash
cat "dashboard/src/app/(dash)/ajustes/_secoes/integracoes.tsx"
```

São 31 linhas. Identifique onde a seção de templates da Meta é renderizada.

- [ ] **Step 2: Inserir o aviso acima da seção da Meta**

Imediatamente antes do bloco que renderiza os templates da Meta, insira:

```tsx
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <p className="font-medium text-amber-200">Canal oficial da Meta suspenso</p>
        <p className="mt-1 text-ink-300">
          A conta oficial de WhatsApp foi banida permanentemente em 17/08/2026 e não aceita novos
          envios. As telas abaixo continuam disponíveis para consulta e para o dia em que houver uma
          conta oficial de novo. O envio hoje sai pelos chips do canal Baileys.
        </p>
      </div>
```

> Se os tokens de cor `amber-*` ou `ink-300` não existirem no `tailwind.config.ts` deste projeto, use os
> equivalentes que a base já usa — confira em `dashboard/tailwind.config.ts` antes de escrever.

- [ ] **Step 3: Verificar tipagem e build**

```bash
cd dashboard && npx tsc --noEmit && npm run build
```

Esperado: ambos sem erro.

- [ ] **Step 4: Commit**

```bash
git add "dashboard/src/app/(dash)/ajustes/_secoes/integracoes.tsx"
git commit -m "feat(ajustes): marca o canal Meta como suspenso no painel"
```

---

## Task 5: Verificação final da fatia

- [ ] **Step 1: Suíte completa**

```bash
npx -y deno@2 test supabase/functions/_shared/
```

Esperado: `ok | 35 passed | 0 failed`.

- [ ] **Step 2: Dashboard**

```bash
cd dashboard && npx tsc --noEmit && npm run build
```

Esperado: ambos sem erro.

- [ ] **Step 3: Conferir que nada da Meta foi apagado**

```bash
git status --short
ls dashboard/src/lib/meta.ts dashboard/src/app/\(dash\)/ajustes/_secoes/meta-templates.tsx
```

Esperado: os dois arquivos existem. O `git status` não deve listar nenhuma deleção — o ADR-0004 e a
decisão do Q7 mandam **preservar** o código da Meta.

- [ ] **Step 4: Conferir a idempotência da migration por leitura**

```bash
grep -c "if not exists\|if exists" supabase/migrations/20260825140000_conector_baileys.sql
```

Esperado: `3` — uma linha com `drop constraint if exists`, uma com `add column if not exists` e uma com
`create unique index if not exists`.

---

## Definição de pronto

- [ ] 35 testes Deno passando
- [ ] `tsc --noEmit` limpo e `npm run build` OK
- [ ] `chips.conector` aceita `baileys` e `meta_cloud`, com `baileys` como padrão
- [ ] `chips.instancia_evolution` existe, é único quando preenchido, e **não guarda credencial**
- [ ] Cadastrar chip sem `conector` no corpo cria um chip Baileys
- [ ] Cadastrar chip com `conector: "meta_cloud"` continua funcionando como antes
- [ ] Nenhum arquivo da integração Meta foi apagado
- [ ] Nada foi aplicado em produção

## O que esta fatia deliberadamente NÃO faz

- Não fala com a Evolution API. Provisionar instância, ler QR e enviar é a **Fatia 2**.
- Não cria inbox no Chatwoot para chip Baileys. Também Fatia 2.
- Não mexe em ritmo, aquecimento nem janela. É a **Fatia 5**.
- Não toca no fluxo do robô nem no opt-in. É a **Fatia 4**.
- Não roda migration em produção nem redeploya função. Exige autorização específica.
