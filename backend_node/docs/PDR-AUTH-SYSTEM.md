# PDR: Sistema de Autenticación y Registro de Usuarios por WhatsApp

**Versión:** 1.0
**Fecha:** 2025-12-11
**Estado:** Planificación
**Proyecto:** Factura Scanner MVP

---

## 📋 Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Objetivos](#objetivos)
3. [Tecnologías](#tecnologías)
4. [Arquitectura](#arquitectura)
5. [Estructura de Base de Datos](#estructura-de-base-de-datos)
6. [Componentes a Implementar](#componentes-a-implementar)
7. [Flujo de Implementación](#flujo-de-implementación)
8. [Endpoints](#endpoints)
9. [Validaciones y Seguridad](#validaciones-y-seguridad)
10. [Consideraciones Especiales](#consideraciones-especiales)

---

## 1. Descripción General

Sistema de autenticación y registro de usuarios basado en números de teléfono de WhatsApp. Permite:

- Identificar y rastrear usuarios automáticamente por su número de WhatsApp
- Capturar información básica del usuario en el primer contacto
- Mantener un perfil de usuario para personalizar respuestas
- Rastrear actividad del usuario para análisis

**Contexto:** Este sistema es el fundamento para funcionalidades futuras como planes de suscripción, límites de uso, estadísticas personalizadas y gestión de facturas por usuario.

---

## 2. Objetivos

### Funcionales
- ✅ Identificar usuarios por número de WhatsApp
- ✅ Capturar datos básicos en primer contacto (nombre, empresa, email, plan)
- ✅ Persistir información en base de datos
- ✅ Verificar existencia de usuario en cada mensaje
- ✅ Personalizar respuestas según perfil del usuario
- ✅ Rastrear última actividad

### No Funcionales
- ✅ Rendimiento: Búsquedas de usuario < 100ms con cache
- ✅ Disponibilidad: 99.9% uptime
- ✅ Escalabilidad: Soportar 10,000+ usuarios concurrentes
- ✅ Mantenibilidad: Código limpio y bien documentado

---

## 3. Tecnologías

### Stack Actual (a mantener)
```json
{
  "Runtime": "Node.js 18+",
  "Framework": "Hono (web)",
  "ORM/Query": "Nuevo - a definir",
  "BD": "Nuevo - a definir",
  "API Messaging": "Kapso WhatsApp Cloud API"
}
```

### Opciones de Base de Datos (Recomendado)

#### **Opción A: PostgreSQL (RECOMENDADO)**
**Ventajas:**
- ✅ Relacional, escalable, confiable
- ✅ Soporte nativo para TypeScript/Node.js
- ✅ Transacciones ACID
- ✅ Ideal para datos estructurados de usuarios

**Librerías:**
- `prisma` - ORM moderno y type-safe
- `pg` - Driver nativo PostgreSQL
- `knex.js` - Query builder alternativo

**Setup:**
```bash
npm install @prisma/client prisma dotenv
npm install -D @types/node typescript
```

#### **Opción B: MongoDB**
**Ventajas:**
- ✅ Flexible, sin esquema estricto
- ✅ Escalabilidad horizontal
- ✅ Integración rápida

**Librerías:**
- `mongoose` - ODM popular
- `mongodb` - Driver oficial

#### **Opción C: SQLite (Desarrollo rápido)**
**Ventajas:**
- ✅ Sin servidor externo, archivo local
- ✅ Ideal para MVP/testing
- ⚠️ Limitado para producción con alto volumen

**Decisión recomendada:** **PostgreSQL + Prisma**
- Combina lo mejor de ambos mundos
- Type-safe
- Fácil migración futura
- Soporte para relaciones complejas

---

## 4. Arquitectura

### Estructura de Carpetas

```
src/
├── index.ts                          # Entry point (actual)
├── kapso.ts                          # WhatsApp API (actual)
├── ocr.ts                            # OCR Gemini (actual)
├── sheet.ts                          # Google Sheets (actual)
│
├── auth/                             # [NUEVO] Sistema de autenticación
│   ├── userService.ts                # Lógica de negocio de usuarios
│   ├── userRepository.ts             # Acceso a datos (BD)
│   ├── userValidator.ts              # Validaciones de entrada
│   └── registrationFlow.ts           # Flujo de registro interactivo
│
├── db/                               # [NUEVO] Base de datos
│   ├── client.ts                     # Inicialización de Prisma
│   ├── migrations/                   # Migraciones de schema
│   └── seeds/                        # Datos iniciales (testing)
│
├── middleware/                       # [NUEVO] Middlewares
│   ├── userContext.ts                # Middleware que obtiene usuario
│   └── auth.ts                       # Validaciones de autorización
│
├── types/                            # [NUEVO] Tipos TypeScript
│   └── user.ts                       # Interfaz User
│
└── utils/                            # [NUEVO] Utilidades
    └── cache.ts                      # Cache en memoria
```

### Flujo de Integración

```
Mensaje WhatsApp
    ↓
┌─────────────────────────────┐
│ Webhook POST /webhook       │ (actual)
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│ [NUEVO] userContextMiddleware│  ← Obtiene usuario o crea registro
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│ processMessage()             │ (actual, modificado)
│ - Accede a context.user      │
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│ handleTextMessage()          │ (modificado)
│ handleImageMessage()         │ (modificado)
└─────────────────────────────┘
```

---

## 5. Estructura de Base de Datos

### Tabla: `users`

```sql
CREATE TABLE users (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,  -- +54 9 11 12345678

  -- Datos básicos
  name VARCHAR(100),
  company_name VARCHAR(150),
  email VARCHAR(100),

  -- Plan y estado
  plan_type VARCHAR(50) DEFAULT 'free',  -- free, pro, enterprise
  status VARCHAR(20) DEFAULT 'active',    -- active, inactive, banned

  -- Verificación
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT true,    -- Ya verificado por WhatsApp
  registration_complete BOOLEAN DEFAULT false,

  -- Rastreo
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_id VARCHAR(255),

  -- Metadata
  preferences JSONB DEFAULT '{}',         -- Configuraciones personalizadas
  metadata JSONB DEFAULT '{}'             -- Datos adicionales
);

-- Índices para optimización
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_activity ON users(last_activity);
```

### Tabla: `registration_sessions` (Opcional - para registro multi-paso)

```sql
CREATE TABLE registration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,

  -- Datos capturados
  step INT DEFAULT 1,                      -- 1=name, 2=company, 3=email, 4=plan
  captured_data JSONB DEFAULT '{}',

  -- Control
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours',
  completed BOOLEAN DEFAULT false,

  FOREIGN KEY (phone_number) REFERENCES users(phone_number)
);
```

---

## 6. Componentes a Implementar

### 6.1 Tipos TypeScript

**Archivo:** `src/types/user.ts`

```typescript
// Interfaz principal
export interface User {
  id: string;
  phone_number: string;
  name: string | null;
  company_name: string | null;
  email: string | null;
  plan_type: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'inactive' | 'banned';
  email_verified: boolean;
  phone_verified: boolean;
  registration_complete: boolean;
  created_at: Date;
  updated_at: Date;
  last_activity: Date;
  preferences?: Record<string, any>;
}

// DTOs (Data Transfer Objects)
export interface CreateUserDTO {
  phone_number: string;
  name?: string;
  company_name?: string;
  email?: string;
  plan_type?: string;
}

export interface UpdateUserDTO {
  name?: string;
  company_name?: string;
  email?: string;
  preferences?: Record<string, any>;
}

// Respuesta de API
export interface UserResponse {
  user: User;
  is_new: boolean;
  message: string;
}
```

### 6.2 Repository (Acceso a Datos)

**Archivo:** `src/auth/userRepository.ts`

Responsabilidades:
- CRUD de usuarios
- Búsquedas por phone_number, email
- Actualización de last_activity
- Transacciones de registro

Métodos principales:
```typescript
// Búsqueda
async findByPhoneNumber(phone: string): Promise<User | null>
async findById(id: string): Promise<User | null>
async findByEmail(email: string): Promise<User | null>

// Creación
async create(data: CreateUserDTO): Promise<User>

// Actualización
async update(id: string, data: UpdateUserDTO): Promise<User>
async updateLastActivity(id: string): Promise<void>
async markRegistrationComplete(id: string): Promise<User>

// Búsquedas avanzadas
async findRecentUsers(days: number): Promise<User[]>
async findByPlan(plan: string): Promise<User[]>
```

### 6.3 Service (Lógica de Negocio)

**Archivo:** `src/auth/userService.ts`

Responsabilidades:
- Lógica de autenticación y registro
- Orquestación entre repository y validadores
- Generación de mensajes personalizados
- Manejo de estado de registro

Métodos principales:
```typescript
// Obtener o crear usuario
async getOrCreateUser(phone: string): Promise<{
  user: User;
  isNew: boolean;
}>

// Procesamiento de registro
async submitRegistrationData(
  phone: string,
  step: number,
  data: any
): Promise<User>

// Obtener contexto de usuario (para personalización)
async getUserContext(phone: string): Promise<UserContext>

// Validaciones
async isPhoneNumberRegistered(phone: string): Promise<boolean>
async isEmailAvailable(email: string): Promise<boolean>
```

### 6.4 Validador

**Archivo:** `src/auth/userValidator.ts`

Validaciones:
- Formato de número de teléfono
- Formato de email
- Longitud de nombre/empresa
- Datos requeridos vs opcionales

```typescript
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: any;
}

export function validatePhoneNumber(phone: string): ValidationResult
export function validateEmail(email: string): ValidationResult
export function validateUserName(name: string): ValidationResult
export function validateCompanyName(company: string): ValidationResult
```

### 6.5 Cache en Memoria

**Archivo:** `src/utils/cache.ts`

- Cachear usuarios frecuentes (últimas 100 búsquedas)
- TTL: 5 minutos
- Actualizar automáticamente en cambios

```typescript
export class UserCache {
  private cache: Map<string, CachedUser> = new Map()
  private ttl: number = 5 * 60 * 1000  // 5 minutos

  async get(phone: string): Promise<User | null>
  async set(phone: string, user: User): Promise<void>
  async invalidate(phone: string): Promise<void>
  async clear(): Promise<void>
}
```

### 6.6 Middleware

**Archivo:** `src/middleware/userContext.ts`

Middleware que:
1. Extrae número de WhatsApp del mensaje
2. Busca/crea usuario
3. Actualiza last_activity
4. Adjunta usuario a contexto Hono

```typescript
// Uso en index.ts
app.use('*', userContextMiddleware)

// Acceso en handlers
app.post('/webhook', async (c) => {
  const user = c.get('user')  // ← Usuario obtenido automáticamente
  console.log(user.phone_number)
})
```

### 6.7 Flujo de Registro

**Archivo:** `src/auth/registrationFlow.ts`

Gestiona el flujo multi-paso:
- Paso 1: Nombre
- Paso 2: Empresa
- Paso 3: Email
- Paso 4: Plan

```typescript
async function handleRegistrationStep(
  user: User,
  step: number,
  message: string
): Promise<string>  // Retorna mensaje siguiente

// Retorna mensajes tipo:
// "¿Cuál es tu nombre?"
// "¿Nombre de tu empresa?"
// "¿Tu email?"
// "¿Qué plan prefieres? Escribe: free / pro / enterprise"
```

---

## 7. Flujo de Implementación

### Fase 1: Configuración Base (Días 1-2)

**Tareas:**
1. Instalar Prisma y dependencias
2. Crear archivo `.env` con variables de BD
3. Inicializar Prisma project
4. Crear schema de BD
5. Ejecutar migraciones
6. Crear tipos TypeScript

**Archivos a crear:**
- `src/db/client.ts`
- `src/types/user.ts`
- `prisma/schema.prisma`
- `.env` (actualizado)

---

### Fase 2: Capas de Datos (Días 3-4)

**Tareas:**
1. Implementar `userRepository.ts` con métodos CRUD
2. Crear funciones de búsqueda y actualización
3. Implementar cache en `utils/cache.ts`
4. Crear índices en base de datos

**Archivos a crear:**
- `src/auth/userRepository.ts`
- `src/utils/cache.ts`

---

### Fase 3: Lógica de Negocio (Días 5-6)

**Tareas:**
1. Implementar `userService.ts`
2. Crear `userValidator.ts` con validaciones
3. Implementar `registrationFlow.ts` para pasos de registro
4. Crear tipos de respuesta

**Archivos a crear:**
- `src/auth/userService.ts`
- `src/auth/userValidator.ts`
- `src/auth/registrationFlow.ts`

---

### Fase 4: Integración (Días 7-8)

**Tareas:**
1. Crear middleware `userContext.ts`
2. Integrar middleware en `index.ts`
3. Modificar `processMessage()` para usar usuario
4. Modificar handlers para personalizar respuestas
5. Testing básico

**Archivos a modificar:**
- `src/index.ts` (agregar middleware, usar contexto)
- `src/middleware/userContext.ts` (nuevo)

---

### Fase 5: Testing y Refinamiento (Días 9-10)

**Tareas:**
1. Crear tests unitarios para validaciones
2. Crear tests de integración para flujos
3. Testing manual con WhatsApp
4. Optimizaciones de performance
5. Documentación

---

## 8. Endpoints

### 8.1 Endpoints Nuevos

#### `GET /api/user/profile`
**Descripción:** Obtener perfil del usuario actual

**Headers:**
```
X-WhatsApp-Phone: +549112345678
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "phone_number": "+549112345678",
    "name": "Juan",
    "company_name": "TechCorp",
    "email": "juan@techcorp.com",
    "plan_type": "pro",
    "registration_complete": true,
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

#### `PUT /api/user/profile`
**Descripción:** Actualizar perfil del usuario

**Body:**
```json
{
  "name": "Juan Carlos",
  "company_name": "TechCorp SRL",
  "email": "juan.carlos@techcorp.com"
}
```

**Response (200):**
```json
{
  "user": { ... },
  "message": "Perfil actualizado exitosamente"
}
```

#### `POST /api/user/email/verify`
**Descripción:** Enviar email de verificación

**Response (200):**
```json
{
  "message": "Email de verificación enviado"
}
```

---

### 8.2 Endpoints Modificados

#### `POST /webhook` (Existente, con cambios)

**Cambios:**
- Agregar middleware de `userContext`
- Usuario disponible en `c.get('user')`
- Rastrear actividad automáticamente

---

## 9. Validaciones y Seguridad

### 9.1 Validaciones de Entrada

| Campo | Validación | Ejemplo |
|-------|-----------|---------|
| phone_number | Formato WhatsApp (con +54) | `+549112345678` |
| name | 2-100 caracteres, sin caracteres especiales | `Juan` |
| company_name | 2-150 caracteres | `TechCorp SRL` |
| email | RFC 5322, único en BD | `juan@company.com` |
| plan_type | Solo valores permitidos | `free`, `pro`, `enterprise` |

### 9.2 Seguridad

**Implementar:**
- ✅ Validación de teléfono por WhatsApp (ya garantizado por Kapso)
- ✅ Rate limiting en registro (máx 3 intentos por hora)
- ✅ Encriptación de emails en reposo (opcional con Prisma)
- ✅ Sanitización de entrada contra XSS/SQL injection
- ✅ HTTPS en producción
- ✅ Logs de actividad

**No implementar en MVP:**
- ❌ Autenticación por contraseña (identificación por teléfono)
- ❌ 2FA (ya verificado por WhatsApp)
- ❌ Encriptación de contraseña (no aplica)

---

## 10. Consideraciones Especiales

### 10.1 Privacidad y GDPR

**Consideraciones:**
- Derecho al olvido: Implementar `DELETE` lógico
- Consentimiento: Guardar timestamp de aceptación de términos
- Datos sensibles: Email solo si usuario lo proporciona

**Recomendación:**
Agregar campo `consent_date` y `delete_requested` en tabla `users`

### 10.2 Formato de Teléfono

**Normalización:**
```
Entrada: "1123456789" o "+549112345678"
Normalización: "+549112345678"

Validar:
- Comienza con +54 (Argentina)
- 10-13 dígitos después del +54
```

### 10.3 Flujo de Primer Contacto

**Conversación esperada:**

```
Bot: "👋 Hola! Bienvenido a Factura Scanner"
Bot: "Para personalizarte la experiencia, ¿cuál es tu nombre?"
User: "Juan"

Bot: "¡Hola Juan! ¿Nombre de tu empresa?"
User: "TechCorp"

Bot: "¿Tu email? (para enviar reportes)"
User: "juan@techcorp.com"

Bot: "¿Qué plan prefieres?"
Bot: "📦 free - Escaneo ilimitado, datos en spreadsheet"
Bot: "💎 pro - Integración API, reportes avanzados"
User: "free"

Bot: "✅ Perfil completado! Estoy listo para procesar tus facturas"
```

### 10.4 Rastreo de Actividad

**Actualizar `last_activity`:**
- En cada mensaje recibido
- En cada comando ejecutado
- En cada vista de perfil

**Usar para:**
- Identificar usuarios inactivos (análisis)
- Personalizar timeouts
- Análisis de engagement

### 10.5 Plan Type - Definición Futura

**Actualmente:** Campo reservado para futura expansión

**Planes propuestos:**
```
free:       Ilimitado (MVP actual)
pro:        100 facturas/mes, API, reportes
enterprise: Custom, soporte dedicado
```

---

## 11. Variables de Entorno Nuevas

Agregar a `.env`:

```bash
# === Base de Datos ===
DATABASE_URL="postgresql://user:password@localhost:5432/factura_scanner"

# === Cache ===
CACHE_TTL_MINUTES=5
MAX_CACHE_SIZE=100

# === Seguridad ===
RATE_LIMIT_REGISTRATION=3        # 3 intentos por hora
RATE_LIMIT_WINDOW_MINUTES=60

# === Privacidad ===
DELETE_GRACE_PERIOD_DAYS=30      # 30 días antes de eliminar datos
```

---

## 12. Dependencias a Instalar

```bash
# ORM
npm install @prisma/client prisma

# Database driver (PostgreSQL)
npm install pg

# Validación
npm install zod
# o
npm install joi

# Utilidades
npm install date-fns

# (Opcional) Logging
npm install pino

# DevDependencies
npm install -D prisma @types/node
```

---

## 13. Checklist de Implementación

- [ ] Fase 1: Configuración Base
  - [ ] Prisma instalado
  - [ ] Schema de BD creado
  - [ ] Tipos TypeScript definidos

- [ ] Fase 2: Capas de Datos
  - [ ] Repository implementado
  - [ ] Cache funcionando

- [ ] Fase 3: Lógica de Negocio
  - [ ] Service implementado
  - [ ] Validadores funcionales
  - [ ] Flujo de registro definido

- [ ] Fase 4: Integración
  - [ ] Middleware creado
  - [ ] Integración en index.ts
  - [ ] Handlers personalizados

- [ ] Fase 5: Testing
  - [ ] Tests unitarios pasando
  - [ ] Testing manual completado
  - [ ] Documentación actualizada

---

## 14. Referencias y Recursos

### Documentación
- [Prisma ORM](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)
- [Hono Middleware](https://hono.dev/docs/guides/middleware)

### Ejemplos de Código
- UserService pattern: Separación de concerns
- Repository pattern: Abstracción de datos
- Middleware pattern: Inyección de contexto

---

**Fin del PDR**

---

## Próximos Pasos

1. **Revisar este documento** con el equipo
2. **Validar decisión de BD** (PostgreSQL recomendado)
3. **Preparar entorno de desarrollo** (Docker, etc.)
4. **Comenzar Fase 1** cuando esté aprobado

