# InvGuard

InvGuard es una aplicacion web multiusuario para inventario, movimientos, perdidas, reorden y analisis operativo.

## Que incluye

- Login y registro con Supabase Auth.
- Cada usuario crea su negocio al registrarse.
- Datos separados por negocio mediante `empresa_id`.
- Seguridad real con Row Level Security (RLS).
- Dashboard con KPIs y graficos.
- Inventario con CRUD, filtros, stock minimo, costo, venta y CSV.
- Movimientos con entradas, salidas y actualizacion de stock.
- Perdidas como salidas controladas.
- Analisis inteligente con reorden sugerido y riesgo por categoria.
- Herramientas: pedido por WhatsApp, respaldo JSON, reporte CSV, impresion e importacion CSV.
- Panel Admin para controlar negocio, usuarios, roles e invitaciones.
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

Ese script crea:

- `empresas`
- `empresa_usuarios`
- `invitaciones_empresa`
- `productos`
- `movimientos`
- policies RLS
- funcion segura `registrar_movimiento`
- funciones `crear_invitacion_empresa` y `aceptar_invitacion_empresa`

Sin ese SQL, la app mostrara una pantalla indicando que falta activar la base multiusuario.

## Importar inventario

La pantalla Herramientas permite importar CSV con estas columnas:

```text
codigo,nombre,categoria,stock,stock_minimo,precio_compra,precio_venta
```

## Publicar en Vercel

1. Sube el proyecto a GitHub.
2. En Vercel, importa el repositorio.
3. Configura `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_REQUIRE_AUTH=true`.
4. Build command: `npm run build`.
5. Output directory: `dist`.

## Publico objetivo

InvGuard sirve para cualquier persona o negocio que maneje inventario: bodegas, minimarkets, farmacias, ferreterias, almacenes, restaurantes, distribuidoras o emprendimientos.

## Como controla el dueño

El primer usuario que crea el negocio queda como `ADMIN`.

Desde la pantalla Admin puede:

- editar el nombre, rubro y ciudad del negocio,
- ver su rol actual,
- ver los usuarios del negocio,
- crear invitaciones para nuevos usuarios,
- asignar roles `ADMIN`, `SUPERVISOR` o `EMPLEADO`,
- enviar el link de invitacion por WhatsApp.

La separacion real de datos no depende del frontend: Supabase RLS bloquea productos y movimientos de otras empresas.
