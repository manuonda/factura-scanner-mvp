import { GoogleAuthService } from './google-auth.service.js';

/**
 * Servicio de Google Drive
 * Maneja la copia de plantillas y permisos de archivos
 */
export class GoogleDriveService {
  private googleAuth: GoogleAuthService;
  private drive: any;

  constructor() {
    this.googleAuth = new GoogleAuthService();
    this.drive = this.googleAuth.getDriveClient();
  }

  /**
   * Crea un nuevo Spreadsheet con estrategia de cuota optimizada
   * Paso 1: Crear SIN carpeta (evita bloqueo de cuota)
   * Paso 2: Compartir con usuario
   * Paso 3: Mover a carpeta compartida
   * @param userName Nombre del usuario
   * @param userEmail Email del usuario
   * @returns ID y URL del Sheet creado
   */
  async createUserSheet(userName: string, userEmail: string): Promise<{
    spreadsheetId: string;
    webViewLink: string;
  }> {
    try {
      console.log(`📊 Creando nuevo Spreadsheet para ${userName}...`);

      // PASO 1: Crear el archivo SIN PARENTS (evita error de cuota de la carpeta)
      const createResult = await this.drive.files.create({
        requestBody: {
          name: `Mis Gastos - ${userName}`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
        fields: 'id, webViewLink',
      });

      const spreadsheetId = createResult.data.id;
      const webViewLink = createResult.data.webViewLink;

      console.log(`✅ Spreadsheet creado: ${spreadsheetId}`);

      // PASO 2: Compartir con el usuario
      console.log(`🔐 Otorgando permisos a ${userEmail}...`);
      await this.drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: userEmail,
        },
      });

      console.log(`✅ Permisos otorgados a ${userEmail}`);

      // PASO 3: Mover a la carpeta compartida (si está configurada)
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        try {
          await this.drive.files.update({
            fileId: spreadsheetId,
            addParents: folderId,
            fields: 'id, parents',
          });
          console.log(`📁 Movido exitosamente a la carpeta compartida`);
        } catch (moveError) {
          console.warn("⚠️ No se pudo mover a la carpeta, pero el archivo se creó.");
        }
      }

      console.log(`✅ Sheet creado: ${webViewLink}`);

      return {
        spreadsheetId,
        webViewLink,
      };
    } catch (error) {
      console.error('❌ Error creando Sheet para usuario:', error);
      throw error;
    }
  }

  /**
   * Elimina un Sheet del usuario (para limpieza)
   * @param spreadsheetId ID del Sheet a eliminar
   */
  async deleteUserSheet(spreadsheetId: string): Promise<void> {
    try {
      await this.drive.files.delete({
        fileId: spreadsheetId,
        supportsAllDrives: true,
      });

      console.log(`✅ Sheet ${spreadsheetId} eliminado`);
    } catch (error) {
      console.error('❌ Error eliminando Sheet:', error);
      throw error;
    }
  }

  /**
   * Vacía la papelera de la Service Account
   * Ejecutar esto si hay problemas de cuota de almacenamiento
   */
  async emptyTrash(): Promise<void> {
    try {
      console.log(`🗑️ Vaciando papelera de la Service Account...`);
      await this.drive.files.emptyTrash();
      console.log(`✅ Papelera vaciada correctamente`);
    } catch (error) {
      console.error('❌ Error vaciando papelera:', error);
      throw error;
    }
  }
}
