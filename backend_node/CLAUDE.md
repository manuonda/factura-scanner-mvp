# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Factura Scanner MVP** - WhatsApp bot that processes Argentine invoices via OCR and stores data in Google Sheets.

**Stack:**
- Node.js 18+ with TypeScript
- Hono (lightweight web framework)
- Kapso WhatsApp Cloud API
- Google Gemini Flash 2.5 (OCR)
- Google Sheets API (data storage)

**Key Services:**
- WhatsApp webhook receiver for invoice images
- OCR extraction using Google Gemini AI
- Google Sheets integration for data persistence

## Build & Development Commands

```bash
# Development (with hot reload)
npm run dev

# Build TypeScript to JavaScript
npm build

# Build with watch mode
npm run build:watch

# Type checking without emitting
npm run typecheck

# Clean build artifacts
npm run clean

# Start production build
npm start

# Test health endpoint
npm run test:health

# Test webhook verification
npm run test:webhook
```

## Architecture & Key Files

### Core Entry Point: `src/index.ts`
Main Hono server that handles:
- **GET /** - Health check endpoint
- **GET /webhook** - WhatsApp webhook verification (challenge-response)
- **POST /webhook** - Receives messages from WhatsApp (Kapso v2 format)
- **GET /send-test-message** - Testing endpoint to send WhatsApp message

The server supports two message formats:
1. **Kapso v2** (primary): `body.type === 'whatsapp.message.received'` with `body.data` array
2. **Meta original** (fallback): Meta's standard webhook format

Message processing pipeline:
1. Receive webhook POST
2. Parse message type (text, image, document)
3. Route to appropriate handler
4. Send WhatsApp response

### WhatsApp Integration: `src/kapso.ts`
Wrapper around `@kapso/whatsapp-cloud-api` SDK providing:
- `sendWhatsAppMessage()` - Send text messages (supports WhatsApp markup: *bold*, _italic_, ~strikethrough~)
- `downloadMedia()` - Download images/documents from WhatsApp (currently stubbed out)
- `getMediaInfo()` - Get metadata about media (URL, MIME type, size)
- `sendImage()` - Send images via WhatsApp
- `markAsRead()` - Mark messages as read

**Important:** Several methods are commented out in this file (lines 103, 128-132, 160-165, 185-188). These need to be uncommented to activate media handling and read receipts. See CODIGOS.md for specific activation instructions.

### OCR Extraction: `src/ocr.ts`
**Status:** Empty file - needs implementation

Should implement:
- Use Google Gemini Flash 2.5 for invoice OCR
- Extract: proveedor (provider), cuit, fecha, numeroFactura, total, iva
- Input: image Buffer from downloaded WhatsApp media
- Output: `InvoiceData` interface with extracted fields

### Google Sheets Storage: `src/sheet.ts`
**Status:** Empty file - needs implementation

Should implement:
- OAuth2 authentication with Google Sheets API
- Append invoice data to spreadsheet
- Columns: timestamp, phone, proveedor, cuit, fecha, numeroFactura, total, iva

### Message Handlers in `src/index.ts`
- `handleTextMessage()` - Process text commands (hola, ayuda, help)
- `handleImageMessage()` - Download media, extract OCR, save to Sheets

## Environment Variables

Required (in `.env`):
- `PORT` - Server port (default: 3000)
- `KAPSO_API_KEY` - Kapso WhatsApp API key
- `KAPSO_PHONE_NUMBER_ID` - WhatsApp business phone number ID
- `WEBHOOK_VERIFY_TOKEN` - Token for webhook verification
- `GEMINI_API_KEY` - Google Gemini API key
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` - Google OAuth2 credentials
- `GOOGLE_SPREADSHEET_ID` - Target Google Sheet ID
- `TEST_PHONE_NUMBER` - Phone number for testing (optional)

## TypeScript Configuration

Note: There is no `tsconfig.json` in the repository. You may need to create one if adding stricter type checking. The project uses ES2022 target with ESNext modules.

## Project Status

**Implemented:**
- ✅ Hono server with webhook endpoints
- ✅ WhatsApp message routing (Kapso v2 format)
- ✅ Text command handlers (hola, ayuda)
- ✅ WhatsApp client initialization (Kapso SDK)
- ✅ Message sending via WhatsApp

**Not Yet Implemented:**
- ❌ Media download (commented out in kapso.ts)
- ❌ Google Gemini OCR (ocr.ts is empty)
- ❌ Google Sheets integration (sheet.ts is empty)
- ❌ Read receipts (commented out in kapso.ts)

See `CODIGOS.md` for copy-paste implementation guides for these features.

## Testing

Use these npm scripts to test:
```bash
npm run test:health    # Verify server is running
npm run test:webhook   # Simulate webhook verification
```

For full testing, configure ngrok to expose your local server:
```bash
ngrok http 3000
# Then configure the ngrok URL in Kapso dashboard: https://xxxx.ngrok.io/webhook
```

## Common Development Tasks

- **Add new text command:** Edit `handleTextMessage()` to add new command cases
- **Modify response messages:** All WhatsApp responses are sent via `sendWhatsAppMessage()` calls
- **Change invoice data extraction logic:** Will be in `src/ocr.ts` once implemented
- **Add logging:** Use `console.log()` with emoji prefixes (✅, ❌, 📨, etc.) - already established pattern
