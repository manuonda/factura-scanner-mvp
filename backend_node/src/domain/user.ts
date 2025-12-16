 /**
   * Entidad User - Representa un usuario
   * Lógica mínima de negocio
   */

  export class User {
    constructor(
      public id: string,
      public phone_number: string,
      public name: string | null,
      public company_name: string | null,
      public email: string | null,
      public plan_type: 'free' | 'pro' | 'enterprise',
      public status: 'active' | 'inactive' | 'banned',
      public email_verified: boolean,
      public phone_verified: boolean,
      public registration_complete: boolean,
      public created_at: Date,
      public updated_at: Date,
      public last_activity: Date,
      public preferences: Record<string, any> = {},
      public metadata: Record<string, any> = {}
    ) {}

    // Métodos simples de lógica de negocio

    isActive(): boolean {
      return this.status === 'active';
    }

    isVerified(): boolean {
      return this.email_verified && this.phone_verified;
    }

    canProcess(): boolean {
      return this.isActive() && this.registration_complete;
    }

    updateLastActivity(): void {
      this.last_activity = new Date();
    }

    // Factory method para crear desde datos raw
    static create(data: any): User {
      return new User(
        data.id,
        data.phoneNumber || data.phone_number,
        data.userName || data.user_name,        // Prisma devuelve userName, BD tiene user_name
        data.companyName || data.company_name,
        data.email,
        data.planType || data.plan_type,
        data.status,
        data.emailVerified || data.email_verified,
        data.phoneVerified || data.phone_verified,
        data.registrationComplete || data.registration_complete,
        data.createdAt || data.created_at,
        data.updatedAt || data.updated_at,
        data.lastActivity || data.last_activity,
        data.preferences,
        data.metadata
      );
    }
  }
