# ☕ Toffe Coffee

> *"Hecho por y para estudiantes"*

**Toffe Coffee** es una plataforma web integral de Punto de Venta (POS), gestión operativa de inventario, comandas en tiempo real, control de mermas/daños, contabilidad financiera avanzada y estadísticas ejecutivas diseñada para la administración eficiente de cafeterías universitarias y comerciales.

---

## 🚀 Características Principales

### 🛒 1. Punto de Venta (POS) & Cobro Multi-Entidad
- Catálogo interactivo de productos con filtrado por categoría y búsqueda en tiempo real.
- Carrito de compras responsivo con cálculo de subtotal y total.
- **Formas de Pago Avanzadas**:
  - `Efectivo`: Cálculo automático de cambio a entregar.
  - `Transferencia`: Registro y selección rápida de bancos/entidades (*Nequi*, *Daviplata*, *Bancolombia*, *Nu*, *Bre-B / Llave*, etc.) con opción de **dividir el pago entre múltiples bancos**.
  - `Pago Mixto`: Combinación de efectivo + abonos digitales desglosados por banco con validación estricta de totales y montos no nulos.
- Validación de duplicados de banco y prevención de entradas de monto `$0`.
- Autocompletado de clientes habituales y comprobante de venta impreso/digital.

### ⚠️ 2. Sistema de Reporte de Daños y Pérdidas de Insumos (Mermas)
- **Acceso General**: Todos los roles de usuario (*Dueño*, *Administrador*, *Empleado*) pueden reportar daños o pérdidas de insumos.
- **Descuento Automático**: Al registrar una merma (ej. vasos quebrados, leche vencida, derrames), la cantidad reportada se descuenta automáticamente del stock de inventario.
- **Historial Completo**: Registro auditable con fecha/hora, insumo afectado, cantidad perdida, unidad, motivo detallado y nombre del usuario declarante.

### 💰 3. Contabilidad Financiera & Registro Manual de Ingresos
- Reporte unificado de ingresos por ventas, ingresos manuales, egresos operativos y balance neto por periodos (`Hoy`, `Esta Semana`, `Este Mes`, `Histórico Total`).
- **Registro Manual de Ingresos**: Permite registrar ingresos extra no provenientes del POS (ventas externas, aportes de capital, devoluciones, otros) con descripción, monto, categoría y forma de pago. Se suman al total de ingresos y aparecen en el flujo de caja combinado.
- Registro de gastos por categorías (Insumos, Servicios, Mantenimiento, Nómina, Otros) con reabastecimiento directo de inventario.
- Las **ventas canceladas** se excluyen automáticamente de todos los cálculos de ingresos, métodos de pago y balance.

### 🛎️ 4. Comandas Diarias en Tiempo Real (Barra & Cocina)
- Generación automática de tickets de comanda al confirmar cada venta en el POS.
- **Filtro Diario Automático**: El tablero limpia la vista al inicio de cada jornada mostrando solo pedidos del día.
- Estados de comanda: `Pendientes` ➔ `En Preparación` ➔ `Listos` ➔ `Entregados` (o `Cancelados`).
- **Cancelación de Ventas (ventana de 5 minutos)**: Desde el tablero de comandas se puede cancelar una venta durante los 5 minutos posteriores a su creación. La venta **no se elimina**: queda marcada como `Cancelada` en el historial de ventas y deja de contar como ingreso en contabilidad y estadísticas.
- Sincronización instantánea vía Server-Sent Events (SSE).

### 🏆 5. Panel de Estadísticas Ejecutivas del Mes (Exclusivo Dueño)
- Accesible únicamente para el rol **Dueño (`owner`)**.
- **Métricas Clave**: Ventas Totales del Mes, Gastos Totales del Mes y Ganancia Neta.
- 🥇 **Mejor Vendedor del Mes**: Usuario que generó el mayor volumen de ventas.
- 🔥 **Producto Más Vendido del Mes**: Producto estrella con mayor número de unidades e ingresos.
- 🏆 **Top 10 Clientes**: Ranking de clientes frecuentes por volumen de compra.
- Todas las métricas excluyen las ventas canceladas.

### 🧾 6. Historial de Ventas con Estado
- Registro cronológico auditable de todas las ventas con recibo imprimible.
- **Columna de Estado**: Cada venta muestra su estado `Completada` o `Cancelada`. Las ventas canceladas se conservan en el historial (nunca se eliminan) pero no suman al total facturado.

### 👤 7. Perfil de Usuario & Gestión de Personal
- **Mi Perfil**: Cada usuario puede personalizar su nombre de usuario, contraseña y foto de perfil (avatar desde archivo local o enlace Google Drive).
- **Gestión de Personal (Dueño)**: Creación, edición de rol y eliminación de usuarios mediante transacciones atómicas que preservan intacto todo el historial contable y operativo.

### 🎨 8. Diseño Minimalista & Navegación Categorizada
- Iconografía limpia y minimalista basada en vectores **Lucide React** (sin emojis cliché).
- **Barra Lateral Categorizada**: Organizada en 4 módulos (*Operación & Ventas*, *Catálogo & Inventario*, *Finanzas & Control*, *Sistema & Cuenta*) con opción de colapsado compacto.

---

## 🛡️ Roles y Permisos

| Rol | POS & Ventas | Reportar Daños / Mermas | Ver Inventario | Gestionar Productos & Recetas | Contabilidad & Gastos | Estadísticas Ejecutivas | Gestión de Usuarios |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| ☕ **Empleado** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 🛡️ **Administrador** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 👑 **Dueño** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🛠️ Arquitectura Tecnológica

- **Backend**: Go 1.26, Router `Chi`, Driver PostgreSQL `pgx/v5`, Autenticación JWT, Server-Sent Events (SSE).
- **Frontend**: React 19, Vite, React Router v7, Vanilla CSS (Espresso Roasted Design), PWA.
- **Base de Datos**: PostgreSQL 14+ (Supabase / PostgreSQL Local).

---

## 💻 Instalación y Ejecución Local

### Prerrequisitos
- Go 1.22+
- Node.js 18+ y npm
- PostgreSQL corriendo localmente

### 1. Backend en Go (`Cafeteria/`)

1. Crea la base de datos en PostgreSQL:
   ```sql
   CREATE DATABASE "Cafeteria";
   ```

2. Configura las variables en `Cafeteria/.env`:
   ```env
   DB_URL=postgres://postgres:TU_PASSWORD@localhost:5432/Cafeteria?sslmode=disable
   # Mínimo 32 caracteres aleatorios; el servidor no arranca si falta o es corto.
   # Genérala con: openssl rand -base64 48
   JWT_SECRET=tu_clave_secreta_super_segura
   # Orígenes permitidos por CORS, separados por comas.
   # Por defecto: http://localhost:5173,http://127.0.0.1:5173
   ALLOWED_ORIGINS=http://localhost:5173
   ```

3. Compila y ejecuta el servidor backend:
   ```bash
   cd Cafeteria
   go run ./cmd/server
   ```
   *El servidor iniciará en `http://localhost:8080`.*

### 2. Frontend en React (`Cafeteriaweb/`)

1. Instala las dependencias e inicia Vite:
   ```bash
   cd Cafeteriaweb
   npm install
   npm run dev
   ```
   *El frontend abrirá en `http://localhost:5173`.*

---

## 📚 Documentación Detallada

Consulta [DOCUMENTATION.md](DOCUMENTATION.md) para la especificación completa de la aplicación: arquitectura, módulos, flujos de negocio, endpoints de la API, reglas de estados y esquema de base de datos.

---

## 📄 Licencia

Desarrollado con ❤️ para la gestión eficiente de cafeterías y negocios gastronómicos.
