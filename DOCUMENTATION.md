# 📖 Toffee — Especificación Detallada de la Aplicación

> Documentación técnica y funcional de **Toffe Coffee**, plataforma web de Punto de Venta (POS) y gestión integral para cafeterías.

---

## 1. Propósito

Toffee centraliza la operación diaria de una cafetería en una sola aplicación web:

- Venta de productos (POS) con múltiples formas de pago.
- Preparación de pedidos en tiempo real (comandas tipo KDS).
- Cancelación controlada de ventas (ventana de 5 minutos).
- Inventario de insumos con recetas y descuento automático.
- Reporte de mermas (daños/pérdidas de insumos).
- Contabilidad: ingresos por ventas, ingresos manuales, gastos y balance.
- Estadísticas ejecutivas mensuales para el dueño.
- Gestión de usuarios y roles.

---

## 2. Arquitectura

```
Cafeteriaweb/  (Frontend)                Cafeteria/  (Backend)
React 19 + Vite + React Router v7  ──►  Go 1.26 + Chi + pgx/v5
        │        HTTP JSON + JWT                │
        │◄── SSE (/events) tiempo real          ▼
        │                                PostgreSQL 14+ (Supabase o local)
```

- **Backend** (`Cafeteria/`): API REST en Go con router **Chi**, acceso a PostgreSQL mediante **pgx/v5**, autenticación **JWT** y difusión de eventos en tiempo real por **Server-Sent Events (SSE)**.
- **Frontend** (`Cafeteriaweb/`): SPA en **React 19** compilada con **Vite**, enrutamiento con **React Router v7**, iconografía **lucide-react**, estilos utilitarios (Tailwind CSS v4) y soporte **PWA**.
- **Base de datos**: PostgreSQL. Migraciones en `Cafeteria/migrations/` (formato golang-migrate) y `supabase/migrations/` (para Supabase).

### Estructura del repositorio

```
Toffee/
├── Cafeteria/               # Backend Go
│   ├── cmd/server/main.go   # Entrada, rutas y permisos
│   ├── internal/
│   │   ├── db/              # Conexión a PostgreSQL
│   │   ├── events/          # Hub SSE
│   │   ├── handlers/        # Lógica de cada módulo (ventas, comandas, contabilidad, ...)
│   │   ├── middleware/      # Autenticación JWT y control de roles
│   │   └── models/          # Estructuras de datos
│   └── migrations/          # Migraciones SQL numeradas
├── Cafeteriaweb/            # Frontend React
│   └── src/
│       ├── api/client.js    # Cliente HTTP con token JWT
│       ├── context/         # AuthContext (sesión de usuario)
│       ├── components/      # Modal, Layout, etc.
│       └── pages/           # POS, Comandas, SalesHistory, Accounting, Stats, ...
└── supabase/migrations/     # Migraciones para Supabase
```

---

## 3. Roles y Permisos

| Rol | Valor interno | Capacidades |
| :-- | :-- | :-- |
| Dueño | `owner` | Todo: ventas, comandas, inventario, contabilidad, estadísticas ejecutivas, gestión de usuarios |
| Administrador | `admin` | Ventas, comandas, inventario, productos/recetas, contabilidad y gastos/ingresos |
| Empleado | `employee` | Ventas (POS), comandas, ver inventario, reportar mermas |

Los permisos se aplican en el backend mediante middleware (`RequireAuth` + `RequireRole`) por grupo de rutas.

---

## 4. Módulos Funcionales

### 4.1 Punto de Venta (POS)

- Catálogo de productos con búsqueda y filtro por categoría.
- Carrito con subtotal/total y autocompletado de clientes habituales.
- **Formas de pago**: `efectivo` (cálculo de cambio), `transferencia` (selección de banco/entidad con posibilidad de dividir entre varios bancos) y `mixto` (efectivo + abonos digitales).
- Al confirmar la venta:
  1. Se crea el registro en `sales` con estado `completada` y sus artículos en `sale_items`.
  2. Se descuenta el inventario según las recetas de los productos.
  3. Se genera automáticamente una comanda (`comandas`) vinculada a la venta.
  4. Se emiten eventos SSE para actualizar las demás pantallas.

### 4.2 Comandas (KDS — Cocina & Barista)

Tablero en tiempo real con 4 columnas: **Pendientes → En Preparación → Listas en Barra → Entregadas / Canceladas**.

- Estados de comanda: `pendiente` → `en_preparacion` → `listo` → `entregado`, más el estado terminal `cancelado`.
- Cualquier usuario autenticado puede ver y avanzar comandas.
- Muestra tiempo transcurrido / duración de preparación y quién prepara.
- Actualización instantánea vía SSE (`comanda_created`, `comanda_updated`, `comanda_status_updated`) con aviso sonoro.

#### Cancelación de ventas (ventana de 5 minutos)

- Cada tarjeta de comanda muestra el botón **“Cancelar Venta (5 min)”** solo mientras no hayan pasado 5 minutos desde la creación de la venta.
- La cancelación llama a `POST /comandas/{id}/cancel`, que **valida en el backend** (la restricción no depende del frontend):
  - La comanda existe y tiene una venta asociada.
  - Ni la venta ni la comanda están ya canceladas.
  - Han pasado **como máximo 5 minutos** desde `sales.created_at` (si no, responde `403`).
- En una única transacción atómica: `sales.status = 'cancelada'` y `comandas.status = 'cancelado'`.
- **La venta nunca se elimina**: se conserva íntegra (artículos, cliente, método de pago) para auditoría.
- Emite eventos SSE `comanda_updated` y `sale_cancelled`.

### 4.3 Historial de Ventas

- Registro cronológico de todas las ventas con filtros por período (hoy, semana, mes, mes/año concreto, rango de fechas, histórico total), búsqueda por cliente/cajero y filtro por método de pago.
- **Columna Estado**: `Completada` (verde) o `Cancelada` (roja, monto tachado).
- El **Total Facturado excluye las ventas canceladas**.
- Recibo imprimible por venta; los recibos de ventas canceladas muestran el aviso “Venta Cancelada — No válida como ingreso”.

### 4.4 Contabilidad (Owner y Admin)

- Resumen por período: ingresos, gastos, balance neto, conteos y desglose por método de pago.
- **Ingresos por ventas**: solo ventas con estado `completada`.
- **Ingresos manuales**: registros extra no provenientes del POS.
  - Formulario con **descripción**, **monto**, **categoría** (`ventas_externas`, `aporte_capital`, `devolucion`, `otros`) y **forma de pago**.
  - Validaciones: descripción no vacía y monto mayor que 0.
  - Se guardan en la tabla `incomes` con el usuario que los registró y la fecha.
  - Se suman al total de ingresos, al balance y al desglose por método de pago.
- **Gastos**: por categoría (Insumos, Servicios, Mantenimiento, Nómina, Otros), con opción de reabastecer inventario directamente.
- **Flujo de caja combinado**: lista cronológica unificada de ventas completadas (+), ingresos manuales (+), gastos (−) y ventas canceladas (informativas, sin sumar).

### 4.5 Inventario, Recetas y Mermas

- CRUD de insumos (solo owner/admin) con unidades y stock.
- Recetas por producto: consumo de insumos que se descuenta automáticamente al vender.
- **Mermas** (`/waste`): cualquier rol puede reportar daños/pérdidas; descuenta stock y guarda historial auditable (insumo, cantidad, motivo, declarante, fecha).

### 4.6 Estadísticas Ejecutivas (solo Owner)

- Métricas del mes: ventas totales, gastos totales, ganancia neta.
- Mejor vendedor, producto más vendido y top de clientes del mes.
- **Todas las métricas excluyen las ventas canceladas.**

### 4.7 Usuarios y Perfil

- Login con usuario/contraseña → token JWT.
- Cada usuario puede editar su perfil (nombre, contraseña, avatar).
- El dueño gestiona el personal (crear, cambiar rol, eliminar) mediante transacciones que preservan el historial contable/operativo.

---

## 5. API REST

Base: `http://localhost:8080`. Todas las rutas (salvo `/health` y `/login`) requieren cabecera `Authorization: Bearer <JWT>`.

### Autenticación
| Método | Ruta | Descripción | Acceso |
| :-- | :-- | :-- | :-- |
| POST | `/login` | Iniciar sesión, devuelve JWT | Público |
| GET | `/health` | Comprobación de vida | Público |
| GET | `/events` | Stream SSE de eventos en tiempo real | Autenticado |

### Ventas
| Método | Ruta | Descripción | Acceso |
| :-- | :-- | :-- | :-- |
| GET | `/sales` | Listar ventas (filtros `period`, `year`+`month_num`, `start_date`+`end_date`); incluye `status` | Todos los roles |
| GET | `/sales/{id}` | Detalle de una venta con artículos y `status` | Todos los roles |
| POST | `/sales` | Crear venta (estado inicial `completada`) | Todos los roles |

### Comandas
| Método | Ruta | Descripción | Acceso |
| :-- | :-- | :-- | :-- |
| GET | `/comandas` | Listar comandas del día | Autenticado |
| PATCH | `/comandas/{id}/status` | Avanzar estado (`pendiente`/`en_preparacion`/`listo`/`entregado`) | Autenticado |
| POST | `/comandas/{id}/cancel` | Cancelar la venta asociada (solo dentro de los 5 minutos) | Autenticado |

### Contabilidad (Owner/Admin)
| Método | Ruta | Descripción |
| :-- | :-- | :-- |
| GET | `/accounting/summary` | Resumen del período (ingresos, gastos, balance, manual_income, tops) |
| GET | `/expenses` | Listar gastos |
| POST | `/expenses` | Registrar gasto |
| GET | `/incomes` | Listar ingresos manuales |
| POST | `/incomes` | Registrar ingreso manual (`description`, `amount`, `category`, `payment_method`) |

### Catálogo e Inventario
| Método | Ruta | Descripción | Acceso |
| :-- | :-- | :-- | :-- |
| GET | `/products`, `/products/{id}` | Consultar productos | Autenticado |
| POST/PUT/DELETE | `/products...` | Gestionar productos | Owner/Admin |
| GET/PUT | `/products/{id}/recipe` | Consultar / definir receta | Autenticado / Owner-Admin |
| GET | `/ingredients`, `/ingredients/{id}` | Consultar insumos | Autenticado |
| POST/PUT/DELETE | `/ingredients...` | Gestionar insumos | Owner/Admin |
| GET/POST | `/waste` | Historial / reporte de mermas | Autenticado |

### Tareas y Usuarios
| Método | Ruta | Descripción | Acceso |
| :-- | :-- | :-- | :-- |
| GET | `/tasks` · PATCH `/tasks/{id}/status` | Ver tareas / cambiar estado propio | Autenticado |
| POST/PUT/DELETE | `/tasks...` | Gestionar tareas | Owner/Admin |
| GET | `/users` · PUT `/users/me` | Listar usuarios / editar perfil propio | Autenticado |
| POST/PUT/DELETE | `/users...` | Gestionar usuarios | Owner |

---

## 6. Estados y Reglas de Negocio

### Estados de venta (`sales.status`)

| Estado | Significado |
| :-- | :-- |
| `completada` | Venta válida (valor por defecto). Cuenta como ingreso. |
| `cancelada` | Venta anulada dentro de la ventana de 5 minutos. **No cuenta como ingreso** pero se conserva en la base de datos y en el historial. |

### Estados de comanda (`comandas.status`)

`pendiente` → `en_preparacion` → `listo` → `entregado`, más el estado terminal `cancelado` (asignado al cancelar la venta).

### Reglas clave

1. **Auditoría / no eliminación**: las ventas nunca se borran; una cancelación solo cambia su estado.
2. **Ventana de cancelación**: máximo 5 minutos desde la creación de la venta, validado en el backend dentro de una transacción con bloqueo (`FOR UPDATE`).
3. **Exclusión contable**: toda consulta financiera y estadística filtra `status != 'cancelada'` (ingresos, balance, conteo de ventas, métodos de pago, mejor vendedor, top productos, top clientes).
4. **Ingresos manuales**: descripción obligatoria y monto > 0; se integran a totales, balance y flujo combinado, y son independientes de los gastos.
5. **Inventario**: las ventas descuentan insumos según recetas; las mermas descuentan stock adicionalmente. La cancelación de una venta no repone inventario (los insumos ya fueron consumidos en la preparación).

---

## 7. Esquema de Base de Datos (tablas principales)

| Tabla | Contenido |
| :-- | :-- |
| `users` | Usuarios: username, hash de contraseña, rol, avatar |
| `products` | Productos vendibles: nombre, precio, categoría |
| `ingredients` | Insumos de inventario: nombre, unidad, stock |
| `product_recipes` | Receta: consumo de insumos por producto |
| `sales` | Ventas: cliente, método de pago, detalle de bancos, total, **`status` (`completada`/`cancelada`)**, vendedor, fecha |
| `sale_items` | Artículos de cada venta: producto, cantidad, precio unitario |
| `comandas` | Comandas: venta asociada, estado, preparador, tiempos |
| `expenses` | Gastos: descripción, monto, categoría, banco, registrador |
| `incomes` | **Ingresos manuales**: descripción, monto, categoría, forma de pago, registrador, fecha |
| `waste_reports` | Mermas: insumo, cantidad, motivo, declarante |
| `tasks` | Tareas internas del equipo |

Migraciones relevantes: `Cafeteria/migrations/000013_add_sale_status_and_incomes.up.sql` (añade `sales.status` y crea `incomes`), con su equivalente en `supabase/migrations/`.

---

## 8. Eventos SSE

El backend difunde eventos JSON por `GET /events` (`{"type": "..."}`), que el frontend usa para refrescar vistas al instante:

- `sale_created`, `sale_cancelled`
- `comanda_created`, `comanda_updated`
- `expense_created`, `income_created`
- `inventory_updated`, `inventory_deleted` (inventario y mermas)
- eventos de tareas

---

## 9. Instalación y Configuración

### Prerrequisitos
- Go 1.26+
- Node.js 18+ y npm
- PostgreSQL 14+ (local o Supabase)

### Backend (`Cafeteria/`)

```bash
# 1. Crear la base de datos
#    CREATE DATABASE "Cafeteria";

# 2. Configurar Cafeteria/.env
#    DB_URL=postgres://postgres:TU_PASSWORD@localhost:5432/Cafeteria?sslmode=disable
#    JWT_SECRET=tu_clave_secreta_super_segura

cd Cafeteria
go run ./cmd/server        # servidor en http://localhost:8080
```

Las migraciones SQL están en `Cafeteria/migrations/`; los handlers también aplican los cambios de esquema esenciales al arrancar (columna `sales.status`, tabla `incomes`) para entornos ya desplegados.

### Frontend (`Cafeteriaweb/`)

```bash
cd Cafeteriaweb
npm install
npm run dev                # abre http://localhost:5173
```

Comandos útiles: `npm run build` (producción), `npm run lint` (oxlint).
