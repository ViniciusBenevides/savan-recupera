-- SAVAN Recupera — 020: funções de escopo + reescrita de RLS (isolamento por tenant)
-- Depende da 019 (papéis cobrador/credor + colunas de dono). Leitura nas páginas usa o cliente
-- anônimo (RLS), então as policies SELECT abaixo são o que de fato isola os dados por papel.

-- ============================================================
-- 1) FUNÇÕES DE ESCOPO (security definer: ignoram RLS por dentro, evitam recursão)
-- ============================================================

-- carteiras que o usuário logado pode ver
create or replace function fn_carteiras_visiveis()
returns setof bigint language sql stable security definer set search_path = public as $$
  select c.id
  from carteiras c, (select role, cobrador_id from usuarios_app where id = auth.uid()) u
  where u.role = 'admin'
     or (u.role = 'cobrador'     and c.cobrador_id = auth.uid())
     or (u.role = 'credor'       and c.credor_id   = auth.uid())
     or (u.role = 'visualizador' and c.cobrador_id = u.cobrador_id);
$$;

-- chips que o usuário logado pode ver (credor não vê chips)
create or replace function fn_chips_visiveis()
returns setof int language sql stable security definer set search_path = public as $$
  select ch.id
  from chips ch, (select role, cobrador_id from usuarios_app where id = auth.uid()) u
  where u.role = 'admin'
     or (u.role = 'cobrador'     and ch.cobrador_id = auth.uid())
     or (u.role = 'visualizador' and ch.cobrador_id = u.cobrador_id);
$$;

-- devedores/conversas visíveis (derivados das carteiras visíveis) — p/ tabelas sem carteira_id
create or replace function fn_devedores_visiveis()
returns setof bigint language sql stable security definer set search_path = public as $$
  select id from devedores where carteira_id in (select fn_carteiras_visiveis());
$$;

create or replace function fn_conversas_visiveis()
returns setof bigint language sql stable security definer set search_path = public as $$
  select id from conversas where carteira_id in (select fn_carteiras_visiveis());
$$;

-- cobrador "dono" do usuário logado (cobrador = self; credor/visualizador = o tenant ligado)
create or replace function fn_meu_cobrador()
returns uuid language sql stable security definer set search_path = public as $$
  select case when role = 'cobrador' then id else cobrador_id end
  from usuarios_app where id = auth.uid();
$$;

-- funções internas: não chamáveis por anon; authenticated precisa (avaliadas nas policies)
revoke execute on function fn_carteiras_visiveis() from public, anon;
revoke execute on function fn_chips_visiveis()     from public, anon;
revoke execute on function fn_devedores_visiveis() from public, anon;
revoke execute on function fn_conversas_visiveis() from public, anon;
revoke execute on function fn_meu_cobrador()       from public, anon;
grant execute on function fn_carteiras_visiveis() to authenticated;
grant execute on function fn_chips_visiveis()     to authenticated;
grant execute on function fn_devedores_visiveis() to authenticated;
grant execute on function fn_conversas_visiveis() to authenticated;
grant execute on function fn_meu_cobrador()       to authenticated;

-- ============================================================
-- 2) DROP das policies antigas (todas eram SELECT using(true) / escrita admin|operador)
-- ============================================================
drop policy if exists sel_carteiras   on carteiras;
drop policy if exists ins_carteiras   on carteiras;
drop policy if exists upd_carteiras   on carteiras;
drop policy if exists del_carteiras   on carteiras;
drop policy if exists sel_devedores   on devedores;
drop policy if exists upd_devedores   on devedores;
drop policy if exists sel_telefones   on telefones_devedor;
drop policy if exists upd_telefones   on telefones_devedor;
drop policy if exists sel_chips        on chips;
drop policy if exists upd_chips        on chips;
drop policy if exists sel_chip_metricas on chip_metricas_diarias;
drop policy if exists sel_fila          on fila_envios;
drop policy if exists upd_fila          on fila_envios;
drop policy if exists sel_conversas     on conversas;
drop policy if exists sel_mensagens     on mensagens;
drop policy if exists sel_negociacoes   on negociacoes;
drop policy if exists sel_pagamentos    on pagamentos;
drop policy if exists sel_eventos       on eventos_campanha;
drop policy if exists sel_metricas      on metricas_diarias;
drop policy if exists sel_importacoes   on importacoes;
drop policy if exists ins_importacoes   on importacoes;
drop policy if exists sel_escalacoes    on escalacoes;
drop policy if exists ins_escalacoes    on escalacoes;
drop policy if exists upd_escalacoes    on escalacoes;
drop policy if exists sel_failover      on failover_eventos;
drop policy if exists ins_failover      on failover_eventos;
drop policy if exists upd_failover      on failover_eventos;
drop policy if exists sel_usuarios      on usuarios_app;
drop policy if exists upd_usuarios      on usuarios_app;
drop policy if exists del_usuarios      on usuarios_app;
-- templates_mensagem e configuracoes: recriadas (escrita vira admin-only)
drop policy if exists sel_templates on templates_mensagem;
drop policy if exists ins_templates on templates_mensagem;
drop policy if exists upd_templates on templates_mensagem;
drop policy if exists del_templates on templates_mensagem;
drop policy if exists sel_configuracoes on configuracoes;
drop policy if exists ins_configuracoes on configuracoes;
drop policy if exists upd_configuracoes on configuracoes;

-- ============================================================
-- 3) POLICIES NOVAS — leitura por escopo, escrita admin/cobrador (no escopo)
-- ============================================================

-- CARTEIRAS
create policy sel_carteiras on carteiras for select to authenticated
  using (fn_role() = 'admin' or id in (select fn_carteiras_visiveis()));
create policy ins_carteiras on carteiras for insert to authenticated
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));
create policy upd_carteiras on carteiras for update to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()))
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));
create policy del_carteiras on carteiras for delete to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));

-- DEVEDORES
create policy sel_devedores on devedores for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));
create policy upd_devedores on devedores for update to authenticated
  using (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis())))
  with check (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis())));

-- TELEFONES (via devedor)
create policy sel_telefones on telefones_devedor for select to authenticated
  using (fn_role() = 'admin' or devedor_id in (select fn_devedores_visiveis()));
create policy upd_telefones on telefones_devedor for update to authenticated
  using (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or devedor_id in (select fn_devedores_visiveis())))
  with check (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or devedor_id in (select fn_devedores_visiveis())));

-- CHIPS
create policy sel_chips on chips for select to authenticated
  using (fn_role() = 'admin' or id in (select fn_chips_visiveis()));
create policy upd_chips on chips for update to authenticated
  using (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or id in (select fn_chips_visiveis())))
  with check (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or id in (select fn_chips_visiveis())));

-- CHIP METRICAS (via chip)
create policy sel_chip_metricas on chip_metricas_diarias for select to authenticated
  using (fn_role() = 'admin' or chip_id in (select fn_chips_visiveis()));

-- FILA DE ENVIOS
create policy sel_fila on fila_envios for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));
create policy upd_fila on fila_envios for update to authenticated
  using (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis())))
  with check (fn_role() in ('admin','cobrador') and (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis())));

-- CONVERSAS (só leitura via RLS; escrita é service_role/bot)
create policy sel_conversas on conversas for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));

-- MENSAGENS (via conversa)
create policy sel_mensagens on mensagens for select to authenticated
  using (fn_role() = 'admin' or conversa_id in (select fn_conversas_visiveis()));

-- NEGOCIACOES (via devedor)
create policy sel_negociacoes on negociacoes for select to authenticated
  using (fn_role() = 'admin' or devedor_id in (select fn_devedores_visiveis()));

-- PAGAMENTOS (via devedor)
create policy sel_pagamentos on pagamentos for select to authenticated
  using (fn_role() = 'admin' or devedor_id in (select fn_devedores_visiveis()));

-- EVENTOS DE CAMPANHA (via carteira; admin vê os globais sem carteira)
create policy sel_eventos on eventos_campanha for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));

-- METRICAS DIARIAS: agregado global cross-tenant -> só admin (não-admin reagrega do escopo)
create policy sel_metricas on metricas_diarias for select to authenticated
  using (fn_role() = 'admin');

-- IMPORTACOES (via carteira)
create policy sel_importacoes on importacoes for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));
create policy ins_importacoes on importacoes for insert to authenticated
  with check (fn_role() in ('admin','cobrador'));

-- ESCALACOES (via carteira)
create policy sel_escalacoes on escalacoes for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));
create policy ins_escalacoes on escalacoes for insert to authenticated
  with check (fn_role() in ('admin','cobrador'));
create policy upd_escalacoes on escalacoes for update to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and carteira_id in (select fn_carteiras_visiveis())))
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and carteira_id in (select fn_carteiras_visiveis())));

-- FAILOVER (via chip caído)
create policy sel_failover on failover_eventos for select to authenticated
  using (fn_role() = 'admin' or chip_caido_id in (select fn_chips_visiveis()));
create policy ins_failover on failover_eventos for insert to authenticated
  with check (fn_role() in ('admin','cobrador'));
create policy upd_failover on failover_eventos for update to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and chip_caido_id in (select fn_chips_visiveis())))
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and chip_caido_id in (select fn_chips_visiveis())));

-- USUARIOS_APP: admin tudo; cobrador vê self + seu tenant; credor/visualizador só self
create policy sel_usuarios on usuarios_app for select to authenticated
  using (fn_role() = 'admin' or id = auth.uid() or cobrador_id = auth.uid());
create policy upd_usuarios on usuarios_app for update to authenticated
  using (fn_role() = 'admin' or cobrador_id = auth.uid())
  with check (fn_role() = 'admin' or cobrador_id = auth.uid());
create policy del_usuarios on usuarios_app for delete to authenticated
  using (fn_role() = 'admin' or cobrador_id = auth.uid());

-- TEMPLATES (scaffolding global compartilhado): leitura livre, escrita só admin
create policy sel_templates on templates_mensagem for select to authenticated using (true);
create policy ins_templates on templates_mensagem for insert to authenticated
  with check (fn_role() = 'admin');
create policy upd_templates on templates_mensagem for update to authenticated
  using (fn_role() = 'admin') with check (fn_role() = 'admin');
create policy del_templates on templates_mensagem for delete to authenticated
  using (fn_role() = 'admin');

-- CONFIGURACOES (defaults globais da plataforma): leitura livre (badges/edge), escrita só admin
create policy sel_configuracoes on configuracoes for select to authenticated using (true);
create policy ins_configuracoes on configuracoes for insert to authenticated
  with check (fn_role() = 'admin');
create policy upd_configuracoes on configuracoes for update to authenticated
  using (fn_role() = 'admin') with check (fn_role() = 'admin');
