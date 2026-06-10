-- InvGuard fix: corrige errores de "id is ambiguous" y
-- "structure of query does not match function result type".
-- Ejecutar en Supabase SQL Editor.

create or replace function public.listar_empresas_admin()
returns table (
  id bigint,
  nombre text,
  rubro text,
  ciudad text,
  estado text,
  plan text,
  owner_id uuid,
  owner_email text,
  beta_started_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  created_at timestamp with time zone,
  usuarios bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el Super Admin puede listar negocios';
  end if;

  return query
    select
      e.id,
      e.nombre,
      e.rubro,
      e.ciudad,
      e.estado,
      e.plan,
      e.owner_id,
      au.email::text as owner_email,
      e.beta_started_at,
      e.trial_ends_at,
      e.created_at,
      count(eu.id)::bigint as usuarios
    from public.empresas e
    left join auth.users au on au.id = e.owner_id
    left join public.empresa_usuarios eu on eu.empresa_id = e.id
    group by e.id, au.email
    order by e.created_at desc;
end;
$$;

create or replace function public.crear_empresa_admin(
  p_nombre text,
  p_rubro text,
  p_ciudad text,
  p_owner_email text
)
returns table (
  id bigint,
  nombre text,
  owner_email text,
  trial_ends_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_owner_email text;
  v_empresa public.empresas;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el Super Admin puede crear negocios';
  end if;

  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del negocio es obligatorio';
  end if;

  select au.id, au.email::text
    into v_owner_id, v_owner_email
  from auth.users au
  where lower(au.email) = lower(trim(p_owner_email))
  limit 1;

  if v_owner_id is null then
    raise exception 'Usuario no encontrado. Primero crealo en Supabase Auth.';
  end if;

  insert into public.empresas (
    owner_id,
    nombre,
    rubro,
    ciudad,
    estado,
    plan,
    beta_started_at,
    trial_ends_at
  )
  values (
    v_owner_id,
    trim(p_nombre),
    nullif(trim(p_rubro), ''),
    nullif(trim(p_ciudad), ''),
    'BETA',
    'BETA',
    now(),
    now() + interval '30 days'
  )
  returning * into v_empresa;

  insert into public.empresa_usuarios (
    empresa_id,
    user_id,
    email,
    rol
  )
  values (
    v_empresa.id,
    v_owner_id,
    lower(v_owner_email),
    'ADMIN'
  )
  on conflict (empresa_id, user_id)
  do update set
    email = excluded.email,
    rol = 'ADMIN';

  return query
    select
      v_empresa.id,
      v_empresa.nombre,
      lower(v_owner_email),
      v_empresa.trial_ends_at;
end;
$$;

create or replace function public.agregar_usuario_empresa(
  p_empresa_id bigint,
  p_email text,
  p_rol text default 'EMPLEADO'
)
returns table (
  id bigint,
  email text,
  rol text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_member public.empresa_usuarios;
begin
  if not public.es_admin_empresa(p_empresa_id) then
    raise exception 'Solo un ADMIN puede agregar usuarios';
  end if;

  if p_rol not in ('ADMIN', 'SUPERVISOR', 'EMPLEADO') then
    raise exception 'Rol invalido';
  end if;

  select au.id, au.email::text
    into v_user_id, v_user_email
  from auth.users au
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Usuario no encontrado. Primero crealo en Supabase Auth.';
  end if;

  insert into public.empresa_usuarios (
    empresa_id,
    user_id,
    email,
    rol
  )
  values (
    p_empresa_id,
    v_user_id,
    lower(v_user_email),
    p_rol
  )
  on conflict (empresa_id, user_id)
  do update set
    email = excluded.email,
    rol = excluded.rol
  returning * into v_member;

  return query select v_member.id, v_member.email, v_member.rol;
end;
$$;

create or replace function public.cambiar_rol_usuario_empresa(
  p_empresa_id bigint,
  p_email text,
  p_rol text
)
returns table (
  id bigint,
  email text,
  rol text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.empresa_usuarios;
  v_admins bigint;
begin
  if not public.es_admin_empresa(p_empresa_id) then
    raise exception 'Solo un ADMIN puede cambiar roles';
  end if;

  if p_rol not in ('ADMIN', 'SUPERVISOR', 'EMPLEADO') then
    raise exception 'Rol invalido';
  end if;

  select eu.*
    into v_member
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id
    and lower(eu.email) = lower(trim(p_email))
  limit 1;

  if v_member.id is null then
    raise exception 'Usuario no encontrado en este negocio';
  end if;

  if v_member.rol = 'ADMIN' and p_rol <> 'ADMIN' then
    select count(*)
      into v_admins
    from public.empresa_usuarios eu
    where eu.empresa_id = p_empresa_id
      and eu.rol = 'ADMIN';

    if v_admins <= 1 then
      raise exception 'No puedes quitar el ultimo ADMIN del negocio';
    end if;
  end if;

  update public.empresa_usuarios eu
    set rol = p_rol
  where eu.id = v_member.id
  returning eu.* into v_member;

  return query select v_member.id, v_member.email, v_member.rol;
end;
$$;

create or replace function public.quitar_usuario_empresa(
  p_empresa_id bigint,
  p_email text
)
returns table (
  id bigint,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.empresa_usuarios;
  v_admins bigint;
begin
  if not public.es_admin_empresa(p_empresa_id) then
    raise exception 'Solo un ADMIN puede quitar usuarios';
  end if;

  select eu.*
    into v_member
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id
    and lower(eu.email) = lower(trim(p_email))
  limit 1;

  if v_member.id is null then
    raise exception 'Usuario no encontrado en este negocio';
  end if;

  if v_member.rol = 'ADMIN' then
    select count(*)
      into v_admins
    from public.empresa_usuarios eu
    where eu.empresa_id = p_empresa_id
      and eu.rol = 'ADMIN';

    if v_admins <= 1 then
      raise exception 'No puedes quitar el ultimo ADMIN del negocio';
    end if;
  end if;

  delete from public.empresa_usuarios eu
  where eu.id = v_member.id;

  return query select v_member.id, v_member.email;
end;
$$;

grant execute on function public.listar_empresas_admin() to authenticated;

grant execute on function public.crear_empresa_admin(
  text,
  text,
  text,
  text
) to authenticated;

grant execute on function public.agregar_usuario_empresa(
  bigint,
  text,
  text
) to authenticated;

grant execute on function public.cambiar_rol_usuario_empresa(
  bigint,
  text,
  text
) to authenticated;

grant execute on function public.quitar_usuario_empresa(
  bigint,
  text
) to authenticated;
