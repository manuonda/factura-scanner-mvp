/**
 * Entidad User - Representa un usuario
 * Lógica mínima de negocio
 *
 * NOTA: Todos los campos usan camelCase para alinearse con Prisma models
 */
export class User {
  constructor(
    public id: string,
    public phoneNumber: string,
    public userName: string | null,
    public companyName: string | null,
    public email: string | null,
    public planType: 'free' | 'pro' | 'enterprise',
    public status: 'active' | 'inactive' | 'banned',
    public emailVerified: boolean,
    public phoneVerified: boolean,
    public registrationComplete: boolean,
    public createdAt: Date,
    public updatedAt: Date,
    public lastActivity: Date,
    public preferences: Record<string, any> = {},
    public metadata: Record<string, any> = {},
    public googleSheetId: string | null = null,
    public googleSheetUrl: string | null = null,
    public sheetCreatedAt: Date | null = null
  ) {}

  // Métodos simples de lógica de negocio

  isActive(): boolean {
    return this.status === 'active';
  }

  isVerified(): boolean {
    return this.emailVerified && this.phoneVerified;
  }

  canProcess(): boolean {
    return this.isActive() && this.registrationComplete;
  }

  updateLastActivity(): void {
    this.lastActivity = new Date();
  }

  /**
   * Factory method para crear desde datos raw (Prisma)
   * Ya Prisma devuelve camelCase, no necesita doble mapeo
   */
  static create(data: any): User {
    return new User(
      data.id,
      data.phoneNumber,
      data.userName,
      data.companyName,
      data.email,
      data.planType,
      data.status,
      data.emailVerified,
      data.phoneVerified,
      data.registrationComplete,
      data.createdAt,
      data.updatedAt,
      data.lastActivity,
      data.preferences || {},
      data.metadata || {},
      data.googleSheetId,
      data.googleSheetUrl,
      data.sheetCreatedAt
    );
  }
}
