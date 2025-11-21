import 'dotenv/config';
import {serve} from '@hono/node-server'
import {Hono} from 'hono';
import {logger} from 'hono/logger';
import { time } from 'console';
import { sendWhatsAppMessage ,downloadMedia, markAsRead} from './kapso.js';

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
// RUTA 2: Webhook verificación (GET)
// Meta/Kapso envía un GET para verificar tu endpoint
// ============================================
app.get('/webhook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  // Token que vos definís (debe coincidir con el que configures en Kapso)
  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'factura-mvp-token';

  console.log('🔐 Verificación webhook recibida');
  console.log(`   Mode: ${mode}`);
  console.log(`   Token: ${token}`);
  console.log(`   Challenge: ${challenge}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado correctamente');
    return c.text(challenge || '');
  }

  console.log('❌ Verificación fallida');
  return c.text('Forbidden', 403);
});

// ============================================
// RUTA 3: Webhook mensajes (POST)
// Acá llegan los mensajes de WhatsApp
// Soporta formato Kapso v2
// ============================================
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    
    console.log('📨 Webhook POST recibido');
    console.log('   Tipo:', body.type);

    // Formato Kapso v2
    if (body.type === 'whatsapp.message.received' && body.data) {
      for (const item of body.data) {
        if (item.message) {
          await processMessage(item.message);
        }
      }
      return c.json({ status: 'processed' });
    }

    // Otros eventos de Kapso (conversation.created, message.delivered, etc.)
    if (body.type) {
      console.log(`   Evento ignorado: ${body.type}`);
      return c.json({ status: 'ignored', event: body.type });
    }

    // Formato Meta original (por si acaso)
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (messages && messages.length > 0) {
      for (const message of messages) {
        await processMessage(message);
      }
      return c.json({ status: 'processed' });
    }

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
  image?: { id: string; mime_type?: string };
  document?: { id: string; mime_type?: string; filename?: string };
  kapso?: {
    direction: string;
    has_media: boolean;
  };
}

async function processMessage(message: WhatsAppMessage) {
  const from = message.from;  // Número del remitente
  const messageId = message.id;
  
  console.log(`\n📱 Mensaje recibido:`);
  console.log(`   De: ${from}`);
  console.log(`   Tipo: ${message.type}`);
  console.log(`   ID: ${messageId}`);

  // Marcar como leído (opcional, mejora UX)
  await markAsRead(messageId);

  // Procesar según el tipo de mensaje
  switch (message.type) {
    case 'text':
      await handleTextMessage(from, message.text?.body || '');
      break;

    case 'image':
      await handleImageMessage(from, message.image!.id);
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
  console.log(`   Texto: "${text}"`);

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
 */
async function handleImageMessage(from: string, mediaId: string) {
  console.log(`   Media ID: ${mediaId}`);

  try {
    // 1. Notificar que estamos procesando
    await sendWhatsAppMessage(from, '⏳ Procesando tu factura...');

    // 2. Descargar la imagen
    console.log('📥 Descargando imagen...');
    // const imageBuffer = await downloadMedia(mediaId);
    // console.log(`✅ Imagen descargada: ${imageBuffer.length} bytes`);

    // 3. TODO: Procesar con OCR (Gemini)
    // Por ahora simulamos el resultado
    const invoiceData = {
      proveedor: 'Empresa Demo S.A.',
      cuit: '30-12345678-9',
      fecha: '15/11/2025',
      numeroFactura: 'A 0001-00012345',
      total: 15000.50,
      iva: 3150.11,
    };

    // 4. TODO: Guardar en Google Sheets
    console.log('📊 Datos extraídos:', invoiceData);

    // 5. Responder con los datos
    const responseMessage = 
      `✅ *¡Factura procesada!*\n\n` +
      `📋 *Proveedor:* ${invoiceData.proveedor}\n` +
      `🔢 *CUIT:* ${invoiceData.cuit}\n` +
      `📄 *Nro Factura:* ${invoiceData.numeroFactura}\n` +
      `📅 *Fecha:* ${invoiceData.fecha}\n` +
      `💰 *Total:* $${invoiceData.total.toLocaleString('es-AR')}\n` +
      `📊 *IVA:* $${invoiceData.iva.toLocaleString('es-AR')}\n\n` +
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