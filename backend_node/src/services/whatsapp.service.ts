import type { UserService } from "./user.service";



export class WhatsAppService {
    constructor(private userService: UserService) {}

    async sendMessage(to: string, message: string) {
        // Lógica para enviar un mensaje de WhatsApp
        console.log(`Enviando mensaje a ${to}: ${message}`);
    }
}