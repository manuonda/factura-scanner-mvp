
/**
 * DTO para crear usuario
 * Lo que recibe el servicio desde el controlador
 */
export interface CreateUserDTO {
    phoneNumber: string;
    name?: string;
    companyName?: string;
    email?: string;
    planType?: 'free' | 'pro' | 'enterprise';
    userName?: string;
}



