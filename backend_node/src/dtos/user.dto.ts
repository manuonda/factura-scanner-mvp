
/**
 * DTO para crear usuario
 * Lo que recibe el servicio desde el controlador
 */
export interface CreateUserDTO {
    phoneNumber: string;
    userName?: string;
    companyName?: string;
    email?: string;
    planType?: 'free' | 'pro' | 'enterprise';
}



