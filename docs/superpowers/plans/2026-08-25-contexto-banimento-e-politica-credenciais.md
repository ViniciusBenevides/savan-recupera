# Contexto do Banimento e Política de Credenciais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar o banimento permanente da WABA e estabelecer a mesma política de uso de credenciais para Codex e Claude Code.

**Architecture:** O histórico operacional ficará em `contexto-projeto.md`. Uma matriz central em `Guias Operacionais` mapeará nomes de variáveis para skills e guias; `AGENTS.md` e `CLAUDE.md` aplicarão a mesma regra sem duplicar segredos.

**Tech Stack:** Markdown, instruções de agentes Codex/Claude Code, arquivos `.env` locais.

---

### Task 1: Registrar o incidente do WhatsApp

**Files:**
- Modify: `contexto-projeto.md`

- [x] **Step 1: Atualizar o resumo inicial**

Registrar o banimento permanente como a atualização mais recente e apontar para a nova seção detalhada.

- [x] **Step 2: Adicionar a seção do incidente**

Documentar ativos, cronologia, diagnóstico, impacto, ações proibidas e caminho legítimo de continuidade.

### Task 2: Criar a política central de credenciais

**Files:**
- Create: `Guias Operacionais/Credenciais — Política para Agentes.md`
- Modify: `.gitignore`
- Modify: `contexto-projeto.md`

- [x] **Step 1: Mapear apenas os nomes encontrados no `.env`**

Relacionar prefixos de variáveis aos guias e skills existentes sem copiar valores.
Para Supabase, carregar e registrar explicitamente
`.agents/skills/supabase-postgres-best-practices/SKILL.md` e
`C:/Users/vsben/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase-postgres-best-practices/SKILL.md`,
além das skills gerais de Supabase aplicáveis.

- [x] **Step 2: Fixar a regra sem MCP**

Determinar que autenticação vem apenas do `.env`, orientação vem das skills e dos guias locais, e MCP não pode ser usado para credenciais ou operações dos serviços.

### Task 3: Espelhar instruções entre Codex e Claude Code

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

- [x] **Step 1: Criar instruções do Codex**

Exigir leitura da política central, das skills aplicáveis e do guia do serviço antes de tocar em credenciais.

- [x] **Step 2: Criar instruções equivalentes do Claude Code**

Manter o mesmo conteúdo normativo e os mesmos bloqueios de segurança.

### Task 4: Verificar a entrega

**Files:**
- Verify: `contexto-projeto.md`
- Verify: `Guias Operacionais/Credenciais — Política para Agentes.md`
- Verify: `AGENTS.md`
- Verify: `CLAUDE.md`

- [x] **Step 1: Verificar ausência de valores secretos**

Comparar somente nomes de variáveis e confirmar que nenhum valor do `.env` entrou nos arquivos criados ou alterados.

- [x] **Step 2: Verificar paridade das instruções**

Confirmar que `AGENTS.md` e `CLAUDE.md` possuem a mesma política de credenciais e que todos os links locais existem.
