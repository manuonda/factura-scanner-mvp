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


export async function extractData(
    imageUrlOrBuffer: string | Buffer
): Promise<InvoiceData> {
    const client = createGeminiClient();

    // Prompt unificado: Valida Y extrae
    const prompt = `
    Analiza la imagen adjunta. Eres un experto en documentos fiscales argentinos.

    PASO 1: CLASIFICACIÓN
    Determina si la imagen es una factura, ticket, recibo o comprobante fiscal válido de Argentina.

    PASO 2: EXTRACCIÓN (Solo si es válido)
    Si es un documento válido, extrae los datos clave.

    Responde EXCLUSIVAMENTE con este JSON:
    {
      "isInvoice": boolean,
      "documentType": "factura" | "recibo" | "ticket" | "otro",
      "reason": "breve explicación de la clasificación",
      "data": {
        "proveedor": "Nombre de la empresa o null",
        "cuit": "XX-XXXXXXXX-X o null",
        "fecha": "DD/MM/YYYY o null",
        "numeroFactura": "string o null",
        "total": number o null (usar punto decimal),
        "iva": number o null
      }
    }
    `;

    try {
        // Construir las partes del contenido
        const parts: any[] = [{ text: prompt }];

        let imageBuffer: Buffer;

        if (typeof imageUrlOrBuffer === 'string') {
            // Es una URL - descargar el archivo
            console.log('🔗 Descargando imagen desde URL de Kapso...');
            const response = await fetch(imageUrlOrBuffer);
            if (!response.ok) {
                throw new Error(`Error descargando URL (${response.status}): ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            console.log(`✅ Imagen descargada: ${imageBuffer.length} bytes`);
        } else {
            // Ya es un Buffer
            imageBuffer = imageUrlOrBuffer;
        }

        // Convertir a base64 para Gemini
        const base64Image = imageBuffer.toString('base64');
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image
            }
        });

        const response = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ],
            config: {
                responseMimeType: "application/json",
                temperature: 0.1,
            }
        });

        const resultText = response.text; 
        if (!resultText) {
            console.error("Respuesta vacía de Gemini");
            return {
                isInvoice: false,
                reason: "No se pudo procesar la factura (respuesta vacía)"
            };
        }

        const parseData = JSON.parse(resultText) as InvoiceData;
        // if(response.usageMetadata){
        //     parseData.usage = {
        //         promptTokens: response.usageMetadata.promptTokens,
        //         completionTokens: response.usageMetadata.completionTokens,
        //         totalTokens: response.usageMetadata.totalTokens
        //     }
        // }
        return parseData;

    } catch (error) {
        console.error("Error en OCR:", error);
        return { 
            isInvoice: false, 
            reason: "Error procesando la imagen: " + (error as Error).message 
        };
    }
}