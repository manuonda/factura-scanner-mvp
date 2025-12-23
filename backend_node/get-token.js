/**
 * Script para obtener Google OAuth2 Refresh Token
 * Ejecutar: node get-token.js
 */

import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_OAUTH_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_SECRET;
const REDIRECT_URL = 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Falta GOOGLE_OAUTH_ID o GOOGLE_OAUTH_SECRET en .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

async function getToken() {
  console.log('🔐 Iniciando flujo OAuth2...\n');

  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  console.log('📱 Abre esta URL en tu navegador:\n');
  console.log(authUrl);
  console.log('\n⏳ Esperando autorización en http://localhost:3000...\n');

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) return;

      const urlObj = new URL(req.url, 'http://localhost:3000');
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      if (error) {
        res.writeHead(400);
        res.end(`Error: ${error}`);
        console.error(`❌ Error: ${error}`);
        process.exit(1);
      }

      if (code) {
        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {
          res.writeHead(400);
          res.end('No se obtuvo refresh token');
          console.error('❌ No se generó refresh token');
          process.exit(1);
        }

        console.log('\n✅ ¡Autorización exitosa!\n');
        console.log('🔑 Tu Refresh Token:');
        console.log(refreshToken);
        console.log('\n');

        // Guardar en .env
        const envPath = path.join(process.cwd(), '.env');
        let envContent = fs.readFileSync(envPath, 'utf-8');

        const refreshTokenLine = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
        const refreshTokenRegex = /^GOOGLE_REFRESH_TOKEN=.*$/m;

        if (refreshTokenRegex.test(envContent)) {
          envContent = envContent.replace(refreshTokenRegex, refreshTokenLine);
        } else {
          envContent += `\n${refreshTokenLine}`;
        }

        fs.writeFileSync(envPath, envContent);

        console.log('✅ Refresh Token guardado en .env');
        console.log('\n🎉 ¡Setup OAuth2 completado!\n');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1>✅ Autorización completada</h1>
              <p>El refresh token se ha guardado en <strong>.env</strong></p>
              <p>Puedes cerrar esta ventana.</p>
            </body>
          </html>
        `);

        server.close();
        setTimeout(() => process.exit(0), 1000);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      res.writeHead(500);
      res.end('Error interno');
      process.exit(1);
    }
  });

  server.listen(3001);
}

getToken();
