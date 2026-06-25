-- 022 — Janela de envio só em dias úteis (seg–sex) e pulando feriados nacionais
-- Objetivos:
--  #1 dias de disparo passam de seg–sáb [1,2,3,4,5,6] para dias úteis [1,2,3,4,5]
--  #2 nova flag janela_envio.pular_feriados (padrão true): não dispara em feriado nacional
--     (fixos + móveis via Páscoa, base bancária/ANBIMA — computados nas Edge Functions).
--     Feriados regionais/pontuais opcionais em janela_envio.feriados_extra = ["YYYY-MM-DD", ...].
-- Aplica a TODAS as linhas de janela_envio (global + por cobrador), preservando inicio/fim/tz.
-- Idempotente: só toca linhas que ainda não têm a chave `pular_feriados`.

update configuracoes
set valor = valor
      || jsonb_build_object('dias', '[1,2,3,4,5]'::jsonb)
      || jsonb_build_object('pular_feriados', true),
    atualizado_em = now()
where chave = 'janela_envio'
  and not (valor ? 'pular_feriados');
