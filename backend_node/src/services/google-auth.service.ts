import { google } from 'googleapis';

/**
 * Servicio de autenticación con Google
 * Usa OAuth2 con refresh token para acceder a Google Sheets y Drive
 * El refresh token se obtiene una sola vez y se reutiliza indefinidamente
 */
export class GoogleAuthService {
  private auth: any;

  constructor() {
    try {
      const clientId = process.env.GOOGLE_OAUTH_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_SECRET;
      const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
          'Faltan variables de entorno: GOOGLE_OAUTH_ID, GOOGLE_OAUTH_SECRET, GOOGLE_REFRESH_TOKEN'
        );
      }

      // Crear cliente OAuth2
      this.auth = new google.auth.OAuth2(clientId, clientSecret);

      // Establecer el refresh token (permite generar access tokens indefinidamente)
      this.auth.setCredentials({
        refresh_token: refreshToken,
      });

      console.log('✅ GoogleAuthService inicializado con OAuth2');
    } catch (error) {
      console.error('❌ Error inicializando GoogleAuthService:', error);
      throw error;
    }
  }

  async getAuthClient() {
    return this.auth;
  }

  getDriveClient() {
    return google.drive({ version: 'v3', auth: this.auth });
  }

  getSheetsClient() {
    return google.sheets({ version: 'v4', auth: this.auth });
  }

  getRefreshToken(): string {
    return process.env.GOOGLE_REFRESH_TOKEN || '';
  }
}
