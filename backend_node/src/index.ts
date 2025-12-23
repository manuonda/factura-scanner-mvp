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
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';


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
// RUTA: OAuth2 Callback (GET)
// Google redirecciona aquí después de autorizar
// ============================================
app.get('/oauth2callback', async (c) => {
    try {
        const code = c.req.query('code');
        const error = c.req.query('error');

        if (error) {
            console.error(`❌ Error de autorización: ${error}`);
            return c.html(`
                <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>❌ Autorización rechazada</h1>
                        <p>Error: ${error}</p>
                    </body>
                </html>
            `, 400);
        }

        if (!code) {
            return c.html(`
                <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>❌ Código de autorización no encontrado</h1>
                    </body>
                </html>
            `, 400);
        }

        console.log('🔐 Código de autorización recibido, intercambiando por tokens...');

        // Crear cliente OAuth2
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_OAUTH_ID!,
            process.env.GOOGLE_OAUTH_SECRET!,
            'http://localhost:3000/oauth2callback'
        );

        // Intercambiar código por tokens
        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {
            console.error('❌ No se obtuvo refresh token');
            return c.html(`
                <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>❌ Error al obtener refresh token</h1>
                    </body>
                </html>
            `, 400);
        }

        console.log('✅ Refresh token obtenido');
        console.log(`🔑 Token: ${refreshToken.substring(0, 20)}...`);

        // Guardar en .env
        const envPath = path.join(process.cwd(), '.env');
        let envContent = fs.readFileSync(envPath, 'utf-8');

        const refreshTokenLine = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
        const refreshTokenRegex = /^GOOGLE_REFRESH_TOKEN=.*$/m;

        if (refreshTokenRegex.test(envContent)) {
            envContent = envContent.replace(refreshTokenRegex, refreshTokenLine);
        } else {
            envContent += `\n${refreshTokenLine}`;
        }

        fs.writeFileSync(envPath, envContent);

        console.log('✅ Refresh token guardado en .env');
        console.log('\n🎉 ¡Setup OAuth2 completado!\n');

        return c.html(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>✅ ¡Autorización completada!</h1>
                    <p>El refresh token se ha guardado en <strong>.env</strong></p>
                    <p>Ahora puedes usar OAuth2 en tu bot.</p>
                </body>
            </html>
        `);

    } catch (error) {
        console.error('❌ Error en OAuth2 callback:', error);
        return c.html(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Error en la autorización</h1>
                    <p>${String(error)}</p>
                </body>
            </html>
        `, 500);
    }
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

        if(registrationResult.nextStep === 'complete') {
          try {
            console.log(`🎉 Registro completado para ${from}, creando Google Sheet...`);
            const sheetResult = await userService.onRegistrationComplete(from);
            await sendWhatsAppMessage(from, sheetResult.message);
          }catch(error) {
            console.error('❌ Error creando google sheet:', error);
            await sendWhatsAppMessage(
              from ,
              "⚠️ Tu registro se completó, pero hubo un error al crear tu planilla. Por favor contacta al soporte."
            )
          }
        }
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
      console.log(`Procesando documento...: `, message);
      console.log("===================");
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


async function handleMediaMessage(
  userId: string,
  phoneNumber: string,
  message: KapsoMediaMessage
) {
  try {
    
    console.log(`📤 Iniciando procesamiento de ${message.id} para ${phoneNumber}`);

     const resultValidation = await documentService.validateDocumento(message);
     if (!resultValidation.success) {
       await sendWhatsAppMessage(
         phoneNumber,
         `⚠️ ${resultValidation.message}`
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
      const errorMessage = `⚠️ ${resultadoExtractData.reason || 'No es una factura válida'}\n\nPor favor, envía una factura argentina.`;

      // Logging del error
      console.log(`⚠️ Validación fallida:`, {
        documentType: resultadoExtractData.documentType,
        fileInfo: resultadoExtractData.fileInfo,
        reason: resultadoExtractData.reason
      });

      await sendWhatsAppMessage(phoneNumber, errorMessage);
    }

    // TODO : 1 Aqui realizaria el guardado del documento de kapso y tambien
    //  const result: ProcessDocumentResult = await documentService.processDocument({
    //   userId,
    //   phoneNumber,
    //   message
    // });
  
    // TODO: 2 
    // procesaria la informacion de guardar la informacion del comprobante tambien se tendria que guardar 
    // esta informacion en 2do plano 

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