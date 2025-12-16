import 'dotenv/config';
import {serve} from '@hono/node-server'
import {Hono} from 'hono';
import {logger} from 'hono/logger';
import { time } from 'console';
import { sendWhatsAppMessage ,downloadMedia, markAsRead} from './kapso.js';
import { extractData } from './ocr.js';
import { UserRepository } from './repositories/user.repository.js';
import { UserService } from './services/user.service.js';


const userRepository = new UserRepository();
const userService = new UserService(userRepository);


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

app.get('/send-test-message', async (c) => {
    const testPhoneNumber = process.env.TEST_PHONE_NUMBER;
    if (!testPhoneNumber) {
        return c.json({ error: 'Falta TEST_PHONE_NUMBER en las variables de entorno' }, 500);
    }

    try {
        await sendWhatsAppMessage(testPhoneNumber, 'Mensaje de prueba desde factura-scanner 🚀');
        return c.json({ status: 'Mensaje de prueba enviado correctamente' });
    } catch (error) {
        return c.json({ error: 'Error enviando el mensaje de prueba' }, 500);
    }
});

// ============================================
// RUTA 3: Webhook mensajes (POST)
// Acá llegan los mensajes de WhatsApp
// Soporta formato Kapso v2
// ============================================
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();

      
    // Extraer el mensaje correctamente (soporte para batch/data array)
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

      await processMessage(message, conversation);

      return c.json({ status: 'processed' });
    }

    // ===== IGNORAR MENSAJES OUTBOUND (del bot) =====
    if (message && message.kapso?.direction === 'outbound') {
      console.log(`   ⏭️ Mensaje OUTBOUND ignorado (es del bot)`);
      return c.json({ status: 'outbound_ignored' });
    }

    console.log('   Sin mensaje para procesar');
    return c.json({ status: 'no_messages' });

  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    return c.json({ status: 'error' }, 500);
  }
});

// ============================================
// PROCESAR MENSAJE
// Soporta formato Kapso v2
// ============================================
interface WhatsAppMessage {
  id: string;
  from: string;
  type: string;
  timestamp?: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; link?: string };
  document?: { id: string; mime_type?: string; filename?: string; link?: string };
  kapso?: {
    direction: string;
    has_media: boolean;
    media_url?: string;
    media_data?: { url?: string };
  };
}

async function processMessage(message: WhatsAppMessage, conversation?: any) {
  // Obtener número desde conversation (más confiable) o desde message.from
  const from = conversation?.phone_number || message.from;
  const messageId = message.id;
  
  console.log('==== Procesar Messages =====')
  console.log(`\n📱 Mensaje recibido:`);
  console.log(`   De: ${from}`);
  console.log(`   Tipo: ${message.type}`);
  console.log(`   ID: ${messageId}`);

  const {isNew, user} = await userService.getOrCreateUser(from);
  if (isNew) {
    console.log(`   Nuevo usuario creado con phoneNumber: ${from}`);
  } else {
    console.log(`   Usuario existente encontrado con phoneNumber: ${from}`);
  }

  console.log(`Tipo de message es: ${message.type}`);
  // Procesar según el tipo de mensaje
  switch (message.type) {
    case 'text':
      console.log(`Texto: "${message.text?.body || ''}"`);
      await handleTextMessage(from, message.text?.body || '');
      break;

    case 'image':
      console.log(`Procesando imagen...`);
      const imageUrl = message.kapso?.media_url || message.image?.link;
      await handleImageMessage(from, imageUrl || message.image!.id);
      break;

    case 'document':
      if (message.document?.mime_type === 'application/pdf') {
        await handleImageMessage(from, message.document.id);
      } else {
        await sendWhatsAppMessage(
          from,
          '⚠️ Solo puedo procesar *imágenes* o *PDFs* de facturas.'
        );
      }
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
 */
async function handleTextMessage(from: string, text: string) {
  console.log(`De: ${from}`);
  console.log(`Texto: "${text}"`);

  // Comandos simples
  const lowerText = text.toLowerCase().trim();
  

  if (lowerText === 'hola' || lowerText === 'hi' || lowerText === 'hello') {
    await sendWhatsAppMessage(
      from,
      '👋 ¡Hola! Soy el bot de facturas.\n\n' +
      'Enviame una *foto* o *PDF* de tu factura y la proceso automáticamente.\n\n' +
      'Los datos se guardan en tu Google Sheets.'
    );
    return;
  }

  if (lowerText === 'ayuda' || lowerText === 'help') {
    await sendWhatsAppMessage(
      from,
      '📋 *Comandos disponibles:*\n\n' +
      '• Enviar foto → Proceso la factura\n' +
      '• Enviar PDF → Proceso la factura\n' +
      '• "hola" → Mensaje de bienvenida\n' +
      '• "ayuda" → Este mensaje'
    );
    return;
  }

  // Mensaje por defecto
  await sendWhatsAppMessage(
    from,
    '📄 Enviame una *foto* o *PDF* de tu factura y la proceso automáticamente.'
  );
}

/**
 * Maneja mensajes con imagen (o PDF)
 * @param urlOrMediaId - URL pública de Kapso o mediaId como fallback
 */
async function handleImageMessage(from: string, urlOrMediaId: string) {
  const isUrl = urlOrMediaId.startsWith('http');
  console.log(`${isUrl ? '🔗 URL' : '📱 MediaId'}: ${isUrl ? urlOrMediaId.substring(0, 60) + '...' : urlOrMediaId}`);

  try {
    // 1. Notificar que estamos procesando
    await sendWhatsAppMessage(from, '⏳ Procesando tu factura...');

    // 2. Procesar con OCR
    console.log('📤 Enviando a Gemini para OCR...');
    const invoiceData = await extractData(urlOrMediaId);

    // 3. TODO: Procesar con OCR (Gemini)
    // Por ahora simulamos el resultado
   
    // 4. TODO: Guardar en Google Sheets
    console.log('📊 Datos extraídos:', invoiceData);

    // 5. Responder con los datos
    const responseMessage = 
      `✅ *¡Factura procesada!*\n\n` +
      `📋 *Proveedor:* ${invoiceData.data?.proveedor || 'Desconocido'}\n` +
      `🔢 *CUIT:* ${invoiceData.data?.cuit || 'Desconocido'}\n` +
      `📄 *Nro Factura:* ${invoiceData.data?.numeroFactura || 'Desconocido'}\n` +
      `📅 *Fecha:* ${invoiceData.data?.fecha || 'Desconocido'}\n` +
      `💰 *Total:* $${invoiceData.data?.total?.toLocaleString('es-AR') || '0'}\n` +
      `📊 *IVA:* $${invoiceData.data?.iva?.toLocaleString('es-AR') || '0'}\n\n` +
      `_Datos guardados en tu planilla_ ✨`;

    await sendWhatsAppMessage(from, responseMessage);

  } catch (error) {
    console.error('❌ Error procesando imagen:', error);
    await sendWhatsAppMessage(
      from,
      '❌ Ocurrió un error procesando la factura.\n\n' +
      'Por favor, asegurate de que:\n' +
      '• La imagen esté bien iluminada\n' +
      '• El texto sea legible\n' +
      '• Sea una factura válida'
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