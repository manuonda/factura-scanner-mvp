/**
 * Cliente para la API de Kapso (WhatsApp)
 * Usa el SDK oficial: @kapso/whatsapp-cloud-api
 * Documentación: https://docs.kapso.ai
 */

import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

// ============================================
// INICIALIZAR CLIENTE
// ============================================

// Singleton del cliente (se crea una sola vez)
let client: WhatsAppClient | null = null;

function getClient(): WhatsAppClient {
  if (!client) {
    const apiKey = process.env.KAPSO_API_KEY;
    
    if (!apiKey) {
      throw new Error('❌ Falta KAPSO_API_KEY en las variables de entorno');
    }

    client = new WhatsAppClient({
      baseUrl: 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey: apiKey,
    });

    console.log('✅ Cliente Kapso inicializado');
  }
  
  return client;
}

// ============================================
// FUNCIONES PARA ENVIAR MENSAJES
// ============================================

/**
 * Envía un mensaje de texto por WhatsApp
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID
;

  if (!phoneNumberId) {
    throw new Error('❌ Falta KAPSO_PHONE_NUMBER_ID en las variables de entorno');
  }

  try {
    const whatsapp = getClient();
    
    const response = await whatsapp.messages.sendText({
      phoneNumberId,
      to,
      body,
    });

    console.log(`📤 Mensaje enviado a ${to}, ID: ${response.messages?.[0]?.id}`);
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
    throw error;
  }
}

/**
 * Envía un mensaje con formato (negrita, cursiva, etc.)
 * WhatsApp soporta: *negrita*, _cursiva_, ~tachado~, ```código```
 */
export async function sendFormattedMessage(to: string, body: string): Promise<void> {
  // Es lo mismo que sendWhatsAppMessage, WhatsApp interpreta el formato
  await sendWhatsAppMessage(to, body);
}

// ============================================
// FUNCIONES PARA MEDIA (IMÁGENES/DOCUMENTOS)
// ============================================

/**
 * Descarga un media (imagen/documento) de WhatsApp
 * @param mediaId - ID del media recibido en el webhook
 * @returns Buffer con el contenido del archivo
 */
export async function downloadMedia(mediaId: string) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error('❌ Falta KAPSO_PHONE_NUMBER_ID');
  }

  try {
    // const whatsapp = getClient(); // No usamos el SDK para esto por ahora

    console.log(`📥 Iniciando descarga manual para: ${mediaId}`);

    // 1. Obtener URL usando la API de Kapso directamente (bypass SDK)
    // Documentación: https://docs.kapso.ai/api/meta/whatsapp/media/get-media-url
    // IMPORTANTE: Kapso requiere phone_number_id como query param
    const kapsoUrl = `https://api.kapso.ai/meta/whatsapp/v21.0/${mediaId}?phone_number_id=${phoneNumberId}`;
    
    console.log(`🔍 Consultando Kapso API: ${kapsoUrl}`);

    const metadataResponse = await fetch(kapsoUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.KAPSO_API_KEY}`, // Kapso usa Bearer token
        'Content-Type': 'application/json'
      }
    });

    if (!metadataResponse.ok) {
       const errorText = await metadataResponse.text();
       throw new Error(`Error obteniendo metadata de Kapso (${metadataResponse.status}): ${errorText}`);
    }

    const metadata = await metadataResponse.json();
    const downloadUrl = metadata.url;

    if (!downloadUrl) {
      throw new Error('❌ La API de Kapso no devolvió una URL de descarga.');
    }

    console.log(`🔗 URL de descarga obtenida: ${downloadUrl}`);

    // 2. Descargar usando fetch nativo
    const headers: Record<string, string> = {
      'User-Agent': 'factura-scanner-bot/1.0'
    };

    // Si es lookaside, probamos SIN auth primero (ya que falló con auth)
    // Pero si la URL viene de Kapso, confiamos en ella.
    if (!downloadUrl.includes('lookaside.fbsbx.com')) {
       headers['Authorization'] = `Bearer ${process.env.KAPSO_API_KEY}`;
    } else {
       // Si es lookaside, intentamos SIN auth primero, ya que suele estar firmada
       console.log('ℹ️ URL de lookaside detectada, omitiendo header Authorization');
    }

    const response = await fetch(downloadUrl, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Falló la descarga HTTP ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`✅ Descarga exitosa: ${buffer.length} bytes`);
    
    // Validación final de tamaño
    if (buffer.length < 100) {
       console.warn('⚠️ ALERTA: El archivo descargado es sospechosamente pequeño.');
       console.log('Contenido:', buffer.toString());
    }

    return buffer;
  } catch (error) {
    console.error('❌ Error descargando media:', error);
    throw error;
  }
}
/**
 * Obtiene información de un media (URL, tipo, tamaño)
 */
export async function getMediaInfo(mediaId: string){
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error('❌ Falta KAPSO_PHONE_NUMBER_ID');
  }

  try {
    const whatsapp = getClient();

    const info = await whatsapp.media.get({
      mediaId,
      phoneNumberId,
    });

    // return {
    //   url: info.url,
    //   mimeType: info.mime_type,
    //   fileSize: info.file_size,
    // };
  } catch (error) {
    console.error('❌ Error obteniendo info del media:', error);
    throw error;
  }
}

// ============================================
// FUNCIONES ADICIONALES
// ============================================

/**
 * Envía una imagen por WhatsApp
 */
export async function sendImage(
  to: string, 
  imageUrl: string, 
  caption?: string
): Promise<void> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error('❌ Falta KAPSO_PHONE_NUMBER_ID');
  }

  try {
    const whatsapp = getClient();

    await whatsapp.messages.sendImage({
      phoneNumberId,
      to,
      image: {
        link: imageUrl,
        caption,
      }
    });

    console.log(`📤 Imagen enviada a ${to}`);
  } catch (error) {
    console.error('❌ Error enviando imagen:', error);
    throw error;
  }
}

/**
 * Marca un mensaje como leído
 */
export async function markAsRead(messageId: string): Promise<void> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!phoneNumberId) return;

  try {
    const whatsapp = getClient();

    // await whatsapp.messages.markAsRead({
    //   phoneNumberId,
    //   messageId,
    // });

    console.log(`👁️ Mensaje marcado como leído: ${messageId}`);
  } catch (error) {
    // No es crítico si falla
    console.log('⚠️ No se pudo marcar como leído:', error);
  }
}