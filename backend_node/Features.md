# Facturita-Pyme: Features Tecnicas

## 1. Sistema de Autenticacion y Registro de Usuarios

**Descripcion:**
- Identificar usuarios por su numero de WhatsApp
- En primer contacto, solicitar datos basicos del usuario (nombre, empresa, email, plan)
- Guardar perfil en base de datos
- Verificar existencia del usuario en cada mensaje para personalizar respuesta

**Componentes tecnicos:**
- Tabla `users` con campos: phone_number (PK), name, company_name, email, plan_type, created_at, last_activity
- Middleware de verificacion de usuario en cada webhook
- Endpoints de registro que guarden datos en BD
- Cache en memoria para optimizar busquedas frecuentes

**Flow:**
1. Mensaje llega -> Buscar usuario por phone_number
2. Si no existe -> Enviar mensaje de bienvenida + solicitar datos
3. Si existe -> Continuar con procesamiento normal
4. Guardar timestamp de ultima actividad

---

## 2. Sistema de Limites por Plan (Rate Limiting)

**Descripcion:**
- Diferentes planes: Free (5 imagenes/mes), Pro (100/mes), Premium (ilimitado)
- Validar antes de procesar imagen si el usuario ya alcanzo limite
- Mostrar consumo actual al usuario

**Componentes tecnicos:**
- Tabla `plans` con: plan_id, name, monthly_limit, price
- Tabla `user_usage` con: user_id, month, images_processed, tokens_spent, created_at
- Middleware de validacion de limite antes de OCR
- Sistema de reset mensual automatico
- Webhook para notificar cercamiento al limite

**Validaciones:**
- Verificar count de imagenes en mes actual
- Si count >= limit -> rechazar con mensaje "has alcanzado tu limite"
- Si count >= 80% -> advertencia preventiva

---

## 3. Validacion y Filtrado de Imagenes

**Descripcion:**
- Validar que la imagen sea legible y contenga un documento fiscal valido
- Detectar y rechazar imagenes que no son facturas (fotos, documentos invalidos, etc.)
- Guardar razon de rechazo

**Componentes tecnicos:**
- Pre-procesamiento de imagen (validar dimensiones, calidad)
- Prompt especifico en Gemini para clasificacion previa
- Tabla `rejected_images` con: user_id, timestamp, reason, image_hash
- Sistema de logging detallado de rechazos

**Flujo de validacion:**
1. Verificar tamano de archivo (min 50KB, max 10MB)
2. Verificar resolucion minima (640x480)
3. Enviar a Gemini con prompt de clasificacion
4. Si no es documento fiscal -> rechazar con motivo especifico
5. Si es valido -> continuar con OCR completo

---

## 4. Integracion Google Sheets + Base de Datos Dual

**Descripcion:**
- Guardar facturas extraidas en BD PostgreSQL local
- Simultaneamente, pushear a Google Sheets del usuario
- Sincronizar cambios bidireccionales (usuario edita en Sheets -> actualiza en BD)

**Componentes tecnicos:**
- Tabla `invoices` con: id, user_id, proveedor, cuit, fecha, numero_factura, total, iva, created_at, synced_to_sheets
- OAuth2 Google Sheets API authentication
- Worker para sincronizacion cada X minutos
- Tabla `sync_logs` para auditoria de cambios
- Conflicto resolver (si cambio en ambos lados)

**Flow:**
1. OCR extrae datos -> Guardar en tabla `invoices`
2. Trigger automatico: pushear a Google Sheet del usuario
3. Cada cambio en BD marca timestamp de sync
4. Worker periodico busca cambios en Sheets y actualiza BD
5. En caso de conflicto, Sheets tiene prioridad (usuario edits)

---

## 5. Sistema de Comandos de Usuario

**Descripcion:**
- Usuarios pueden ejecutar comandos via WhatsApp
- Comandos para: ver stats, exportar, cambiar plan, obtener ayuda, etc.
- Respuestas dinamicas segun estado del usuario

**Comandos disponibles:**

| Comando | Funcion | Respuesta |
|---------|---------|----------|
| `/estadisticas` | Ver consumo mensual | Imagenes procesadas, tokens gastados, % uso |
| `/exportar` | Descargar todas sus facturas | Archivo CSV o JSON enviado via WhatsApp |
| `/plan` | Ver plan actual y upgrade | Mostrar plan, uso, opciones de upgrade |
| `/ayuda` | Ver comandos disponibles | Menu de ayuda con descripcion de cada uno |
| `/conectar-sheets` | Iniciar OAuth Google | Link autenticacion + confirmacion |
| `/facturas-recientes` | Ultimas 5 facturas | Tabla con datos resumidos |
| `/eliminar-factura [id]` | Borrar una factura | Confirmacion y eliminacion en BD + Sheets |

**Componentes tecnicos:**
- Router de comandos que mapee `/comando` a handler
- Tabla `command_logs` para auditoria
- Respuestas templated personalizadas por usuario

---

## 6. Estimacion de Tokens Gastados por Usuario (Gemini)

**Descripcion:**
- Trackear tokens usados por usuario con Google Gemini
- Calcular costo aproximado segun modelo
- Informar al usuario su consumo

**Componentes tecnicos:**
- Tabla `token_usage` con: user_id, timestamp, model_used, input_tokens, output_tokens, cost_usd
- Capturar metadata de respuesta Gemini: `usageMetadata.promptTokens`, `usageMetadata.completionTokens`
- Calculo de costo: Gemini 2.0 Flash = $0.075/1M input + $0.30/1M output
- Dashboard en stats que muestre gasto total por usuario
- Alert si usuario aproxima presupuesto mensual

**Flow:**
1. Cada llamada a Gemini captura usage
2. Guardar en tabla `token_usage`
3. En `/estadisticas` mostrar: total tokens, costo estimado, proyeccion
4. Aviso si > $5/mes (ejemplo limite)

---

## Resumen Arquitectura Base

```
WhatsApp Webhook
    |
[Usuario existe?] -> NO -> Solicitar registro
    |
    v YES
[Limite alcanzado?] -> YES -> Rechazar
    |
    v NO
[Validar imagen] -> INVALIDA -> Rechazar + guardar razon
    |
    v VALIDA
[OCR Gemini] -> Extraer datos
    |
    v
[Guardar en BD] -> Tabla invoices
    |
    v
[Push a Google Sheets]
    |
    v
[Track tokens] -> Tabla token_usage
    |
    v
[Responder usuario]
```

---

## Otros Features Sugeridos (Fase 2)

### 7. **Reconocimiento de Patrones Recurrentes**
- Detectar proveedores frecuentes
- Sugerir categorizacion automatica
- Alertar sobre gastos anormales

### 8. **Reportes Automaticos**
- Reporte diario/semanal/mensual por email
- Resumen de gastos por categoria
- Comparativa mes a mes

### 9. **Integracion con Contabilidad**
- Exportar a Contabilizame, SQM, etc.
- Formato de archivo contable (JSON/XML)
- Validacion de impuestos

### 10. **Chat Inteligente (RAG)**
- Usuario pregunta: "cuanto gaste en servicios en octubre?"
- Sistema busca en su historial y responde
- Memory a corto plazo para contexto

### 11. **OCR Mejorado**
- Detectar moneda (ARS, USD, etc)
- Extraccion de descuentos y percepciones
- Validacion de CUIT real vs ficticio

### 12. **Sistema de Categorias**
- Categorizar automaticamente (servicios, insumos, etc)
- Permitir al usuario crear categorias custom
- Reportes por categoria

### 13. **Validacion de Legitimidad**
- Consultar CUIT en AFIP API
- Verificar que RUT/CUIT sea valido
- Alertar sobre facturas de RUT "fantasma"

### 14. **Notificaciones**
- Alerta cuando factura duplicada (mismo CUIT + monto)
- Recordatorio para completar datos faltantes
- Notificacion de plan por vencer

### 15. **Multi-idioma**
- Soportar espanol, ingles, portugues
- Respuestas dinamicas segun idioma

### 16. **Integracion Stripe**
- Pagos de planes via WhatsApp
- Recibos automaticos
- Gestion de suscripcion

### 17. **API REST**
- Endpoints para apps terceras
- Integracion con software contable
- Webhooks salientes para notificaciones

### 18. **Analytics Dashboard**
- Panel web para ver estadisticas
- Graficos de gastos
- KPIs de negocio

### 19. **Generador Instantaneo de Link de Pago o QR**
- Generar links de pago desde WhatsApp directamente
- Integrar con Mercado Pago, Mobbex, o plataforma propia
- Crear QR que el cliente puede escanear
- Conciliacion automatica de pagos con facturas
- Registro de cobros para auditar

### 20. **Generador Rapido de Documentos (Presupuestos/Remitos)**
- Crear presupuestos profesionales desde WhatsApp
- Generar remitos y notas de pedido
- Usar plantillas con logo de la empresa
- Almacenar documentos generados en nube
- Integrar con sistema de inventario

---

## FEATURE #5: Generador Instantaneo de Link de Pago o QR

**Descripcion:**
Permitir que vendedores generen links de pago o QR desde WhatsApp sin salir de la app, resolviendo cobranza rapida y conciliacion de pagos.

**Componentes tecnicos:**

### 5.1 Integracion con Plataforma de Pago
- Integrar API de Mercado Pago, Mobbex, o similar
- Crear endpoint que genere link de pago con:
  - Monto especifico
  - Descripcion/referencia
  - ID de transaccion interno
  - Informacion del vendedor/cliente
- Retornar link corto y opcionalmente QR (como imagen)

### 5.2 Comando de Generacion de Link
Comando en WhatsApp: `/cobrar [monto] [referencia]`

Ejemplo: `/cobrar 25000 Venta Botines N 45`

Flujo:
1. Vendedor envia comando
2. Sistema valida monto (rango permitido segun plan)
3. Genera link unico en plataforma de pago
4. Retorna link + QR al vendedor
5. Vendedor comparte link con cliente

### 5.3 Generacion de QR
- Usar libreria `qrcode` para generar QR
- QR contiene URL del pago
- Enviar QR como imagen por WhatsApp
- Tambien retornar URL texto para flexibilidad

### 5.4 Conciliacion Automatica de Pagos
- Tabla `payment_links` con: id, user_id, amount, reference, status, created_at, paid_at
- Usar webhook de Mercado Pago para detectar pagos confirmados
- Cuando pago se confirma: actualizar status a "pagado"
- Vincular pago con factura si existe
- Registrar en tabla `payments` con timestamp y metadata

### 5.5 Registro de Cobros
- Tabla `payment_history` con: user_id, payment_link_id, amount, currency, status, timestamp
- Mostrar en comando `/cobros-hoy` o `/historial-pagos`
- Calcular total cobrado en periodo (diario, mensual)

### 5.6 Seguridad
- Validar que vendedor solo genera links para SU empresa
- Limites por usuario: maximo X links/dia segun plan
- Validar monto minimo/maximo permitido
- Guardar quien genero el link y cuando
- Webhook autenticado para confirmar pagos

### 5.7 Comisiones y Reportes
- Calcular comision de plataforma de pago (ej. 2.9% + $0.30)
- Restar comision del monto final reportado
- Dashboard mostrando: total cobrado, comisiones, neto

---

## FEATURE #6: Generador Rapido de Documentos (Presupuestos/Remitos)

**Descripcion:**
Permitir que vendedores creen documentos profesionales (presupuestos, remitos, notas de pedido) desde WhatsApp usando plantillas, sin necesidad de software de oficina.

**Componentes tecnicos:**

### 6.1 Tipos de Documentos Soportados
1. **Presupuesto** - Oferta de venta con validez de fecha
2. **Remito** - Comprobante de entrega de productos
3. **Nota de Pedido** - Registro de pedido del cliente
4. **Recibo** - Comprobante de pago recibido

### 6.2 Comando de Generacion
Comando: `/[tipo-doc] [datos]`

Ejemplos:
- `/presupuesto Cliente: Juan Perez | Producto: 5 Lts Pintura Blanca | Total: 5000 | Valido: 30/11`
- `/remito Cliente: Juan Perez | Productos: 5 Lts Pintura | Cantidad: 5 | Total: 5000`
- `/nota-pedido Cliente: Juan Perez | Producto: Pintura Blanca | Cantidad: 10`

### 6.3 Plantillas de Documentos
- Almacenar plantillas en HTML/PDF con placeholders
- Incluir: logo empresa, encabezados, numeracion, espacios para datos
- Datos a incluir: numero (auto-incremental), fecha, cliente, productos, cantidades, precios, total
- Validar empresa tiene plantillas configuradas
- Permitir personalizacion: colores, logo, pie de pagina

### 6.4 Procesamiento de Comando
Flujo:
1. Parsear comando y extraer datos
2. Validar que cliente existe o crear uno nuevo
3. Obtener plantilla de documento para la empresa
4. Reemplazar placeholders con datos
5. Generar PDF o imagen
6. Guardar en almacenamiento en nube
7. Enviar documento por WhatsApp

### 6.5 Almacenamiento y Archivado
- Tabla `generated_documents` con: id, user_id, doc_type, doc_number, client_id, content_url, created_at
- Almacenar PDF en Cloud Storage (Google Cloud Storage o AWS S3)
- Asignar numero de documento auto-incremental por tipo
- Permitir descargar documento desde comando `/descargar-doc [numero]`

### 6.6 Auditoria y Control
- Registrar quien genero cada documento
- Guardar timestamp de creacion
- Mantener historial: presupuestos generados, remitos emitidos, etc
- Generar reportes: total documentos/mes, por tipo

### 6.7 Integracion con Sistema de Inventario
- Integrar con tabla `invoices` si es una factura oficial
- Descontar stock automático si es remito de salida
- Vincular presupuesto con factura posterior
- Rastrear: presupuesto -> remito -> factura -> pago

### 6.8 Validacion de Datos
- Cliente requerido (nombre minimo)
- Productos requeridos (nombre y monto)
- Total calcula automaticamente
- Validar que datos estan en formato correcto
- Mostrar preview antes de generar si es posible

### 6.9 Comandos Relacionados
- `/mis-presupuestos` - Listar ultimos presupuestos generados
- `/mis-remitos` - Listar ultimos remitos
- `/converter-presupuesto-factura [numero]` - Convertir presupuesto en factura
- `/estadisticas-docs` - Total docs generados este mes

---

---

## 7. POLITICAS DE SEGURIDAD Y CUMPLIMIENTO LEGAL

**Descripcion:**
- Validar contenido inapropiado en imagenes
- Proteger privacidad del usuario
- Cumplir normativas legales (GDPR, CCPA, leyes argentinas)
- Auditar acceso a datos sensibles

**Componentes tecnicos:**

### 7.1 Validacion de Contenido Inapropiado
- Integrar Content Moderation de Google Vision API
- Detectar: documentos falsos, pornografia, violencia, etc
- Flag automatico: si imagen tiene contenido inapropiado -> rechazar
- Tabla `flagged_uploads` para auditar intentos de carga prohibida

### 7.2 Privacidad y Datos Personales
- Datos capturados (nombres, CUIT, montos) son SENSIBLES
- Encriptacion en transito (HTTPS obligatorio)
- Encriptacion en reposo para datos en BD (AES-256)
- NO almacenar imagenes originales permanentemente
- Borrar imagenes procesadas despues de 30 dias
- Tabla `data_retention_policy` con timestamps de eliminacion

### 7.3 Terminos de Servicio (TOS)
Debe incluir:
- Usuario acepta que datos se procesan con IA
- Usuario responsable de compartir documentos validos
- Prohibicion de falsificar, alterar o usar facturas de otros
- Compromiso de no vender datos a terceros
- Derecho a eliminar datos en cualquier momento

### 7.4 Politica de Privacidad (GDPR/CCPA/Argentina)
Debe especificar:
- Que datos recopilamos (phone, nombre, empresa, facturas)
- Para que los usamos (OCR, almacenamiento, reportes)
- Con quien los compartimos (Google para procesamiento, Sheets user)
- Cuanto tiempo los guardamos
- Derechos del usuario (acceso, correccion, eliminacion)
- Procedimiento para solicitar DERECHO AL OLVIDO

### 7.5 Seguridad de Imagenes
- NO guardar imagen original luego de OCR exitoso
- Si OCR falla: guardar imagen hasheada (no recuperable)
- Solo guardar metadata: tamanno, formato, timestamp, hash
- Acceso a imagenes solo con autenticacion usuario

### 7.6 Auditoria y Logging
- Tabla `audit_logs` con: user_id, action, timestamp, ip_address, resultado
- Registrar: acceso a datos, descargas, cambios, eliminaciones
- Retencion: 1 ano minimo
- Alertas si: acceso anormal, cambios masivos, etc

### 7.7 Autenticacion y Autorizacion
- Cada usuario SOLO puede ver sus propios datos
- Admin dashboard solo para owner/staff autenticados
- 2FA recomendado para cambios de plan o datos sensibles
- Revocacion de sesiones si se detecta actividad sospechosa

### 7.8 RESPONSABILIDAD LEGAL (Argentina)
- Usuario acepta que NO se valida si CUIT es real
- Usuario responsable de confirmar validez de documento
- Facturita-Pyme no es responsable por fraude/falsificacion
- Mantener registro de quien subio cada factura y cuando
- Cooperar con autoridades si se solicita (ley Argentina)

### 7.9 Eliminacion de Datos (DERECHO AL OLVIDO)
Implementar endpoint `/delete-all-data` que:
- Elimine usuario de tabla `users`
- Elimine todas sus facturas de tabla `invoices`
- Borre referencias de BD
- Mantenga registro de eliminacion para cumplimiento legal
- Envie confirmacion por WhatsApp
- Retener: solo logs anonimizados para estadisticas

### 7.10 Notificacion de Brechas de Seguridad
- Si se detecta acceso no autorizado:
  1. Notificar usuario inmediatamente
  2. Resetear contraseñas/sesiones
  3. Documentar incidente
  4. Reportar a autoridades si es necesario
  5. Comunicado publico si afecta >1000 usuarios

---

## Prioridad Recomendada

**MVP (Actual + Fase 1) - INCLUIR PRIMERO:**
1. OCR basico funcionando
2. Validacion de imagenes
3. Politicas de Seguridad #7 (LEGAL/COMPLIANCE)
   - Terminos de Servicio
   - Politica de Privacidad
   - Validacion de contenido inapropiado
   - Auditoria basica
4. Sistema de usuarios (Feature #1)
5. Google Sheets integration (Feature #4)
6. Comandos basicos (Feature #5)

**Fase 2 (Proximas 2-4 semanas):**
- Feature #2: Limites por plan
- Feature #6: Token tracking
- Feature #7: Patrones recurrentes
- Feature #8: Reportes automaticos
- Encriptacion de datos en BD
- 2FA para usuarios

**Fase 3+ (Largo plazo):**
- Features 9-18 segun demanda del mercado
- Conformidad completa con GDPR
- Certificacion de seguridad (ISO 27001 opcional)
