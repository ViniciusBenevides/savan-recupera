-- 018 — Segmentação de tipo de chip + múltiplos números de teste
-- Objetivos:
--  #1 tipo do número (informativo): físico, eSIM virtual, VoIP, número virtual só-API
--  #2 permitir VÁRIOS números de teste (antes era um só em numero_teste = {e164, ativo})

-- ───────────────────────── #1 tipo do chip (segmentação) ─────────────────────────
alter table chips add column if not exists tipo text not null default 'fisico'
  check (tipo in ('fisico','esim','voip','virtual_api'));
comment on column chips.tipo is
  'fisico = SIM físico; esim = eSIM (chip virtual de operadora); voip = número VoIP; '
  'virtual_api = número virtual que não recebe chamada/SMS, só serve para a API do '
  'WhatsApp (não conecta por QR/Z-API). Campo informativo: não altera o disparo.';

-- ───────────────────────── #2 múltiplos números de teste ─────────────────────────
-- Migra o formato antigo {e164, ativo} para {numeros: [{e164, label, ativo}]}.
-- Idempotente: só converte se ainda não existir a chave nova `numeros`.
update configuracoes
set valor = jsonb_build_object(
      'numeros',
      case
        when coalesce(valor->>'e164', '') <> '' then
          jsonb_build_array(jsonb_build_object(
            'e164',  valor->>'e164',
            'label', 'Principal',
            'ativo', coalesce((valor->>'ativo')::boolean, false)))
        else '[]'::jsonb
      end),
    atualizado_em = now()
where chave = 'numero_teste'
  and not (valor ? 'numeros');

-- garante a linha existir (instalações novas) já no formato de lista
insert into configuracoes (chave, valor, descricao)
values ('numero_teste',
        '{"numeros": []}'::jsonb,
        'Números que recebem as mensagens no modo teste (definidos na tela de Chips). Lista de {e164, label, ativo}.')
on conflict (chave) do nothing;
