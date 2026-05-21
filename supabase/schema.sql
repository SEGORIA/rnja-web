-- ══════════════════════════════════════════════════
--  RNJA NEXUS — Schema de base de datos
--  Ejecutar en: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════

-- 1. TABLA DE PERFILES (extiende auth.users)
create table if not exists public.perfiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  nombres         text not null,
  apellidos       text not null,
  cedula          text unique,
  fecha_nacimiento date,
  telefono        text,
  departamento    text,
  municipio       text,
  genero          text,
  grupo_etnico    text,
  -- Roles: voluntario | coord_municipal | coord_departamental | coord_nacional | etica | super_admin
  rol             text not null default 'voluntario',
  -- Estados: activo | inactivo | suspendido
  estado          text not null default 'activo',
  notas           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 2. TABLA DE SOLICITUDES DE INGRESO (formulario "Únete")
create table if not exists public.solicitudes (
  id                      uuid primary key default gen_random_uuid(),
  -- Paso 1: Datos personales
  nombres                 text not null,
  apellidos               text not null,
  cedula                  text not null,
  fecha_nacimiento        date,
  email                   text not null,
  telefono                text,
  departamento            text,
  municipio               text,
  genero                  text,
  grupo_etnico            text,
  -- Paso 2: Perfil académico
  situacion               text,
  institucion             text,
  carrera                 text,
  nivel_estudios          text,
  semestre                text,
  area_conocimiento       text,
  habilidades             text,
  experiencia_voluntariado text,
  disponibilidad          text,
  redes_sociales          text,
  -- Paso 3: Motivación
  motivacion              text,
  areas_participacion     text[],
  como_conocio            text,
  -- Gestión
  estado                  text not null default 'pendiente',
  -- pendiente | revisando | aprobada | rechazada
  notas_revision          text,
  revisado_por            uuid references auth.users(id),
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- 3. TRIGGER: actualizar updated_at automáticamente
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_perfiles_updated on public.perfiles;
create trigger on_perfiles_updated
  before update on public.perfiles
  for each row execute procedure public.handle_updated_at();

drop trigger if exists on_solicitudes_updated on public.solicitudes;
create trigger on_solicitudes_updated
  before update on public.solicitudes
  for each row execute procedure public.handle_updated_at();

-- 4. ROW LEVEL SECURITY
alter table public.perfiles   enable row level security;
alter table public.solicitudes enable row level security;

-- Políticas de PERFILES
-- Cada usuario lee su propio perfil
create policy "perfiles_own_read" on public.perfiles
  for select using (auth.uid() = id);

-- Admins y coordinadores leen todos los perfiles
create policy "perfiles_admin_read" on public.perfiles
  for select using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
      and p.rol in ('super_admin', 'coord_nacional', 'coord_departamental', 'coord_municipal', 'etica')
    )
  );

-- Cada usuario actualiza su propio perfil
create policy "perfiles_own_update" on public.perfiles
  for update using (auth.uid() = id);

-- Admins actualizan cualquier perfil (cambios de rol)
create policy "perfiles_admin_update" on public.perfiles
  for update using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
      and p.rol in ('super_admin', 'coord_nacional')
    )
  );

-- Políticas de SOLICITUDES
-- Cualquiera (incluso anónimo) puede crear una solicitud
create policy "solicitudes_insert" on public.solicitudes
  for insert with check (true);

-- Coordinadores y admins leen solicitudes de su área
create policy "solicitudes_coord_read" on public.solicitudes
  for select using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
      and p.rol in ('super_admin', 'coord_nacional', 'coord_departamental', 'coord_municipal')
    )
  );

-- Solo super_admin y coord_nacional pueden actualizar estado
create policy "solicitudes_admin_update" on public.solicitudes
  for update using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
      and p.rol in ('super_admin', 'coord_nacional')
    )
  );

-- ══════════════════════════════════════════════════
--  PASO FINAL: Crear el primer super admin
--  1. Ve a Supabase → Authentication → Users → Invite user
--  2. Ingresa tu correo y crea la cuenta
--  3. Copia el UUID del usuario creado
--  4. Ejecuta este INSERT reemplazando el UUID:
-- ══════════════════════════════════════════════════

-- insert into public.perfiles (id, nombres, apellidos, cedula, rol, estado)
-- values (
--   'PEGA-AQUI-EL-UUID-DEL-ADMIN',
--   'Nombre',
--   'Apellido',
--   '00000000',
--   'super_admin',
--   'activo'
-- );
