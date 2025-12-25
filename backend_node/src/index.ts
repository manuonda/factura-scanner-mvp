import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { Container } from './container.js';

const container = new Container();
const app = new Hono();

// Middleware de logging
app.use('*', logger());

// Puerto
const port = process.env.PORT || 3000;



// Health check
app.get('/', (c) => container.getHealthController().getHealth(c));

// OAuth2 callback
app.get('/oauth2callback', (c) => container.getOAuth2Controller().handleCallback(c));

// Webhook de WhatsApp
app.post('/webhook', (c) => container.getWebhookController().handleWebhook(c));

// ============================================
// INICIO DEL SERVIDOR
// ============================================
console.log('');
console.log('🚀 ================================');
console.log('   FACTURA WHATSAPP - MVP');
console.log('   ================================');
console.log(`   Puerto: ${port}`);
console.log(`   Health: http://localhost:${port}/`);
console.log(`   Webhook: http://localhost:${port}/webhook`);
console.log('   ================================');
console.log('');

serve({
  fetch: app.fetch,
  port: Number(port),
});

console.log(`Server running on port ${port}`);
