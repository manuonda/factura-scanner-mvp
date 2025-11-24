# 📝 CÓDIGOS LISTOS PARA COPIAR

Copia y pega estos códigos en sus respectivos archivos.

═══════════════════════════════════════════════════════════════════

## 📦 package.json

```json
{
  "name": "factura-whatsapp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "@hono/node-server": "^1.13.7",
    "@kapso/whatsapp-cloud-api": "^1.0.0",
    "dotenv": "^16.4.7",
    "googleapis": "^144.0.0",
    "hono": "^4.6.14"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

═══════════════════════════════════════════════════════════════════

## ⚙️ tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

═══════════════════════════════════════════════════════════════════

## 🔑 .env

```env
PORT=3000

# Kapso WhatsApp
KAPSO_API_KEY=tu_api_key_de_kapso
KAPSO_PHONE_NUMBER_ID=597907523413541
WEBHOOK_VERIFY_TOKEN=factura-mvp-token

# Google Gemini
GEMINI_API_KEY=tu_gemini_api_key

# Google Sheets
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret
GOOGLE_REFRESH_TOKEN=tu_refresh_token
GOOGLE_SPREADSHEET_ID=tu_spreadsheet_id

# Testing
TEST_PHONE_NUMBER=543885733589
```

═══════════════════════════════════════════════════════════════════

## 📸 src/ocr.ts

```typescript
/**
 * OCR con Google Gemini Flash 2.5
 * Extrae datos de facturas argentinas
 */

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
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash" 
  });

  // Convertir imagen a base64
  const base64Image = imageBuffer.toString('base64');

  const prompt = `
Analiza esta factura argentina y extrae los siguientes datos en formato JSON:

{
  "proveedor": "nombre del proveedor o razón social",
  "cuit": "CUIT en formato XX-XXXXXXXX-X",
  "fecha": "fecha en formato DD/MM/YYYY",
  "numeroFactura": "tipo y número completo (ej: A 0001-00012345)",
  "total": número sin formato ni símbolos,
  "iva": número sin formato ni símbolos
}

Si no encuentras algún dato, usa null.

IMPORTANTE: 
- Responde SOLO con el JSON válido
- Sin markdown
- Sin explicaciones
- Sin backticks
`;

  try {
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

    const data = JSON.parse(text);
    
    // Validar datos básicos
    if (!data.proveedor || !data.total) {
      throw new Error('Datos de factura incompletos');
    }

    return data;

  } catch (error) {
    console.error('❌ Error en OCR:', error);
    throw new Error('No se pudo procesar la imagen de la factura');
  }
}
```

═══════════════════════════════════════════════════════════════════

## 📊 src/sheet.ts

```typescript
/**
 * Google Sheets API
 * Guarda datos de facturas
 */

import { google } from 'googleapis';
import type { InvoiceData } from './ocr.js';

export async function saveToSheet(
  data: InvoiceData,
  userPhone: string
): Promise<void> {
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!spreadsheetId) {
      throw new Error('Falta GOOGLE_SPREADSHEET_ID');
    }

    // Crear fila con datos
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

    // Append a la planilla
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Facturas!A:H',
      valueInputOption: 'RAW',
      requestBody: {
        values: [row]
      }
    });

    console.log('✅ Datos guardados en Sheet');

  } catch (error) {
    console.error('❌ Error guardando en Sheet:', error);
    throw new Error('No se pudo guardar la factura');
  }
}
```

═══════════════════════════════════════════════════════════════════

## 🔧 src/kapso.ts - Activar métodos

Buscar y descomentar estas líneas:

**Línea ~102 - downloadMedia():**
```typescript
// Cambiar de:
// return Buffer.from(arrayBuffer);

// A:
return Buffer.from(arrayBuffer);
```

**Línea ~127 - getMediaInfo():**
```typescript
// Cambiar de:
// return {
//   url: info.url,
//   mimeType: info.mime_type,
//   fileSize: info.file_size,
// };

// A:
return {
  url: info.url,
  mimeType: info.mime_type,
  fileSize: info.file_size,
};
```

**Línea ~163 - sendImage():**
```typescript
// Cambiar de:
// await whatsapp.messages.sendImage({...});

// A:
await whatsapp.messages.sendImage({
  phoneNumberId,
  to,
  url: imageUrl,
  caption,
});
```

**Línea ~188 - markAsRead():**
```typescript
// Cambiar de:
// await whatsapp.messages.markAsRead({...});

// A:
await whatsapp.messages.markAsRead({
  phoneNumberId,
  messageId,
});
```

═══════════════════════════════════════════════════════════════════

## 🔗 src/index.ts - Integrar OCR y Sheets

En la función `handleImageMessage()` (línea ~230), reemplazar:

```typescript
// ANTES (simulado):
const invoiceData = {
  proveedor: 'Empresa Demo S.A.',
  cuit: '30-12345678-9',
  fecha: '15/11/2025',
  numeroFactura: 'A 0001-00012345',
  total: 15000.50,
  iva: 3150.11,
};

// DESPUÉS (real):
import { extractInvoiceData } from './ocr.js';
import { saveToSheet } from './sheet.js';

// En handleImageMessage():
const imageBuffer = await downloadMedia(mediaId);
const invoiceData = await extractInvoiceData(imageBuffer);
await saveToSheet(invoiceData, from);
```

═══════════════════════════════════════════════════════════════════

## 📜 .gitignore

```
node_modules/
dist/
.env
*.log
.DS_Store
```

═══════════════════════════════════════════════════════════════════

## 🚀 Comandos de Setup

```bash
# 1. Crear proyecto
mkdir factura-whatsapp
cd factura-whatsapp

# 2. Crear estructura
mkdir -p src/utils

# 3. Copiar todos los códigos de arriba en sus archivos

# 4. Instalar dependencias
npm install

# 5. Configurar .env
cp .env.example .env
# Editar .env con tus API keys

# 6. Correr
npm run dev

# 7. En otra terminal: exponer
ngrok http 3000
```

═══════════════════════════════════════════════════════════════════

## ✅ Checklist

```
[ ] Copiar package.json
[ ] Copiar tsconfig.json
[ ] Copiar .env
[ ] Copiar .gitignore
[ ] Copiar src/ocr.ts
[ ] Copiar src/sheet.ts
[ ] Activar métodos en src/kapso.ts
[ ] Integrar en src/index.ts
[ ] npm install
[ ] npm run dev
[ ] Configurar webhook en Kapso
[ ] Probar con foto de factura
```

═══════════════════════════════════════════════════════════════════

FIN - Guarda como CODIGOS.md
