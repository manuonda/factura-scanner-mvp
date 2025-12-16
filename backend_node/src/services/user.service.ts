import type { CreateUserDTO } from "@/dtos/user.dto.js";
import type { UserRepository } from "@/repositories/user.repository.js";
import { logger } from "hono/logger";

export class UserService {
    constructor(private userRepository: UserRepository) {
        this.userRepository = userRepository;
    }

    async procesarUsuario()
    async getOrCreateUser(phoneNumber: string): Promise<{ isNew: boolean; user: any; message: string }> {

        console.log('UserService - getOrCreateUser - phoneNumber:', phoneNumber);
        let userByPhoneNumber = await this.userRepository.findByPhoneNumber(phoneNumber);
        let isNew = false;
        const userDTO: CreateUserDTO = {
            phoneNumber: phoneNumber,
            userName: '',
            companyName: '',
            email: '',
            planType: 'free'
        };
        if(!userByPhoneNumber){
            isNew = true;
            userByPhoneNumber = await this.userRepository.create(userDTO);
            console.log('Usuario creado:', userByPhoneNumber);
        }

        return {
            isNew,
            user: userByPhoneNumber,
            message: isNew ? 'Usuario creado' : 'Usuario encontrado'
        };
    }

    // async updateUserName(phoneNumber: string, nameUser: string): Promise<any> {
    //     console.log('UserService - updateUserName - phoneNumber:', phoneNumber, 'nameUser:', nameUser);
    //     const updatedUser = await this.userRepository.updateByPhoneNumber(phoneNumber, { nameUser });
    //     return updatedUser;
    // }
} 