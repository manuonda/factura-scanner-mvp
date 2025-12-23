import { GoogleAuthService } from './google-auth.service.js';
import type { InvoiceData } from '../ocr.js';

/**
 * Servicio de Google Sheets
 * Maneja la escritura de datos a las planillas de usuarios
 */
export class GoogleSheetService {
  private googleAuth: GoogleAuthService;
  private sheets: any;

  constructor() {
    this.googleAuth = new GoogleAuthService();
    this.sheets = this.googleAuth.getSheetsClient();
  }

  /**
   * Agrega una fila de comprobante/factura al Sheet del usuario
   * @param spreadsheetId ID del Sheet del usuario
   * @param invoiceData Datos extraídos por Gemini
   */
  async appendInvoiceRow(
    spreadsheetId: string,
    invoiceData: InvoiceData
  ): Promise<void> {
    try {
      const now = new Date().toLocaleString('es-AR');

      // Preparar valores para agregar
      const values = [[
        now,                                      // Fecha Registro
        invoiceData.documentType || 'otro',       // Tipo
        invoiceData.data?.proveedor || '',        // Proveedor
        invoiceData.data?.cuit || '',             // CUIT
        invoiceData.data?.fecha || '',            // Fecha Doc
        invoiceData.data?.numeroFactura || '',    // Nro Comprobante
        invoiceData.data?.total || 0,             // Monto Total
        invoiceData.data?.iva || 0,               // IVA
      ]];

      console.log(`📝 Agregando fila a Sheet ${spreadsheetId}...`);

      // Agregar fila al Sheet
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Hoja1!A:H', // Rango donde escribir
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      console.log(`✅ Factura guardada en Sheet. Filas agregadas: ${response.data.updates?.updatedRows}`);
    } catch (error) {
      console.error('❌ Error escribiendo en Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Obtiene los datos del Sheet del usuario (para verificación)
   * @param spreadsheetId ID del Sheet del usuario
   */
  async getSheetData(spreadsheetId: string): Promise<any[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Hoja1!A:H',
      });

      return response.data.values || [];
    } catch (error) {
      console.error('❌ Error leyendo Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Obtiene información del Sheet (nombre, número de filas, etc.)
   * @param spreadsheetId ID del Sheet del usuario
   */
  async getSheetInfo(spreadsheetId: string): Promise<any> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      return response.data;
    } catch (error) {
      console.error('❌ Error obteniendo info del Sheet:', error);
      throw error;
    }
  }
}
