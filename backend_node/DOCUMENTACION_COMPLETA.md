# 📦 FACTURA WHATSAPP - DOCUMENTACIÓN COMPLETA

Este archivo contiene TODA la documentación del proyecto.
Puedes copiar las secciones que necesites.

═══════════════════════════════════════════════════════════════════

## 📑 ÍNDICE

1. QUICKSTART - Inicio rápido (5 min)
2. README - Guía completa del proyecto
3. TODO - Tareas pendientes
4. CLAUDE CODE - Trabajar con Claude Code
5. COSTOS - Análisis de costos
6. DOCS - Links y referencias

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 1️⃣ QUICKSTART - Inicio en 5 Minutos

## Instalación

```bash
# Crear proyecto
mkdir factura-whatsapp && cd factura-whatsapp

# Copiar archivos de código (index.ts, kapso.ts, etc)
# Ver archivos que ya tenés

# Instalar
npm install
```

## Configurar .env

```env
PORT=3000
KAPSO_API_KEY=tu_api_key
KAPSO_PHONE_NUMBER_ID=597907523413541
GEMINI_API_KEY=tu_gemini_key
WEBHOOK_VERIFY_TOKEN=factura-mvp-token
```

## Correr

```bash
npm run dev
```

## Exponer con ngrok

```bash
# Otra terminal
ngrok http 3000

# Configurar en Kapso:
# URL: https://abc123.ngrok.io/webhook
# Token: factura-mvp-token
```

## Probar

Desde WhatsApp → +56 9 2040 3095
Mensaje: "hola"

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 2️⃣ README - Guía Completa

## 🎯 Objetivo

Bot de WhatsApp que procesa fotos de facturas argentinas:
- Usuario envía foto
- OCR extrae datos (Gemini)
- Guarda en Google Sheets
- Responde en <5 seg

## 🛠️ Stack

- Node.js 20 + TypeScript
- Hono (framework web)
- Kapso (WhatsApp API)
- Gemini Flash 2.5 (OCR)
- Google Sheets (storage)

## 📁 Estructura

```
src/
├── index.ts     # ✅ Servidor + webhooks
├── kapso.ts     # ⚠️ Cliente WhatsApp
├── ocr.ts       # ❌ TODO: Gemini OCR
├── sheet.ts     # ❌ TODO: Google Sheets
└── quota.ts     # ✅ Sistema de cuotas
```

## 🚀 Tareas Prioritarias

### 1. Implementar OCR (src/ocr.ts)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface InvoiceData {
  proveedor: string;
  cuit: string;
  fecha: string;
  numeroFactura: string;
  total: number;
  iva: number;
}

export async function extractInvoiceData(
  imageBuffer: Buffer
): Promise<InvoiceData> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const base64Image = imageBuffer.toString('base64');

  const prompt = `
Analiza esta factura argentina y extrae en formato JSON:
{
  "proveedor": "nombre",
  "cuit": "XX-XXXXXXXX-X",
  "fecha": "DD/MM/YYYY",
  "numeroFactura": "A 0001-00012345",
  "total": numero,
  "iva": numero
}

SOLO JSON, sin markdown.
`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image
      }
    }
  ]);

  const text = result.response.text()
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
    
  return JSON.parse(text);
}
```

### 2. Implementar Google Sheets (src/sheet.ts)

```typescript
import { google } from 'googleapis';
import type { InvoiceData } from './ocr.js';

export async function saveToSheet(
  data: InvoiceData,
  userPhone: string
): Promise<void> {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    new Date().toISOString(),
    userPhone,
    data.proveedor,
    data.cuit,
    data.fecha,
    data.numeroFactura,
    data.total,
    data.iva
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Facturas!A:H',
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
}
```

### 3. Integrar en index.ts

```typescript
// En handleImageMessage(), reemplazar simulación por:

import { extractInvoiceData } from './ocr.js';
import { saveToSheet } from './sheet.js';

const imageBuffer = await downloadMedia(mediaId);
const invoiceData = await extractInvoiceData(imageBuffer);
await saveToSheet(invoiceData, from);
```

## ⏱️ Timeline

- Día 1 (4h): Implementar OCR
- Día 2 (4h): Implementar Sheets + integrar
- Día 3 (3h): Testing + manejo errores
- Día 4 (2h): Deploy

Total: 13 horas

## 💰 Costos

```
VPS Contabo 20:  $6.36/mes
Kapso Free:      $0/mes
Gemini API:      ~$0.33/mes
Total:           $6.70/mes
```

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 3️⃣ TODO - Tareas Pendientes

## 🔴 CRÍTICO

### 1. OCR (src/ocr.ts) - 3-4 horas
- [ ] Instalar @google/generative-ai
- [ ] Configurar cliente Gemini
- [ ] Crear prompt para facturas argentinas
- [ ] Parsear JSON response
- [ ] Manejo de errores

### 2. Sheets (src/sheet.ts) - 2-3 horas
- [ ] Instalar googleapis
- [ ] Configurar OAuth2
- [ ] Implementar saveToSheet()
- [ ] Formato de columnas
- [ ] Manejo de errores

### 3. Kapso (src/kapso.ts) - 30 min
- [ ] Descomentar downloadMedia()
- [ ] Descomentar markAsRead()
- [ ] Agregar returns

## 🟡 IMPORTANTE

### 4. Testing - 2 horas
- [ ] Test OCR con factura real
- [ ] Test Sheets append
- [ ] Test end-to-end
- [ ] Test casos edge

### 5. Deploy - 2 horas
- [ ] VPS Contabo setup
- [ ] PM2 configuración
- [ ] Nginx reverse proxy
- [ ] SSL con certbot

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 4️⃣ CLAUDE CODE - Trabajar con Claude

## Prompt Inicial

```
Hola! Proyecto de bot WhatsApp para facturas argentinas.

Stack: Node.js + TypeScript + Hono + Kapso + Gemini

Estado:
✅ Webhook funcionando
✅ Sistema de cuotas
❌ src/ocr.ts (vacío)
❌ src/sheet.ts (vacío)

Prioridades:
1. Implementar OCR con Gemini
2. Implementar Google Sheets
3. Activar métodos en kapso.ts

¿Por dónde empezamos?
```

## Prompts para Tareas Específicas

### Para OCR
```
Implementa src/ocr.ts completo:
- Gemini Flash 2.5
- Extraer: Proveedor, CUIT, Fecha, Nro, Total, IVA
- Prompt optimizado para facturas argentinas
- Manejo de errores
```

### Para Sheets
```
Implementa src/sheet.ts completo:
- OAuth2 con Google Sheets API
- saveToSheet(data, userPhone)
- Columnas: Timestamp, Usuario, Proveedor, CUIT, Fecha, Nro, Total, IVA
```

### Para Debugging
```
Error: [pegar error]

Contexto:
- Node 20
- TypeScript 5.7
- npm install ejecutado

¿Qué puede estar pasando?
```

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 5️⃣ COSTOS - Análisis Completo

## MVP (Primeros 3 meses)

```
VPS Contabo 20 (12GB):   $6.36/mes
Kapso Free:              $0/mes
Gemini API:              $0.33/mes (666 facturas)
Google Sheets:           $0/mes
──────────────────────────────────
TOTAL:                   $6.70/mes

Capacidad:
• 66 usuarios × 10 facturas
• 666 facturas/mes total
```

## Costo por Factura

```
Gemini OCR:    $0.0005
WhatsApp:      $0 (respuestas <24h)
Kapso Free:    $0
VPS:           $0.02 (prorrateado)
──────────────────────────
Total:         $0.021/factura
```

## Cuándo Escalar

### A Kapso Pro ($40/mes total)
- 50+ usuarios activos
- 500+ facturas/mes
- Se acaban los 2k mensajes

Nuevo costo: VPS $6.36 + Kapso $25 + Gemini $1.50 = $32.86/mes

## Plan de Precios Sugerido

```
FREE:      10 facturas/mes - $0
BÁSICO:    50 facturas/mes - $5/mes
PRO:      200 facturas/mes - $15/mes
```

## ROI Proyectado

```
Con 20 usuarios pagos ($5/mes):
Ingresos:  $100/mes
Costos:    $33/mes
Ganancia:  $67/mes
Margen:    67%
```

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 6️⃣ DOCS - Links y Referencias

## Documentación Oficial

### Kapso
- Docs: https://docs.kapso.ai
- Dashboard: https://app.kapso.ai
- SDK: https://www.npmjs.com/package/@kapso/whatsapp-cloud-api

### Gemini
- Docs: https://ai.google.dev/gemini-api/docs
- API Key: https://makersuite.google.com/app/apikey
- Pricing: https://ai.google.dev/gemini-api/docs/pricing

### Google Sheets
- Docs: https://developers.google.com/sheets/api
- OAuth Setup: https://developers.google.com/sheets/api/quickstart/nodejs
- Console: https://console.cloud.google.com

### Hono
- Docs: https://hono.dev
- Getting Started: https://hono.dev/getting-started/basic

## Herramientas

- ngrok: https://ngrok.com/download
- Contabo VPS: https://contabo.com/en/vps/
- PM2: https://pm2.keymetrics.io

## Paquetes NPM Necesarios

```bash
npm install @google/generative-ai
npm install googleapis
npm install @kapso/whatsapp-cloud-api
npm install @hono/node-server hono
npm install dotenv
```

═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════

# 🎯 RESUMEN EJECUTIVO

## Qué es
Bot WhatsApp que procesa facturas argentinas con OCR

## Stack
Node.js + TypeScript + Hono + Kapso + Gemini + Sheets

## Qué falta
1. Implementar OCR (3-4h)
2. Implementar Sheets (2-3h)
3. Activar métodos en kapso (30min)

## Costos
$6.70/mes para MVP (66 usuarios × 10 facturas)

## Timeline
13 horas de desarrollo = 3-4 días

## Próximos pasos
1. Implementar OCR
2. Implementar Sheets
3. Testing
4. Deploy a VPS

═══════════════════════════════════════════════════════════════════

FIN DEL DOCUMENTO
Guarda este archivo como DOCUMENTACION_COMPLETA.md


  npm run db:generate && npm run db:push && npm run dev
