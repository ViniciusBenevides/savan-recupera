# Remodelagem do canal — Roadmap das fatias

**Goal:** Migrar a operação da Meta Cloud API (banida) para Evolution/Baileys com números virtuais, de
modo que a queda de um número não perca conversa nenhuma, e reduzir o risco de denúncia com opt-in
obrigatório, fluxo mais suave e ritmo de 2 mensagens/hora por chip.

**Decisões que governam tudo:** [ADR-0001](../../adr/0001-conversa-pertence-ao-devedor.md) ·
[ADR-0002](../../adr/0002-envio-direto-pela-evolution.md) ·
[ADR-0003](../../adr/0003-opt-in-como-portao-obrigatorio.md) ·
[ADR-0004](../../adr/0004-numeros-voip-e-aquecimento-como-conselho.md)
**Vocabulário:** [CONTEXT.md](../../../CONTEXT.md) · **Canal:** [Baileys — Guia Operacional](<../../../Guias Operacionais/Baileys — Guia Operacional.md>)

---

## Por que são seis planos e não um

Este trabalho atravessa seis subsistemas que não compartilham código: schema, transporte, continuidade,
conversa, ritmo e migração de base. Um plano único obrigaria a escrever, hoje, código detalhado contra
módulos que ainda não existem — o que produz plano errado, não plano completo. Cada fatia abaixo entrega
software que funciona e é testável sozinho, e o plano detalhado de cada uma é escrito quando a anterior
tiver aterrissado.

**Este roadmap não substitui os planos detalhados.** Ele define fronteiras, ordem e critério de pronto.

---

## Estado atual (verificado em 25/08/2026)

| Item | Estado |
|---|---|
| Conector | `chips.conector` aceita **só** `meta_cloud` (migration 031). WABA banida desde 17/08 |
| Suíte de testes | **26 testes Deno passando** — `npx -y deno@2 test supabase/functions/_shared/` |
| Deno | **Não está no PATH.** Use `npx -y deno@2` (verificado: deno 2.9.5) |
| Dashboard | Sem script de teste. Verificação é `npx tsc --noEmit` + `npm run build` |
| Navegação | 4 áreas (Início · Carteiras · Conversas · Ajustes). Coisas da Meta já vivem em Ajustes → Integrações |
| Fluxo do robô | v2 com 31 etapas e 297 falas reais, em `carteiras.roteiro` |
| Migrations | Numeradas até `044`, depois com timestamp. A mais recente: `20260825120000` |

---

## As seis fatias

### Fatia 1 — O chip volta a ter conector, e o padrão é Baileys

**Entrega sozinha:** dá para cadastrar um chip Baileys no painel, com o nome da instância da Evolution,
e o sistema o reconhece como conector válido. Nada envia ainda. O código da Meta continua inteiro e
acessível, marcado como canal suspenso.

**Depende de:** nada.

**Arquivos:** migration nova · `supabase/functions/_shared/conector.ts` (+ teste) ·
`dashboard/src/app/api/chips/route.ts` e `[id]/route.ts` · `dashboard/src/app/(dash)/chips/novo/flow.tsx` ·
`dashboard/src/app/(dash)/ajustes/_secoes/integracoes.tsx` e `meta-templates.tsx`

**Pronto quando:** testes novos passam, `tsc --noEmit` limpo, `npm run build` OK, e a migration roda duas
vezes seguidas sem erro (idempotência).

**Plano detalhado:** [2026-08-25-fatia-1-conector-baileys.md](./2026-08-25-fatia-1-conector-baileys.md)

---

### Fatia 2 — Transporte: enviar pela Evolution e espelhar no Chatwoot

**Entrega sozinha:** o sistema envia uma mensagem de teste por um chip Baileys, com presença e
"digitando…" proporcionais ao texto, e ela aparece no Chatwoot com autoria correta.

**Depende de:** Fatia 1.

**Escopo:** cliente da Evolution (`dashboard/src/lib/evolution.ts` + equivalente em `_shared`) ·
provisionar instância e ler QR pelo painel · `campanha-lote` e `disparar-teste` passam a enviar direto ·
`chatwoot-sync` reconcilia a corrida de autoria já conhecida do §37 · `contato-criar` **para de sondar
`on_whatsapp`** e passa a marcar `sem_whatsapp` a partir do erro real de envio.

**Risco conhecido:** a corrida entre a resposta da API e o webhook do Chatwoot já marcou uma abordagem do
robô como humana em produção. A reconciliação por id de mensagem preservando autoria é requisito, não
melhoria.

---

### Fatia 3 — Continuidade: dossiê, índice de saúde e failover

**Entrega sozinha:** um chip é desativado à mão e outro assume; o robô do número novo escreve já sabendo
tudo que o antigo disse, sem repetir nada.

**Depende de:** Fatia 1 (Fatia 2 só para exercitar de ponta a ponta).

**Escopo:** dossiê por devedor atravessando todos os chips · índice de saúde por **taxa de recibo de
entrega** substituindo o semáforo da Meta · `401` = morte imediata e automática · degradação = abordagem
travada + failover proposto com confirmação · o anúncio de troca de número só quando a conversa estava
viva · tela do dossiê na ficha do devedor.

**Cuidado:** o `bot-turno` já carrega histórico por `devedor_id` desde o §16 e o `fn_reatribuir_chip` já
existe. Esta fatia estende o que existe; não reescreve.

---

### Fatia 4 — Opt-in e fluxo v3

**Entrega sozinha:** uma conversa de teste percorre o novo portão: pedido de permissão → sim → confirmação
de identidade → assunto. Sem o sim, nada de CPF, valor, ano ou processo sai.

**Depende de:** Fatia 1. Independente das 2 e 3.

**Escopo:** as 31 etapas e 297 falas reais **preservadas** · nova etapa de permissão à frente de tudo, com
primeiro nome e sem pergunta de identidade · duas portas para o "sim" (assunto destrava; "quem é você"
vai para esclarecimento, uma vez só) · follow-up reduzido de 3 para 1, em 72h · "não" explícito vira trava
permanente de banco, válida para todos os chips · poda do que pressiona nas etapas de desconto extra e
contestação · versionamento do fluxo (conversa em andamento não muda de versão no meio).

---

### Fatia 5 — Ritmo e freios

**Entrega sozinha:** um chip configurado a 2/h recusa a terceira abordagem da hora, e o freio global
desacelera todos os chips de uma vez.

**Depende de:** Fatia 1.

**Escopo:** ritmo por chip continua sendo a regra (`limite_hora_override` já existe) · **freio global da
operação**, novo, desligado por padrão · aquecimento permanece **conselho** com veredicto de risco
visível, nunca trava ([ADR-0004](../../adr/0004-numeros-voip-e-aquecimento-como-conselho.md)) · a
sondagem `on_whatsapp` sai de vez.

---

### Fatia 6 — Os três baldes e a volta da base

**Entrega sozinha:** os 2.555 devedores são classificados em três baldes e a fila respeita a
classificação.

**Depende de:** Fatias 3 e 4.

**Escopo:** **balde 1** (respondeu alguma coisa) → recontato com continuidade explícita, prioridade máxima ·
**balde 2** (nunca respondeu) → volta ao fim da fila, recebe o opt-in como primeira vez, sem citar o
contato anterior · **balde 3** (pediu não perturbe, reclamou ou denunciou) → **nunca mais, por trava de
banco** · preservação das 438 conversas e 3 escaladas do §38.

---

## Ordem e paralelismo

```
Fatia 1 ──┬── Fatia 2 ──┐
          ├── Fatia 3 ──┼── Fatia 6
          ├── Fatia 4 ──┘
          └── Fatia 5
```

As fatias 2, 3, 4 e 5 são independentes entre si depois da 1. A 6 fecha o ciclo.

---

## O que NÃO está neste roadmap

Estas são operações em serviço externo e exigem autorização específica antes de qualquer execução, pela
[política de credenciais](<../../../Guias Operacionais/Credenciais — Política para Agentes.md>):

- Subir a Evolution API no Coolify e configurar backup do Postgres dela **testado por restauração real**.
- Comprar, registrar e vincular os números.
- Aplicar migration em produção, redeployar Edge Functions e recriar workflows do n8n.
- Qualquer envio para número real.

O código das seis fatias fica pronto e testado antes de qualquer uma dessas.
