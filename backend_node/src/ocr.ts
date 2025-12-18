import { GoogleGenAI } from '@google/genai';

export interface InvoiceData {
  isInvoice: boolean;
  documentType?: "factura" | "recibo" | "ticket" | "otro";
  reason?: string; // Razón si no es factura o si hay dudas
  data?: {
    proveedor: string | null;
    cuit: string | null;
    fecha: string | null;
    numeroFactura: string | null;
    total: number | null;
    iva: number | null;
  };
  usage?: {
    promptTokens: number | undefined;
    completionTokens: number | undefined;
    totalTokens: number | undefined;
  };
}

let getGeminiClient: GoogleGenAI | null = null;

function createGeminiClient(): GoogleGenAI {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new Error('GEMINI_API_KEY is not set');
    }
    return new GoogleGenAI({
        apiKey: key
    });
}


// export async function extractData(
//     imageUrlOrBuffer: string | Buffer
// ): Promise<InvoiceData> {
//     const client = createGeminiClient();

//     // Prompt optimizado para Argentina: Incluye facturas, tickets y comprobantes de pago
//     const prompt = `
//     Analiza el documento adjunto actuando como un experto en gestión administrativa y fiscal de Argentina.

//     PASO 1: CLASIFICACIÓN
//     Determina si la imagen es un documento de transacción válido, como:
//     - Facturas (Letras A, B, C, M) y Notas de Crédito.
//     - Tickets de compra o tickets fiscales.
//     - Comprobantes de transferencia (Mercado Pago, bancos).
//     - Comprobantes de pago de servicios (PagoMisCuentas, Red Link, comprobantes de entes públicos).
//     - Recibos de pago.

//     PASO 2: EXTRACCIÓN
//     Si es válido, extrae los datos. Si hay varios montos, usa el "Total" o "Monto Pagado".

//     Responde EXCLUSIVAMENTE con este JSON:
//     {
//       "isInvoice": boolean,
//       "documentType": "factura" | "recibo" | "ticket" | "comprobante_pago" | "otro",
//       "reason": "breve explicación de por qué es o no es válido",
//       "data": {
//         "proveedor": "Nombre de la empresa, comercio o receptor del pago",
//         "cuit": "CUIT del emisor/proveedor (XX-XXXXXXXX-X)",
//         "fecha": "DD/MM/YYYY",
//         "numeroFactura": "Número de comprobante, operación o control",
//         "total": number (usar punto decimal, sin símbolos de moneda),
//         "iva": number | null (monto del IVA si está discriminado)
//       }
//     }
//     `;

//     try {
//         let imageBuffer: Buffer;
//         let mimeType = 'image/jpeg'; // Default

//         if (typeof imageUrlOrBuffer === 'string') {
//             console.log('🔗 Descargando documento desde URL de Kapso...');
//             const response = await fetch(imageUrlOrBuffer);
//             if (!response.ok) throw new Error(`Error descargando URL: ${response.statusText}`);

//             // Detectar MIME type desde los headers de la respuesta
//             mimeType = response.headers.get('content-type') || 'image/jpeg';
//             const arrayBuffer = await response.arrayBuffer();
//             imageBuffer = Buffer.from(arrayBuffer);
//             console.log(`✅ Documento descargado: ${imageBuffer.length} bytes (${mimeType})`);
//         } else {
//             imageBuffer = imageUrlOrBuffer;
//         }

//         const base64Data = imageBuffer.toString('base64');

//         const response = await client.models.generateContent({
//             model: "gemini-2.0-flash",
//             contents: [{
//                 role: "user",
//                 parts: [
//                     { text: prompt },
//                     { inlineData: { mimeType: mimeType, data: base64Data } }
//                 ]
//             }],
//             config: {
//                 responseMimeType: "application/json",
//                 temperature: 0.1,
//             }
//         });

//         const resultText = response.text;
//         if (!resultText) throw new Error("Respuesta vacía de Gemini");

//         const parseData = JSON.parse(resultText) as InvoiceData;

//         // Inyectar metadatos de uso si existen
//         if (response.usageMetadata) {
//             console.log("📊 Tokens utilizados:");
//             console.log(`   Prompt: ${response.usageMetadata.promptTokenCount}`);
//             console.log(`   Completación: ${response.usageMetadata.candidatesTokenCount}`);
//             console.log(`   Total: ${response.usageMetadata.totalTokenCount}`);

//             parseData.usage = {
//                 promptTokens: response.usageMetadata.promptTokenCount,
//                 completionTokens: response.usageMetadata.candidatesTokenCount,
//                 totalTokens: response.usageMetadata.totalTokenCount
//             };
//         }

//         return parseData;

//     } catch (error) {
//         console.error("Error en OCR:", error);
//         return {
//             isInvoice: false,
//             reason: "Error procesando el documento: " + (error as Error).message
//         };
//     }
// }

export async function extractData(
    imageUrlOrBuffer: string | Buffer,
    fileName: string = "documento_desconocido"
): Promise<InvoiceData & { fileInfo: { name: string, type: string } }> {
    const client = createGeminiClient();

    const prompt = `
    Analiza el documento adjunto actuando como un experto en gestión administrativa y fiscal de Argentina.

    PASO 1: CLASIFICACIÓN
    Determina si la imagen es un documento de transacción válido, como:
    - Facturas (Letras A, B, C, M) y Notas de Crédito.
    - Tickets de compra o tickets fiscales.
    - Comprobantes de transferencia (Mercado Pago, bancos).
    - Comprobantes de pago de servicios (PagoMisCuentas, Red Link, comprobantes de entes públicos).
    - Recibos de pago.

    PASO 2: EXTRACCIÓN
    Si es válido, extrae los datos. Si hay varios montos, usa el "Total" o "Monto Pagado".
    Si es un comprobante de servicio, el "proveedor" es la empresa prestadora.

    Responde EXCLUSIVAMENTE con este JSON:
    {
      "isInvoice": boolean,
      "documentType": "factura" | "recibo" | "ticket" | "comprobante_pago" | "otro",
      "reason": "breve explicación de por qué es o no es válido",
      "data": {
        "proveedor": "Nombre de la empresa, comercio o receptor del pago",
        "cuit": "CUIT del emisor/proveedor (XX-XXXXXXXX-X)",
        "fecha": "DD/MM/YYYY",
        "numeroFactura": "Número de comprobante, operación o control",
        "total": number (usar punto decimal, sin símbolos de moneda),
        "iva": number | null (monto del IVA si está discriminado)
      }
    }
    `;

    try {
        let imageBuffer: Buffer;
        let mimeType = 'image/jpeg'; // Default

        if (typeof imageUrlOrBuffer === 'string') {
            console.log('🔗 Descargando documento desde URL de Kapso...');
            const response = await fetch(imageUrlOrBuffer);
            if (!response.ok) throw new Error(`Error descargando URL: ${response.statusText}`);

            mimeType = response.headers.get('content-type') || 'image/jpeg';
            const arrayBuffer = await response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            console.log(`✅ Documento descargado: ${imageBuffer.length} bytes (${mimeType})`);
        } else {
            imageBuffer = imageUrlOrBuffer;
            // Detección simple para buffers locales para asegurar el envío correcto a Gemini
            const isPdf = imageBuffer.slice(0, 4).toString() === '%PDF';
            mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
            console.log(`📦 Procesando Buffer local: ${imageBuffer.length} bytes (Tipo detectado: ${mimeType})`);
        }

        const base64Data = imageBuffer.toString('base64');

        const response = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: mimeType, data: base64Data } }
                ]
            }],
            config: {
                responseMimeType: "application/json",
                temperature: 0.1,
            }
        });

        const resultText = response.text;
        if (!resultText) throw new Error("Respuesta vacía de Gemini");

        const parseData = JSON.parse(resultText);
        console.log("✅ Datos extraídos del documento:", parseData);

        const tiposValidos = ['factura', 'recibo', 'ticket', 'comprobante_pago'];

        // Estructura final con metadatos de archivo
        const finalResult = {
            ...parseData, // Primero esparcimos los datos de la IA
            isInvoice: tiposValidos.includes(parseData.documentType) || parseData.isInvoice, // Luego sobrescribimos
            fileInfo: {
                name: fileName, // Verificá que estés pasando el nombre al llamar la función
                type: mimeType
            }
        };

        // Inyectar metadatos de uso y mostrar logs
        if (response.usageMetadata) {
            console.log("📊 Tokens utilizados:");
            console.log(`   Prompt: ${response.usageMetadata.promptTokenCount}`);
            console.log(`   Completación: ${response.usageMetadata.candidatesTokenCount}`);
            console.log(`   Total: ${response.usageMetadata.totalTokenCount}`);

            finalResult.usage = {
                promptTokens: response.usageMetadata.promptTokenCount,
                completionTokens: response.usageMetadata.candidatesTokenCount,
                totalTokens: response.usageMetadata.totalTokenCount
            };
        }

        return finalResult;

    } catch (error) {
        console.error("Error en OCR:", error);
        return {
            isInvoice: false,
            reason: "Error procesando el documento: " + (error as Error).message,
            fileInfo: { name: fileName, type: "error" }
        } as any;
    }
}