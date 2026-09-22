-- A forma do número (com ou sem o 9º dígito) que o WhatsApp conhece para este telefone.
--
-- Preenchida pelo `contato-criar` com UMA consulta `on-whatsapp` na primeira abordagem do telefone
-- (ver `_shared/numero-whatsapp.ts`). Lida pelo `contato-criar` e pelo `enviar-mensagem` para que o
-- contato do Chatwoot e o envio usem o número que entrega. Nula = ainda não perguntado; nesse caso
-- o envio segue com `variantesE164Br`, como antes.
alter table public.telefones_devedor add column if not exists whatsapp_e164 text;

comment on column public.telefones_devedor.whatsapp_e164 is
  'Forma do número que o WhatsApp conhece (com/sem o 9), resolvida por on-whatsapp na 1ª abordagem. Nula = não perguntado.';
