/**
 * src/utils/kapso-webhook.ts
 * Utilidades para verificar y procesar webhooks de Kapso
 */

import crypto from 'crypto';

/**
 * Verifica la firma HMAC-SHA256 del webhook
 * @param payload - Body del webhook (string)
 * @param signature - Header X-Webhook-Signature
 * @param secret - Clave secreta de Kapso
 * @returns true si la firma es válida
 */
export function verifyKapsoSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    try {
        const hash = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        // Comparación segura usando timingSafeEqual
        return crypto.timingSafeEqual(
            Buffer.from(hash),
            Buffer.from(signature)
        );
    } catch (error) {
        console.error('❌ Error verificando firma:', error);
        return false;
    }
}

/**
 * Almacena claves idempotentes procesadas (en memoria)
 * Para producción, usa Redis o base de datos
 */
const processedWebhooks = new Set<string>();

/**
 * Verifica si un webhook ya fue procesado
 * @param idempotencyKey - Header X-Idempotency-Key
 * @returns true si ya fue procesado
 */
export function isWebhookProcessed(idempotencyKey: string): boolean {
    return processedWebhooks.has(idempotencyKey);
}

/**
 * Marca un webhook como procesado
 * @param idempotencyKey - Header X-Idempotency-Key
 */
export function markWebhookAsProcessed(idempotencyKey: string): void {
    processedWebhooks.add(idempotencyKey);

    // Limpiar webhooks antiguos (mantener solo últimas 10000)
    if (processedWebhooks.size > 10000) {
        const keysArray = Array.from(processedWebhooks);
        keysArray.slice(0, 1000).forEach(key => processedWebhooks.delete(key));
    }
}

/**
 * Log seguro de eventos webhook
 */
export function logWebhookEvent(
    event: string,
    idempotencyKey: string,
    status: 'received' | 'processed' | 'error',
    details?: Record<string, any>
): void {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] Webhook ${event} (${idempotencyKey}): ${status}`;

    if (status === 'error') {
        console.error(`❌ ${message}`, details);
    } else if (status === 'processed') {
        console.log(`✅ ${message}`);
    } else {
        console.log(`📨 ${message}`);
    }
}
