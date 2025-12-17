/**
 * DTOs para procesamiento de documentos
 */

import type { KapsoMediaMessage } from '../types/kapso.js';

/**
 * Estados posibles del procesamiento de documentos
 */
export enum DocumentProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  ERROR = 'error',
  FAILED_VALIDATION = 'failed_validation',
  FAILED_401_UNAUTHORIZED = 'failed_401',
  FAILED_404_NOT_FOUND = 'failed_404',
  FAILED_DOWNLOAD = 'failed_download',
  FAILED_OCR = 'failed_ocr',
}

/**
 * Request para procesar un documento
 */
export interface ProcessDocumentRequest {
  userId: string;
  phoneNumber: string;
  message: KapsoMediaMessage;
}

/**
 * Resultado de validación de documento
 */
export interface DocumentValidationResult {
  isValid: boolean;
  error?: string;
  errorCode?: DocumentValidationErrorCode;
}

/**
 * Códigos de error de validación
 */
export enum DocumentValidationErrorCode {
  INVALID_URL = 'INVALID_URL',
  UNSUPPORTED_MIME_TYPE = 'UNSUPPORTED_MIME_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  NO_MEDIA_URL = 'NO_MEDIA_URL',
}

/**
 * Resultado del procesamiento de documento
 */
export interface ProcessDocumentResult {
  success: boolean;
  documentId?: string;
  status: DocumentProcessingStatus;
  message: string;
  extractionData?: InvoiceExtractionData;
  error?: ProcessingError;
}

/**
 * Error de procesamiento detallado
 */
export interface ProcessingError {
  code: number | string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/**
 * Estructura anidada de datos de factura extraídos
 */
export interface InvoiceDataDetails {
  proveedor?: string | null;
  cuit?: string | null;
  fecha?: string | null;
  numeroFactura?: string | null;
  total?: number | null;
  iva?: number | null;
  subtotal?: number | null;
  condicionIva?: string | null;
  tipoFactura?: string | null;
  puntoVenta?: string | null;
}

/**
 * Datos extraídos de una factura por OCR
 */
export interface InvoiceExtractionData {
  isInvoice: boolean;
  documentType?: 'factura' | 'recibo' | 'ticket' | 'otro';
  reason?: string;
  data?: InvoiceDataDetails;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Opciones para el procesamiento de documentos
 */
export interface ProcessingOptions {
  maxRetries?: number;
  timeout?: number;
  validateUrl?: boolean;
  skipDuplicates?: boolean;
}

/**
 * Configuración de retry
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Estado actual del procesamiento
 */
export interface ProcessingState {
  documentId: string;
  status: DocumentProcessingStatus;
  currentRetry: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Validador de MIME types soportados
 */
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[number];

/**
 * Límite de tamaño de archivo (10MB)
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Type guard para verificar si un MIME type es soportado
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType);
}

/**
 * Valida el tamaño del archivo
 */
export function isValidFileSize(size: number | undefined): boolean {
  if (size === undefined) return true; // Asumir válido si no hay tamaño
  return size <= MAX_FILE_SIZE_BYTES;
}

/**
 * Valida que una URL sea válida
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}
