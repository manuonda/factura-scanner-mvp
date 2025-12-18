/**
 * 📄 SERVICIO DE PROCESAMIENTO DE DOCUMENTOS
 *
 * ⚡ FIRE AND FORGET PATTERN ⚡
 *
 * Flujo de Procesamiento:
 *
 * 1. ✅ processDocument (< 100ms) - WEBHOOK HANDLER
 *    └─ Validación rápida en memoria (sin BD)
 *    └─ Lanza processInBackground SIN await
 *    └─ Responde 200 OK al webhook inmediatamente
 *
 * 2. 🔄 processInBackground (BACKGROUND TASK)
 *    └─ Buscar duplicados en BD
 *    └─ Crear registro en BD (estado PENDING)
 *    └─ Llamar processWithRetry
 *       └─ downloadAndExtract (el OCR sucede aquí)
 *          └─ extractData() - Llamada a Google Gemini (tarda 5-30s)
 *          └─ Guardar resultado en BD
 *    └─ Notificar usuario cuando esté listo
 *
 * 3. 🎯 Flujo de Errores
 *    - Validación rápida fallida → Respuesta inmediata en webhook
 *    - Error en OCR → Reintentos automáticos (max 3 intentos)
 *    - Status actualizado en BD → Usuario puede consultarlo
 */

import prisma from '../db/client.js';
import type {
  ProcessDocumentRequest,
  ProcessDocumentResult,
  ProcessingError,
  DocumentValidationResult,
  RetryConfig,
} from '@/dtos/documento.dto.js';
import {
  DocumentProcessingStatus,
  DocumentValidationErrorCode,
  isValidUrl,
  isSupportedMimeType,
  isValidFileSize,
} from '@/dtos/documento.dto.js';
import {
  extractMediaUrl,
  extractFilename,
  extractMimeType,
  extractFileSize,
  isMediaMessage,
} from '@/types/kapso.js';
import { extractData, type InvoiceData } from '../ocr.js';
import type { DocumentRepository } from '@/repositories/document.repository.js';

/**
 * Configuración de reintentos por defecto
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Servicio de procesamiento de documentos
 */
export class DocumentService {
  private documentRepository: DocumentRepository;
  
  constructor(documentRepository: DocumentRepository) {
    this.documentRepository = documentRepository;
  }

  /**
   * ⚡ FIRE AND FORGET PATTERN ⚡
   * Responde inmediatamente (< 100ms) para no bloquear el webhook
   * Inicia el procesamiento en background SIN AWAIT
   *
   * Flujo:
   * 1. Validación mínima (en memoria, sin BD)
   * 2. Responder 200 OK al webhook
   * 3. Procesar pesado en background (OCR, BD, reintentos)
   */
  async processDocument(
    request: ProcessDocumentRequest
  ): Promise<ProcessDocumentResult> {
    const { userId, phoneNumber, message } = request;
    let success: boolean = true;

  
    // Es de tipo media válida
    if (!isMediaMessage(message)) {
      success = false;
      return this.createErrorResult(
        'El mensaje no contiene media válida',
        DocumentProcessingStatus.FAILED_VALIDATION,
        { code: 'NO_MEDIA', retryable: false }
      );
    }

    // B. Extraer datos básicos
    const mediaUrl = extractMediaUrl(message);
    const mimeType = extractMimeType(message);
    const fileSize = extractFileSize(message);

    // Validar URL, Tipo y Tamaño (Todo en memoria)
    const validation = this.validateDocument(mediaUrl, mimeType, fileSize);
    
    if (!validation.isValid) {
      success = false;
      return this.createErrorResult(
        validation.error || 'Documento inválido',
        DocumentProcessingStatus.FAILED_VALIDATION,
        { code: validation.errorCode ?? 'VALIDATION_ERROR', retryable: false }
      );
    }


    // ============================================
    // RESPUESTA INMEDIATA AL WEBHOOK (< 100ms)
    // ============================================
    console.log(`✅ [RÁPIDO] Documento ${message.id} aceptado, procesando en background...`);

    // Lanzar procesamiento en background SIN AWAIT
    // Esto permite responder al webhook inmediatamente
    this.processInBackground(request, mediaUrl!).catch(err => {
      console.error(`❌ [BACKGROUND] Error fatal procesando ${message.id}:`, err);
    });

    // Responder exitosamente al webhook de inmediato
    return {
      success,
      documentId: message.id,
      status: DocumentProcessingStatus.PENDING,
      message: 'Documento en procesamiento',
    };
  }

  /**
   * 🔄 PROCESAMIENTO EN BACKGROUND
   * Lógica pesada que corre sin bloquear el webhook
   */
  private async processInBackground(
    request: ProcessDocumentRequest,
    mediaUrl: string
  ): Promise<void> {
    const { userId, phoneNumber, message } = request;
    const filename = extractFilename(message);
    const mimeType = extractMimeType(message);
    const fileSize = extractFileSize(message);
    const messageId = message.id;

    try {
      console.log(`🚀 [BACKGROUND] Iniciando procesamiento: ${messageId}`);
      console.log(`   Usuario: ${userId}`);
      console.log(`   Archivo: ${filename}`);
      console.log(`   MIME: ${mimeType}`);

     

      // ============================================
      // BUSCAR DUPLICADOS (puede tardar, consultando BD)
      // ============================================
      const existing = await this.documentRepository.findExistingDocument(messageId);
      if (existing) {
        console.log(`ℹ️ [BACKGROUND] Documento ya procesado: ${existing.id}`);
        return;
      }

      // ============================================
      // CREAR REGISTRO EN BD (PENDING)
      // ============================================
      const document = await this.documentRepository.createDocumentRecord({
        userId,
        phoneNumber,
        messageId,
        type: message.type,
        filename,
        mimeType,
        fileSize,
        kapsoMediaUrl: mediaUrl,
      });

      console.log(`📝 [BACKGROUND] Documento creado en BD: ${document.id}`);

    } catch (error) {
      console.error(`❌ [BACKGROUND] Error inesperado en ${messageId}:`, error);
      // Podrías enviar notificación al usuario aquí
    }
  }

  /**
   * Valida un documento antes de procesarlo
   */
  private validateDocument(
    mediaUrl: string | undefined,
    mimeType: string,
    fileSize: number | undefined
  ): DocumentValidationResult {
    // Validar URL
    if (!mediaUrl) {
      return {
        isValid: false,
        error: 'No se encontró URL de media en el mensaje',
        errorCode: DocumentValidationErrorCode.NO_MEDIA_URL,
      };
    }

    if (!isValidUrl(mediaUrl)) {
      return {
        isValid: false,
        error: 'URL de media no es válida',
        errorCode: DocumentValidationErrorCode.INVALID_URL,
      };
    }

    // Validar MIME type
    if (!isSupportedMimeType(mimeType)) {
      return {
        isValid: false,
        error: `Tipo de archivo no soportado: ${mimeType}. Solo se aceptan imágenes (JPEG, PNG, WebP) y PDFs`,
        errorCode: DocumentValidationErrorCode.UNSUPPORTED_MIME_TYPE,
      };
    }

    // Validar tamaño
    if (!isValidFileSize(fileSize)) {
      return {
        isValid: false,
        error: `Archivo demasiado grande: ${fileSize} bytes. Máximo 10MB`,
        errorCode: DocumentValidationErrorCode.FILE_TOO_LARGE,
      };
    }

    return { isValid: true };
  }


  /**
   * Descarga y extrae datos del documento
   */
  private async downloadAndExtract(mediaUrl: string): Promise<InvoiceData> {
    console.log(`   Descargando desde: ${mediaUrl.substring(0, 60)}...`);

    // Llamar al OCR con la URL (Gemini procesa la imagen)
    const result = await extractData(mediaUrl);

    // Validar que la extracción fue exitosa
    if (!result.isInvoice) {
      throw new Error(result.reason || 'El documento no es una factura válida');
    }

    if (!result.data) {
      throw new Error('No se pudo extraer datos del documento');
    }

    return result;
  }


  /**
   * Analiza un error y lo clasifica
   */
  private analyzeError(error: unknown): ProcessingError {
    // Error de HTTP
    if (error instanceof Error && 'status' in error) {
      const httpError = error as any;
      const status = httpError.status || httpError.statusCode;

      switch (status) {
        case 401:
          return {
            code: 401,
            message: 'No autorizado para acceder al recurso',
            retryable: false,
          };
        case 404:
          return {
            code: 404,
            message: 'Recurso no encontrado',
            retryable: false,
          };
        case 429:
          return {
            code: 429,
            message: 'Demasiadas solicitudes, reintentar más tarde',
            retryable: true,
          };
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            code: status,
            message: 'Error del servidor, reintentando...',
            retryable: true,
          };
        default:
          return {
            code: status,
            message: httpError.message || 'Error HTTP desconocido',
            retryable: status >= 500,
          };
      }
    }

    // Error de timeout
    if (error instanceof Error && error.message.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        message: 'Timeout al procesar el documento',
        retryable: true,
      };
    }

    // Error de red
    if (error instanceof Error && (error.message.includes('network') || error.message.includes('ECONNREFUSED'))) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Error de conexión de red',
        retryable: true,
      };
    }

    // Error genérico
    return {
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }

  /**
   * Obtiene el status apropiado basado en el error
   */
  private getStatusFromError(error?: ProcessingError): DocumentProcessingStatus {
    if (!error) return DocumentProcessingStatus.ERROR;

    if (typeof error.code === 'number') {
      switch (error.code) {
        case 401:
          return DocumentProcessingStatus.FAILED_401_UNAUTHORIZED;
        case 404:
          return DocumentProcessingStatus.FAILED_404_NOT_FOUND;
        default:
          return DocumentProcessingStatus.FAILED_DOWNLOAD;
      }
    }

    if (error.code === 'OCR_ERROR') {
      return DocumentProcessingStatus.FAILED_OCR;
    }

    return DocumentProcessingStatus.ERROR;
  }

  /**
   * Helper para crear un resultado de error
   */
  private createErrorResult(
    message: string,
    status: DocumentProcessingStatus,
    error?: Partial<ProcessingError>
  ): ProcessDocumentResult {
    const errorResult: ProcessingError = {
      code: error?.code || 'UNKNOWN',
      message,
      retryable: error?.retryable ?? false,
    };
    if (error?.details) {
      errorResult.details = error.details;
    }
    return {
      success: false,
      status,
      message,
      error: errorResult,
    };
  }

  /**
   * Helper para esperar
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 💾 GUARDAR RESULTADO EN BACKGROUND (sin bloquear respuesta al usuario)
   *
   * Se ejecuta SIN AWAIT después de responder al usuario
   * Guarda en BD el resultado del OCR y opcionalmente el archivo
   */
  async saveProcessingResult(data: {
    userId: string;
    phoneNumber: string;
    message: any; // KapsoMediaMessage
    invoiceData: InvoiceData;
    mediaUrl: string;
  }): Promise<void> {
    const { userId, phoneNumber, message, invoiceData, mediaUrl } = data;

    try {
      console.log(`💾 [BACKGROUND] Guardando resultado de ${message.id}...`);

      // ============================================
      // 1. CREAR REGISTRO EN BD
      // ============================================
      const document = await this.documentRepository.createDocumentRecord({
        userId,
        phoneNumber,
        messageId: message.id,
        type: message.type,
        filename: extractFilename(message),
        mimeType: extractMimeType(message),
        fileSize: extractFileSize(message),
        kapsoMediaUrl: mediaUrl,
      });

      console.log(`   📝 Documento creado en BD: ${document.id}`);

      // ============================================
      // 2. ACTUALIZAR CON RESULTADO DE GEMINI
      // ============================================
      const finalStatus = invoiceData.isInvoice
        ? DocumentProcessingStatus.SUCCESS
        : DocumentProcessingStatus.FAILED_VALIDATION;

      await this.documentRepository.updateDocumentStatus(document.id, {
        status: finalStatus,
        extractionResult: invoiceData,
        processedAt: new Date(),
        errorMessage: !invoiceData.isInvoice ? invoiceData.reason : null,
      } as any);

      console.log(`   ✅ Resultado guardado en BD: ${finalStatus}`);

      // ============================================
      // 3. TODO: GUARDAR ARCHIVO DESCARGADO (opcional)
      // ============================================
      // En el futuro, guardar en /uploads/{documentId}.pdf
      // Por ahora, solo guardamos en BD

    } catch (error) {
      console.error(`❌ [BACKGROUND] Error guardando resultado:`, error);
      // No re-lanzar el error porque esto se ejecuta sin await
      // y queremos que el usuario ya tenga su respuesta
    }
  }


}
