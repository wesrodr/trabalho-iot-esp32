-- Canal simples de comando do painel para o ESP32. O registro id=1 guarda o estado atual.
begin;
create table if not exists public.comando_dispositivo (
  id smallint primary key check (id = 1),
  led boolean not null default false,
  mensagem text not null default 'Comando recebido do painel' check (char_length(mensagem) <= 64)
);

insert into public.comando_dispositivo (id, led, mensagem)
values (1, false, 'Comando recebido do painel')
on conflict (id) do nothing;

alter table public.comando_dispositivo enable row level security;
grant select, insert, update on public.comando_dispositivo to anon, authenticated;

drop policy if exists "ESP32 and dashboard can read command" on public.comando_dispositivo;
create policy "ESP32 and dashboard can read command"
  on public.comando_dispositivo for select to anon, authenticated using (id = 1);

drop policy if exists "Dashboard can set ESP32 command" on public.comando_dispositivo;
create policy "Dashboard can set ESP32 command"
  on public.comando_dispositivo for insert to anon, authenticated
  with check (id = 1 and mensagem = 'Comando recebido do painel');

drop policy if exists "Dashboard can update ESP32 command" on public.comando_dispositivo;
create policy "Dashboard can update ESP32 command"
  on public.comando_dispositivo for update to anon, authenticated
  using (id = 1)
  with check (id = 1 and mensagem = 'Comando recebido do painel');
commit;
