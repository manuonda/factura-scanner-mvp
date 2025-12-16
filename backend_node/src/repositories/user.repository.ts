import prisma from "@/db/client.js";
import { User } from "@/domain/user.js";
import type { CreateUserDTO } from "@/dtos/user.dto.js";

export class UserRepository {


    async findByPhoneNumber(phoneNumber: string) {
       try {
           const data = await prisma.user.findUnique({
               where: { phoneNumber: phoneNumber }
           });
           return data ? User.create(data)  : null;
       }catch(error) {
          console.error('Error buscando usuario por phone : ', error); 
          throw error;
       }
    }

    async create(dto: CreateUserDTO): Promise<User> {
        try { 
            const data = await prisma.user.create({
                data: { 
                    // Mapeamos el DTO a las propiedades del modelo Prisma
                    phoneNumber: dto.phoneNumber,
                    userName: dto.userName,
                    companyName: dto.companyName,
                    email: dto.email,
                    planType: dto.planType || 'free',

                    // Valores por defecto o iniciales
                    status: 'active',
                    registrationComplete: false,
                    phoneVerified: true, // Asumimos verificado por WhatsApp
                    
                    // JSON fields
                    preferences: {},
                    metadata: {}
                }
            });
            
            return User.create(data);
        }catch(error) {
            console.error('Error creando usuario: ', error);
            throw error;
        }
    }

}