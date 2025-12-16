export interface KapsoMessage {
  id: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'list';
  timestamp: string;
  from?: string; // Presente en mensajes entrantes (inbound)
  to?: string;   // Presente en mensajes salientes (outbound)
  
  // Contenido según el tipo
  text?: { 
    body: string 
  };
  image?: { 
    id: string; 
    mime_type?: string; 
    link?: string;
    caption?: string;
  };
  document?: { 
    id: string; 
    mime_type?: string; 
    filename?: string; 
    link?: string;
    caption?: string;
  };
  
  // Metadatos específicos de Kapso
  kapso?: {
    direction: 'inbound' | 'outbound';
    status?: 'sent' | 'delivered' | 'read' | 'failed';
    processing_status?: string;
    has_media: boolean;
    media_url?: string;
    origin?: string;
    content?: string;
  };
  
  context?: {
    id?: string;
    from?: string;
  } | null;
}

export interface KapsoConversation {
  id: string;
  contact_name: string;
  phone_number: string;
  phone_number_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  is_new_conversation?: boolean;
  kapso?: {
    messages_count: number;
    last_message_id: string;
    last_message_type: string;
    last_message_timestamp: string;
    last_inbound_at?: string;
    last_outbound_at?: string;
  };
}

// Estructura del Payload que recibiste en el log
export interface KapsoWebhookPayload {
  message?: KapsoMessage;
  conversation?: KapsoConversation;
  is_new_conversation?: boolean;
  phone_number_id?: string;
  
  // Campos para compatibilidad con otros formatos (si existen)
  type?: string; 
  data?: any[];
}
