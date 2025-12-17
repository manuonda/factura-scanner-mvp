/**
 * Servicio para procesamiento de documentos con manejo robusto de errores
 * y reintentos automáticos
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

    // ============================================
    // VALIDACIÓN RÁPIDA (en memoria, sin BD)
    // ============================================

    // ============================================
    // 1. VALIDACIÓN RÁPIDA (Fail Fast)
    // ============================================

    // A. Verificar existencia de media
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

    // C. Validar URL, Tipo y Tamaño (Todo en memoria)
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
   * Incluye: validación completa, OCR, BD, reintentos, notificaciones
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

      // ============================================
      // PROCESAR CON REINTENTOS (OCR puede tardar)
      // ============================================
      await this.processWithRetry(
        document.id,
        mediaUrl,
        phoneNumber,
        DEFAULT_RETRY_CONFIG
      );

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
   * Procesa un documento con lógica de reintentos
   * Se ejecuta en background sin bloquear la respuesta al webhook
   */
  private async processWithRetry(
    documentId: string,
    mediaUrl: string,
    phoneNumber: string,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<void> {
    let lastError: ProcessingError | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        console.log(`   Intento ${attempt}/${config.maxAttempts}`);

        // Actualizar estado a PROCESSING
        await this.documentRepository.updateDocumentStatus(documentId, {
          status: DocumentProcessingStatus.PROCESSING,
          retryCount: attempt - 1,
        } as any);

        // Intentar descargar y procesar con OCR
        const result = await this.downloadAndExtract(mediaUrl);

        // Si fue exitoso, guardar resultado
        await this.documentRepository.updateDocumentStatus(documentId, {
          status: DocumentProcessingStatus.SUCCESS,
          extractionResult: result,
          processedAt: new Date(),
        } as any);

        console.log(`   ✅ Procesamiento exitoso de ${documentId}`);
        return; // Éxito, salir del loop de reintentos

      } catch (error) {
        console.error(`   ❌ Error en intento ${attempt}:`, error);

        // Analizar el error
        lastError = this.analyzeError(error);

        // Guardar error en BD
        await this.documentRepository.updateDocumentStatus(documentId, {
          status: this.getStatusFromError(lastError),
          errorCode: typeof lastError.code === 'number' ? lastError.code : undefined,
          errorMessage: lastError.message,
          retryCount: attempt,
        } as any);

        // Si no es reintenTable, salir
        if (!lastError.retryable) {
          console.log(`   ℹ️ Error no reintenTable, abortando`);
          return;
        }

        // Si no es el último intento, esperar antes de reintentar
        if (attempt < config.maxAttempts) {
          const delay = Math.min(
            config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
            config.maxDelayMs
          );
          console.log(`   ⏳ Esperando ${delay}ms antes de reintentar...`);
          await this.sleep(delay);
        }
      }
    }

    // Si llegamos acá, todos los intentos fallaron
    console.error(`❌ Todos los intentos fallaron para ${documentId}`);
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



 
}
