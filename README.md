# InvGuard

InvGuard es una aplicacion web multiusuario para inventario, movimientos, perdidas, reorden, analisis operativo y control privado de negocios.

## Que incluye

- Login privado con Supabase Auth.
- Registro publico cerrado: el administrador crea usuarios y negocios.
- Datos separados por negocio mediante `empresa_id`.
- Seguridad real con Row Level Security (RLS).
- Super Admin para crear negocios, asignar duenos y controlar estado comercial.
- Beta comercial de 30 dias por negocio.
- Estados de negocio: `BETA`, `ACTIVO`, `SUSPENDIDO`.
- Dashboard con KPIs y graficos.
- Inventario con CRUD, filtros, stock minimo, costo, venta y CSV.
- Lotes por producto con proveedor y fecha de vencimiento.
- Alertas de vencimiento en inventario, dashboard y perdidas.
- Salidas por FEFO: consume primero los lotes que vencen antes.
- Perdidas sugeridas por vencimiento, siempre con confirmacion.
- Movimientos con entradas, salidas y actualizacion de stock.
- Perdidas como salidas controladas.
- Analisis inteligente con reorden sugerido y riesgo por categoria.
- Herramientas: pedido por WhatsApp, respaldo JSON, reporte CSV, impresion e importacion CSV.
- Panel Admin para controlar datos del negocio, usuarios y roles.
- Configuracion lista para Vercel.

## Ejecutar localmente

```bash
cd C:\Users\Alexander\Documents\invguard
npm install
npm run dev
```

Abrir:

```text
http://127.0.0.1:5173
```

## Variables de entorno

Copia `.env.example` como `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_REQUIRE_AUTH=true
```

## Activar base multiusuario en Supabase

Ejecuta este archivo en Supabase SQL Editor:

```text
supabase/multi_tenant.sql
```

Luego ejecuta el modulo de lotes y vencimientos:

```text
supabase/lotes_vencimientos.sql
```

Ese script crea:

- `app_admins`
- `empresas`
- `empresa_usuarios`
- `invitaciones_empresa`
- `productos`
- `movimientos`
- `producto_lotes`
- policies RLS
- funciones Super Admin
- funcion segura `registrar_movimiento`
- funcion FEFO `registrar_movimiento_lote`
- funcion `registrar_perdida_lote`
- funciones para agregar, cambiar rol y quitar usuarios por correo

Despues de ejecutar el SQL, agrega tu cuenta como Super Admin:

```sql
insert into public.app_admins (user_id, email)
select id, email
from auth.users
where lower(email) = lower('TU_CORREO_AQUI')
on conflict (user_id) do update set email = excluded.email;
```

Sin ese SQL, la app mostrara una pantalla indicando que falta activar la base multiusuario.

## Flujo privado de clientes

1. Crear el usuario del cliente en Supabase Auth con correo y password temporal.
2. Entrar a InvGuard con tu cuenta Super Admin.
3. Crear el negocio desde Admin.
4. Asignar el correo del dueno.
5. El negocio queda en `BETA` por 30 dias.
6. Si paga, cambiar estado a `ACTIVO`.
7. Si no continua, cambiar estado a `SUSPENDIDO`.

## Importar inventario

La pantalla Herramientas permite importar CSV con estas columnas:

```text
codigo,nombre,categoria,stock,stock_minimo,precio_compra,precio_venta
```

## Lotes y vencimientos

Al crear un producto puedes agregar lote inicial:

- codigo de lote,
- proveedor,
- fecha de vencimiento.

En Movimientos, cuando registres una entrada, tambien puedes agregar lote, proveedor y vencimiento. Cuando registres una salida, InvGuard descuenta primero los lotes que vencen antes.

En Perdidas, InvGuard muestra lotes vencidos como perdidas sugeridas. La perdida se descuenta solo cuando un usuario la confirma.

## Publicar en Vercel

1. Sube el proyecto a GitHub sin `node_modules`.
2. En Vercel, importa el repositorio.
3. Configura `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_REQUIRE_AUTH=true`.
4. Build command: `npm run build`.
5. Output directory: `dist`.

## Publico objetivo

InvGuard sirve para cualquier persona o negocio que maneje inventario: bodegas, minimarkets, farmacias, ferreterias, almacenes, restaurantes, distribuidoras o emprendimientos.

## Como controla el dueno

Tu cuenta Super Admin controla todos los negocios.

Desde Admin puedes:

- crear negocios con beta de 30 dias,
- asignar dueno por correo,
- ver todos los negocios,
- ver fecha de fin de beta,
- cambiar estado `BETA`, `ACTIVO` o `SUSPENDIDO`,
- agregar usuarios existentes a un negocio,
- asignar roles `ADMIN`, `SUPERVISOR` o `EMPLEADO`,
- quitar usuarios sin romper el ultimo `ADMIN`.

La separacion real de datos no depende del frontend: Supabase RLS bloquea productos y movimientos de otras empresas.
