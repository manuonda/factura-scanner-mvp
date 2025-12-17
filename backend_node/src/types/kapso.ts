/**
 * Tipos TypeScript para mensajes de Kapso WhatsApp Cloud API
 * Basados en estructuras reales recibidas del webhook
 */

/**
 * Información de media almacenada en Kapso
 */
export interface KapsoMediaData {
  url: string;
  filename: string;
  byte_size: number;
}

/**
 * Metadata de Kapso para mensajes entrantes
 */
export interface KapsoMetadata {
  direction: 'inbound' | 'outbound';
  has_media: boolean;
  media_url?: string;
  media_data?: KapsoMediaData;
}

/**
 * Estructura de imagen de WhatsApp
 */
export interface WhatsAppImage {
  id: string;
  url: string;
  mime_type: string;
  link: string;
}

/**
 * Estructura de documento de WhatsApp
 */
export interface WhatsAppDocument {
  id: string;
  url: string;
  filename: string;
  mime_type: string;
  link: string;
}

/**
 * Estructura de texto de WhatsApp
 */
export interface WhatsAppText {
  body: string;
}

/**
 * Base para todos los mensajes de Kapso
 */
export interface KapsoMessageBase {
  type: string;
  from: string;
  id: string;
  timestamp: string;
  kapso: KapsoMetadata;
}

/**
 * Mensaje de tipo imagen
 */
export interface KapsoImageMessage extends KapsoMessageBase {
  type: 'image';
  image: WhatsAppImage;
}

/**
 * Mensaje de tipo documento
 */
export interface KapsoDocumentMessage extends KapsoMessageBase {
  type: 'document';
  document: WhatsAppDocument;
}

/**
 * Mensaje de tipo texto
 */
export interface KapsoTextMessage extends KapsoMessageBase {
  type: 'text';
  text: WhatsAppText;
}

/**
 * Union type para mensajes con media (imagen o documento)
 */
export type KapsoMediaMessage = KapsoImageMessage | KapsoDocumentMessage;

/**
 * Union type para todos los tipos de mensajes soportados
 */
export type KapsoMessage = KapsoTextMessage | KapsoImageMessage | KapsoDocumentMessage;

/**
 * Type guard para verificar si un mensaje es de tipo imagen
 */
export function isImageMessage(message: KapsoMessage): message is KapsoImageMessage {
  return message.type === 'image';
}

/**
 * Type guard para verificar si un mensaje es de tipo documento
 */
export function isDocumentMessage(message: KapsoMessage): message is KapsoDocumentMessage {
  return message.type === 'document';
}

/**
 * Type guard para verificar si un mensaje es de tipo texto
 */
export function isTextMessage(message: KapsoMessage): message is KapsoTextMessage {
  return message.type === 'text';
}

/**
 * Type guard para verificar si un mensaje contiene media
 */
export function isMediaMessage(message: KapsoMessage): message is KapsoMediaMessage {
  return message.type === 'image' || message.type === 'document';
}

/**
 * Extrae la URL de media de un mensaje (maneja ambos formatos)
 * @param message Mensaje de Kapso con media
 * @returns URL de media o undefined
 */
export function extractMediaUrl(message: KapsoMediaMessage): string | undefined {
  if (isImageMessage(message)) {
    return message.kapso.media_url || message.image.link || message.image.url;
  }
  if (isDocumentMessage(message)) {
    return message.kapso.media_url || message.document.link || message.document.url;
  }
  return undefined;
}

/**
 * Extrae el nombre de archivo de un mensaje
 * @param message Mensaje de Kapso con media
 * @returns Nombre de archivo o un nombre generado
 */
export function extractFilename(message: KapsoMediaMessage): string {
  if (isImageMessage(message)) {
    return message.kapso.media_data?.filename || `image_${message.id}.jpeg`;
  }
  if (isDocumentMessage(message)) {
    return message.document.filename || message.kapso.media_data?.filename || `document_${message.id}.pdf`;
  }
  // TypeScript should narrow to never, but adding explicit fallback
  return `file_${(message as KapsoMediaMessage).id}`;
}

/**
 * Extrae el mime type de un mensaje
 * @param message Mensaje de Kapso con media
 * @returns MIME type del archivo
 */
export function extractMimeType(message: KapsoMediaMessage): string {
  if (isImageMessage(message)) {
    return message.image.mime_type || 'image/jpeg';
  }
  if (isDocumentMessage(message)) {
    return message.document.mime_type || 'application/pdf';
  }
  return 'application/octet-stream';
}

/**
 * Extrae el tamaño del archivo de un mensaje
 * @param message Mensaje de Kapso con media
 * @returns Tamaño en bytes o undefined
 */
export function extractFileSize(message: KapsoMediaMessage): number | undefined {
  return message.kapso.media_data?.byte_size;
}
