-- A funcao historica de pagamento nao alterava conversas que ja estavam
-- encerradas. Este trigger complementar faz o pagamento confirmado ter
-- precedencia sobre qualquer encerramento anterior.

create or replace function public.fn_marcar_desfecho_pagamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('recebido', 'confirmado')
     and (tg_op = 'INSERT' or old.status not in ('recebido', 'confirmado')) then
    update public.conversas
    set estado = 'pago',
        motivo_encerramento = 'pagamento_confirmado',
        proximo_followup_em = null
    where devedor_id = new.devedor_id
      and (estado <> 'pago' or motivo_encerramento is distinct from 'pagamento_confirmado');
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_marcar_desfecho_pagamento()
  from public, anon, authenticated;

drop trigger if exists trg_marcar_desfecho_pagamento on public.pagamentos;
create trigger trg_marcar_desfecho_pagamento
after insert or update on public.pagamentos
for each row execute function public.fn_marcar_desfecho_pagamento();
