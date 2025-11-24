#!/bin/bash

# Script para crear estructura completa del proyecto Factura WhatsApp
# Uso: bash setup.sh

set -e

echo "🚀 Creando proyecto factura-whatsapp..."

# Crear estructura de carpetas
mkdir -p factura-whatsapp/src/utils

cd factura-whatsapp

# ============================================
# package.json
# ============================================
cat > package.json << 'EOF'
{
  "name": "factura-whatsapp",
  "version": "1.0.0",
  "description": "WhatsApp bot para procesar facturas automáticamente con OCR",
  "type": "module",
  "main": "dist/index.js",
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
EOF

# ============================================
# tsconfig.json
# ============================================
cat > tsconfig.json << 'EOF'
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
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# ============================================
# .env.example
# ============================================
cat > .env.example << 'EOF'
# Puerto
PORT=3000

# Kapso WhatsApp
KAPSO_API_KEY=tu_api_key
KAPSO_PHONE_NUMBER_ID=597907523413541
WEBHOOK_VERIFY_TOKEN=factura-mvp-token

# Google Gemini
GEMINI_API_KEY=tu_gemini_api_key

# Google Sheets
GOOGLE_CLIENT_ID=tu_client_id
GOOGLE_CLIENT_SECRET=tu_client_secret
GOOGLE_REFRESH_TOKEN=tu_refresh_token
GOOGLE_SPREADSHEET_ID=tu_spreadsheet_id

# Testing
TEST_PHONE_NUMBER=543885733589
EOF

# ============================================
# .gitignore
# ============================================
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.log
.DS_Store
EOF

# ============================================
# src/ocr.ts (vacío - TODO)
# ============================================
cat > src/ocr.ts << 'EOF'
// TODO: Implementar OCR con Google Gemini
// Ver README.md para ejemplo de implementación

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
  // TODO: Implementar
  throw new Error('Not implemented');
}
EOF

# ============================================
# src/sheet.ts (vacío - TODO)
# ============================================
cat > src/sheet.ts << 'EOF'
// TODO: Implementar Google Sheets
// Ver README.md para ejemplo de implementación

import type { InvoiceData } from './ocr.js';

export async function saveToSheet(
  data: InvoiceData,
  userPhone: string
): Promise<void> {
  // TODO: Implementar
  throw new Error('Not implemented');
}
EOF

echo "✅ Proyecto creado en $(pwd)"
echo ""
echo "📝 Próximos pasos:"
echo "1. cd factura-whatsapp"
echo "2. npm install"
echo "3. cp .env.example .env"
echo "4. Editar .env con tus API keys"
echo "5. npm run dev"
echo ""
echo "📚 Lee los archivos .md para más información"
EOF

chmod +x setup.sh

echo "✅ Script creado: setup.sh"
echo ""
echo "Para usarlo:"
echo "1. bash setup.sh"
echo "2. Después copia los archivos .md manualmente"
