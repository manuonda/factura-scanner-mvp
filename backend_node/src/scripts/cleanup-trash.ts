/**
 * Script para limpiar la papelera de la Service Account
 *
 * Uso:
 * npx ts-node src/scripts/cleanup-trash.ts
 */

import { GoogleDriveService } from '../services/google-drive.service.js';

async function cleanupTrash() {
  console.log('🗑️ Iniciando limpieza de papelera...\n');

  try {
    const driveService = new GoogleDriveService();
    await driveService.emptyTrash();

    console.log('\n✅ ¡Limpieza completada! La papelera ha sido vaciada.');
    console.log('📌 Ahora reinicia el servidor y prueba el flujo de registro nuevamente.');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error);
    process.exit(1);
  }
}

cleanupTrash();
