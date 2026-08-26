-- ADR-0005 — cada chip sai por seu próprio proxy.
--
-- A operação roda numa VPS única (Coolify), então sem isto todos os números compartilhariam um IP
-- de saída — que é a causa nº 3 do §31, onde dois chips no mesmo IP caíram juntos.
--
-- O QUE NÃO ESTÁ AQUI, DE PROPÓSITO: a credencial do proxy. Ela vive na Evolution, que é quem a
-- usa, pelo mesmo princípio que mantém a sessão do WhatsApp fora do nosso banco. Aqui fica só o
-- rótulo — o suficiente para o painel dizer "este chip sai pelo proxy X" e para o operador saber
-- qual trocar quando o número cair, sem que o segredo precise existir em dois lugares.
--
-- Idempotente: pode rodar duas vezes seguidas.

alter table chips add column if not exists proxy_rotulo text;
alter table chips add column if not exists proxy_definido_em timestamptz;

comment on column chips.proxy_rotulo is
  'Identificação legível do proxy deste chip (ex.: "residencial-br-03"). NÃO é credencial — a '
  'configuração real vive na Evolution, em POST /proxy/set/{instance}. Nulo = sai pelo IP do servidor.';

comment on column chips.proxy_definido_em is
  'Quando o proxy foi aplicado à instância pela última vez. Serve para saber se a troca depois de '
  'uma queda realmente aconteceu.';

-- Quais chips estão sem proxy — a consulta que o painel faz para avisar do risco de IP compartilhado.
create index if not exists idx_chips_sem_proxy
  on chips (id) where proxy_rotulo is null;
