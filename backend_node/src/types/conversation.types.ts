/**
 * Tipos para el manejo del estado de conversación y registro
 * Gestiona el flujo multi-paso de registro de usuarios
 */

/**
 * Estados posibles del registro
 */
export enum RegistrationStep {
  COMPLETED = 'completed',
  AWAITING_NAME = 'awaiting_name',
  AWAITING_COMPANY = 'awaiting_company',
  AWAITING_EMAIL = 'awaiting_email',
}

/**
 * Estado de la conversación por usuario
 * Se almacena en memoria (puede ser Redis en producción)
 */
export interface ConversationState {
  phoneNumber: string;
  currentStep: RegistrationStep;
  pendingData: PendingRegistrationData;
  lastInteraction: Date;
  retryCount: number;
}

/**
 * Datos temporales del registro que se van acumulando
 */
export interface PendingRegistrationData {
  name?: string;
  companyName?: string;
  email?: string;
}

/**
 * Validación de cada campo del registro
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedValue?: string;
}

/**
 * Contexto completo de procesamiento de mensaje
 */
export interface MessageContext {
  phoneNumber: string;
  messageText: string;
  isNewUser: boolean;
  registrationComplete: boolean;
  conversationState?: ConversationState;
}
