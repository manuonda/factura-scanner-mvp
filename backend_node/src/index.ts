import 'dotenv/config';
import {serve} from '@hono/node-server'
import {Hono} from 'hono';
import {logger} from 'hono/logger';
import { time } from 'console';
import { sendWhatsAppMessage ,downloadMedia, markAsRead} from './kapso.js';
import { extractData } from './ocr.js';
import { UserRepository } from './repositories/user.repository.js';
import { UserService } from './services/user.service.js';
import { DocumentService } from './services/document.service.js';
import { DocumentRepository } from './repositories/document.repository.js';
import {
    verifyKapsoSignature,
    isWebhookProcessed,
    markWebhookAsProcessed,
    logWebhookEvent
} from './utils/kapso-webhook.js';
import {
    isImageMessage,
    isDocumentMessage,
    extractMediaUrl,
    type KapsoMediaMessage,
    type KapsoMessage,
} from './types/kapso.js';
import { DocumentProcessingStatus, type ProcessDocumentResult } from './dtos/documento.dto.js';
import type { User } from './domain/user.js';


const userRepository = new UserRepository();
const userService = new UserService(userRepository);
const documentRepository = new DocumentRepository();
const documentService = new DocumentService(documentRepository);


const app = new Hono();

//Middleware de logging
app.use('*', logger());

// puerto
const port = process.env.PORT || 3000;

//Rutas
app.get('/', (c) => {
    return c.json({
        status: 'ok',
        service: 'factura-scanner',
        timestamp: new Date().toISOString(),
    });
});



// ============================================
// RUTA 3: Webhook mensajes (POST)
// Acá llegan los mensajes de WhatsApp
// Soporta formato Kapso v2
// Incluye validación de firma y deduplicación
// ============================================
app.post('/webhook', async (c) => {
  try {
    // 1. Obtener headers de seguridad
    const signature = c.req.header('X-Webhook-Signature');
    const idempotencyKey = c.req.header('X-Idempotency-Key');
    const kapsoSecret = process.env.KAPSO_WEBHOOK_SECRET;

    // 2. Validar headers requeridos
    if (!signature || !idempotencyKey) {
      console.warn('⚠️ Headers de seguridad faltantes');
      return c.json({ error: 'Missing security headers' }, 400);
    }

    // 3. Verificar deduplicación (evitar procesar el mismo webhook 3 veces)
    if (isWebhookProcessed(idempotencyKey)) {
      console.log(`⏭️ Webhook duplicado ignorado: ${idempotencyKey}`);
      return c.json({ status: 'duplicate_ignored' }, 200);
    }

    // 4. Leer body como string para verificar firma
    const bodyText = await c.req.text();

    // 5. Verificar firma HMAC-SHA256
    if (kapsoSecret && !verifyKapsoSignature(bodyText, signature, kapsoSecret)) {
      console.error('❌ Firma de webhook inválida');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // 6. Parsear JSON después de verificar firma
    const body = JSON.parse(bodyText);

    // 7. Marcar como procesado
    markWebhookAsProcessed(idempotencyKey);
    logWebhookEvent('message_received', idempotencyKey, 'received');

    // 8. Extraer el mensaje correctamente (soporte para batch/data array)
    // Si viene en batch (data array), tomamos el primero. Si no, usamos el body directo.
    const item = body.data?.[0] || body;
    const message = item.message;
    const conversation = item.conversation;

    // ===== SOLO PROCESAR MENSAJES INBOUND (del usuario) =====
    // Ignorar OUTBOUND (mensajes que envía el bot)
    if (message && message.kapso?.direction === 'inbound') {
      console.log(`   ✅ Mensaje INBOUND de usuario`);
      console.log(`   Teléfono: ${conversation?.phone_number}`);
      console.log(`   Tipo: ${message.type}`);

      // Procesar en background para responder rápido (< 10 segundos)
      processMessage(message, conversation).catch(error => {
        logWebhookEvent('message_process', idempotencyKey, 'error', { error: String(error) });
      });

      // Responder inmediatamente al webhook (< 10s)
      logWebhookEvent('message_process', idempotencyKey, 'processed');
      return c.json({ status: 'processed' }, 200);
    }

    // ===== IGNORAR MENSAJES OUTBOUND (del bot) =====
    if (message && message.kapso?.direction === 'outbound') {
      console.log(`   ⏭️ Mensaje OUTBOUND ignorado (es del bot)`);
      logWebhookEvent('message_outbound', idempotencyKey, 'processed');
      return c.json({ status: 'outbound_ignored' }, 200);
    }

    console.log('   Sin mensaje para procesar');
    return c.json({ status: 'no_messages' }, 200);

  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

// ============================================
// PROCESAR MENSAJE
// Soporta formato Kapso v2
// ============================================


async function processMessage(message: KapsoMessage, conversation?: any) {
  // Obtener número desde conversation (más confiable) o desde message.from
  const from = conversation?.phone_number || message.from;
  const messageId = message.id;

  console.log('==== Procesar Messages =====')
  console.log(`\n Mensaje recibido:`);
  console.log(`   De: ${from}`);
  console.log(`   Tipo: ${message.type}`);
  console.log(`   ID: ${messageId}`);

  // Procesar usuario y obtener estado del flujo
  const processingResult = await userService.procesarUsuario(from);
  const userId = processingResult.user.id;
  console.log(`   Estado: ${processingResult.state}`);

  // Si el usuario no está listo (NEW o INCOMPLETE), procesar registro
  if (processingResult.state !== 'READY') {
    console.log(`   → Flujo de registro activo, paso: ${processingResult.nextStep}`);
    // Solo procesar textos durante el registro
    if (message.type === 'text') {
      const textContent = message.text?.body || '';
      if (textContent.trim()) {
        const registrationResult = await userService.processRegistrationData(from, textContent);
        await sendWhatsAppMessage(from, registrationResult.message);
        return;
      }
    }
    // Si no es texto o está vacío, enviar el mensaje del paso actual
    await sendWhatsAppMessage(from, processingResult.message);
    return;
  }

  console.log(`Tipo de message es: ${message.type}`);
  // Procesar según el tipo de mensaje (solo si usuario está READY)
  switch (message.type) {
    case 'text':
      console.log(`Texto: "${message.text?.body || ''}"`);
      await handleTextMessage(from, message.text?.body || '', processingResult.user);
      break;

    case 'image':
      console.log(`Procesando imagen...`);
      console.log('Mensaje de imagen:', message);
      await handleMediaMessage(userId, from, message);
      break;

    case 'document':
      console.log(`Procesando documento...`);
      await handleMediaMessage(userId, from, message);
      break;

    default:
      await sendWhatsAppMessage(
        from,
        '⚠️ No entiendo ese tipo de mensaje. Enviame una *foto* de tu factura.'
      );
  }
}

// ============================================
// HANDLERS POR TIPO DE MENSAJE
// ============================================

/**
 * Maneja mensajes de texto
 * Solo se ejecuta si el usuario está READY (registro completo)
 */
async function handleTextMessage(from: string, text: string, user: User) {
  console.log(`De: ${from}`);
  console.log(`Texto: "${text}"`);

  // Comandos de ayuda
  const lowerText = text.toLowerCase().trim();

  if (lowerText === 'ayuda' || lowerText === 'help') {
    await sendWhatsAppMessage(
      from,
      '📋 *Comandos disponibles:*\n\n' +
      '• Enviar foto → Proceso la factura\n' +
      '• Enviar PDF → Proceso la factura\n' +
      '• "ayuda" → Este mensaje'
    );
    return;
  }

  // Si es cualquier otro texto, recordar enviar factura
  await sendWhatsAppMessage(
    from,
    `Hola ${user.name}, 📄 Enviame una *foto* o *PDF* de tu factura y la proceso automáticamente.`
  );
}

/**
 * Maneja mensajes de media (imagen o documento PDF)
 *
 * 📤 NUEVO FLUJO OPTIMIZADO 📤
 * 1. Validación rápida (< 100ms)
 * 2. Procesar OCR con Gemini (5-10s) - SINCRÓNICO
 * 3. Responder al usuario CON RESULTADO inmediatamente
 * 4. Guardar en background (BD + archivo) SIN BLOQUEAR respuesta
 */
async function handleMediaMessage(
  userId: string,
  phoneNumber: string,
  message: KapsoMediaMessage
) {
  try {
    
    console.log(`📤 Iniciando procesamiento de ${message.id} para ${phoneNumber}`);

     const result: ProcessDocumentResult = await documentService.processDocument({
      userId,
      phoneNumber,
      message
    });

    // 2. Verificar validación rápida (solo errores de validación rápida)
    if (!result.success) {
      // Errores de validación rápida (sin media, URL inválida, etc.)
      console.warn(`⚠️ Validación rápida fallida: ${result.message}`);
      await sendWhatsAppMessage(
        phoneNumber,
        `⚠️ ${result.error}`
      );
      return;
    }


    const mediaUrl = extractMediaUrl(message);
 

    // ============================================
    // 2. NOTIFICAR QUE ESTÁ PROCESANDO
    // ============================================
    console.log(`✅ Documento validado, procesando con Gemini...`);
    await sendWhatsAppMessage(
      phoneNumber,
      '⏳ Procesando tu factura...'
    );

    // ============================================
    // 3. PROCESAR OCR CON GEMINI (5-10 segundos)
    // ============================================
    console.log('📤 Enviando a Gemini para OCR...');
    const resultadoExtractData = await extractData(mediaUrl!);

    console.log('📥 Resultado de OCR recibido de Gemini:', resultadoExtractData);
    // ============================================
    // 4. RESPONDER AL USUARIO CON RESULTADO
    // ============================================
    if (resultadoExtractData.isInvoice && resultadoExtractData.data) {
      // ✅ ÉXITO: Factura procesada correctamente
      const responseMessage =
        `✅ *¡Factura procesada!*\n\n` +
        `📋 *Proveedor:* ${resultadoExtractData.data.proveedor || 'Desconocido'}\n` +
        `🔢 *CUIT:* ${resultadoExtractData.data.cuit || 'Desconocido'}\n` +
        `📄 *Nro Factura:* ${resultadoExtractData.data.numeroFactura || 'Desconocido'}\n` +
        `📅 *Fecha:* ${resultadoExtractData.data.fecha || 'Desconocido'}\n` +
        `💰 *Total:* $${resultadoExtractData.data.total?.toLocaleString('es-AR') || '0'}\n` +
        `📊 *IVA:* $${resultadoExtractData.data.iva?.toLocaleString('es-AR') || '0'}\n\n` +
        `_Documento: ${resultadoExtractData.documentType} ✓_\n` +
        `_Datos guardados en tu planilla_ ✨`;

      // Logging detallado para debugging
      console.log(`✅ Resultado procesado:`, {
        documentType: resultadoExtractData.documentType,
        fileInfo: resultadoExtractData.fileInfo,
        tokens: resultadoExtractData.usage,
        invoiceData: resultadoExtractData.data
      });

      await sendWhatsAppMessage(phoneNumber, responseMessage);
    } else {
      // ⚠️ ERROR: No es factura válida
      const errorMessage = `⚠️ ${invoiceData.reason || 'No es una factura válida'}\n\nPor favor, envía una factura argentina.`;

      // Logging del error
      console.log(`⚠️ Validación fallida:`, {
        documentType: invoiceData.documentType,
        fileInfo: invoiceData.fileInfo,
        reason: invoiceData.reason
      });

      await sendWhatsAppMessage(phoneNumber, errorMessage);
    }

  

  } catch (error) {
    console.error('❌ Error en handleMediaMessage:', error);
    await sendWhatsAppMessage(
      phoneNumber,
      '❌ Error procesando la factura.\n\nPor favor, intenta de nuevo.'
    );
  }
}



console.log('');
console.log('🚀 ================================');
console.log('   FACTURA WHATSAPP - MVP');
console.log('   ================================');
console.log(`   Puerto: ${port}`);
console.log(`   Health: http://localhost:${port}/`);
console.log(`   Webhook: http://localhost:${port}/webhook`);
console.log('   ================================');
console.log('');


serve({
    fetch: app.fetch,
    port: Number(port), 
})

console.log(`Server running on port ${port}`);