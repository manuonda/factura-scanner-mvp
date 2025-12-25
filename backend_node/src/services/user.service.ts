import type { CreateUserDTO } from "@/dtos/user.dto.js";
import type { UserRepository } from "@/repositories/user.repository.js";
import type { User } from "@/domain/user.js";
import { GoogleDriveService } from "./google-drive.service.js";
import { REGISTRATION_MESSAGES } from "@/constants/messages.js";

// Estados del flujo de usuario
export type RegistrationState = 'NEW' | 'INCOMPLETE' | 'READY';

// Pasos del registro
export type RegistrationStep = 'awaiting_name' | 'awaiting_company' | 'awaiting_email' | 'complete';

// Resultado del procesamiento
export interface UserProcessingResult {
    state: RegistrationState;
    user: User;
    message: string;
    nextStep?: RegistrationStep;
}

export class UserService {
    private googleDriveService: GoogleDriveService;

    constructor(private userRepository: UserRepository) {
        this.googleDriveService = new GoogleDriveService();
    }

    /**
     * Obtiene el siguiente paso del registro según qué información falta
     */
    private getNextRegistrationStep(user: User): RegistrationStep {
        console.log(`   🔍 DEBUG getNextRegistrationStep - userName: "${user.userName}", company: "${user.companyName}", email: "${user.email}"`);

        if (!user.userName || user.userName.trim() === '') return 'awaiting_name';
        if (!user.companyName || user.companyName.trim() === '') return 'awaiting_company';
        if (!user.email || user.email.trim() === '') return 'awaiting_email';
        return 'complete';
    }

    /**
     * Valida el formato de un email
     */
    private validateEmail(email: string): { valid: boolean; error?: string } {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email || email.trim() === '') {
            console.log("El email no puede estar vacio");
            return { valid: false, error: 'El email no puede estar vacío' };
        }

        if (!emailRegex.test(email.trim())) {
            return {
                valid: false,
                error: REGISTRATION_MESSAGES.EMAIL_INVALID
            };
        }

        return { valid: true };
    }

    /**
     * Genera el mensaje para el paso actual del registro
     * Los mensajes están centralizados en constants/messages.ts
     */
    private getRegistrationMessage(step: RegistrationStep, userName?: string): string {
        switch (step) {
            case 'awaiting_name':
                return REGISTRATION_MESSAGES.AWAITING_NAME;
            case 'awaiting_company':
                return REGISTRATION_MESSAGES.AWAITING_COMPANY(userName || 'amigo');
            case 'awaiting_email':
                return REGISTRATION_MESSAGES.AWAITING_EMAIL;
            case 'complete':
                return REGISTRATION_MESSAGES.COMPLETE(userName || 'a Factura Scanner');
        }
    }

    /**
     * Procesa el usuario y determina qué acción tomar
     * Retorna el estado y el mensaje apropiado para WhatsApp
     */
    async procesarUsuario(phoneNumber: string): Promise<UserProcessingResult> {
        console.log('UserService - procesarUsuario - phoneNumber:', phoneNumber);

        // 1. Buscar usuario existente
        let user = await this.userRepository.findByPhoneNumber(phoneNumber);

        // 2. Si no existe, crear usuario nuevo
        if (!user) {
            console.log('   → Usuario nuevo, creando...');
            const userDTO: CreateUserDTO = {
                phoneNumber: phoneNumber,
                userName: '',
                companyName: '',
                email: '',
                planType: 'free'
            };
            user = await this.userRepository.create(userDTO);

            const nextStep = this.getNextRegistrationStep(user);
            return {
                state: 'NEW',
                user: user,
                nextStep: nextStep,
                message: this.getRegistrationMessage(nextStep, user.userName || undefined)
            };
        }

        // 3. Usuario existe - verificar si está completo
        console.log('   → Usuario existente encontrado');

        if (!user.canProcess()) {
            console.log('   → Registro incompleto, pidiendo información');
            const nextStep = this.getNextRegistrationStep(user);
            console.log("Next step es:", nextStep);
            return {
                state: 'INCOMPLETE',
                user: user,
                nextStep: nextStep,
                message: this.getRegistrationMessage(nextStep, user.userName || undefined)
            };
        }
        console.log('   → Usuario con registro completo', user);
        if (!user.googleSheetId) {
            console.log('   → Usuario completo pero falta Google Sheet, creando...');
            const sheetResult = await this.onRegistrationComplete(phoneNumber);

            // Recargamos el usuario para devolverlo con el ID del sheet actualizado
            const updatedUser = await this.userRepository.findByPhoneNumber(phoneNumber);

            // TODO enviar email con el link al sheet
            //this.emailService.sendRegistrationEmail(user.email, sheetResult.sheetUrl);

            return {
                state: 'READY',
                user: updatedUser || user,
                message: sheetResult.message,
                nextStep: 'complete'
            };
        }

        // 4. Usuario listo para procesar facturas
        console.log('   → Usuario listo para procesar');
        return {
            state: 'READY',
            user: user,
            nextStep: 'complete',
            message: this.getRegistrationMessage('complete', user.userName || undefined)
        };
    }

    /**
     * Procesa la información enviada por el usuario durante el registro
     * @param phoneNumber - Número del usuario
     * @param textMessage - Texto recibido del usuario
     * @returns Usuario actualizado y siguiente paso
     */
    async processRegistrationData(phoneNumber: string, textMessage: string): Promise<{
        user: User;
        nextStep: RegistrationStep;
        message: string;
    }> {
        console.log(`UserService - processRegistrationData - phoneNumber: ${phoneNumber}, text: ${textMessage}`);

        let user = await this.userRepository.findByPhoneNumber(phoneNumber);
        if (!user) throw new Error('Usuario no encontrado');

        // Determinar qué paso sigue
        const currentStep = this.getNextRegistrationStep(user);
        console.log(`   → Paso actual: ${currentStep}`);

        // Procesar según el paso
        switch (currentStep) {
            case 'awaiting_name':
                user.userName = textMessage.trim();
                console.log(`   ✅ Nombre guardado: ${user.userName}`);
                break;

            case 'awaiting_company':
                user.companyName = textMessage.trim();
                console.log(`   ✅ Empresa guardada: ${user.companyName}`);
                break;

            case 'awaiting_email':
                // Validar email ANTES de guardar
                const emailValidation = this.validateEmail(textMessage);
                if (!emailValidation.valid) {
                    console.log(`   ❌ Email inválido: ${textMessage}`);
                    console.log(`   📌 Razón: ${emailValidation.error}`);
                    // Retorna el paso actual sin avanzar ni guardar cambios
                    return {
                        user: user,
                        nextStep: currentStep,
                        message: emailValidation.error || 'Email inválido. Intenta de nuevo.'
                    };
                }
                user.email = textMessage.trim();
                console.log(`   ✅ Email guardado: ${user.email}`);
                break;

            case 'complete':
                console.log('   → Registro ya completo, ignorando input');
                break;
        }

        // Obtener el siguiente paso
        const nextStep = this.getNextRegistrationStep(user);

        // Preparar datos para actualizar
        const updateData: Partial<{
            userName: string;
            companyName: string;
            email: string;
            registrationComplete: boolean;
        }> = {
            userName: user.userName || '',
            companyName: user.companyName || '',
            email: user.email || ''
        };

        // Si completó todos los datos, marcar como completo
        if (nextStep === 'complete') {
            updateData.registrationComplete = true;
            console.log('   ✅ Registro completado!');
        }

        // Guardar cambios en la BD
        const updatedUser = await this.userRepository.updateByPhoneNumber(phoneNumber, updateData);
        console.log(`   ✅ Datos guardados en la BD (paso: ${nextStep})`);

        return {
            user: updatedUser,
            nextStep: nextStep,
            message: this.getRegistrationMessage(nextStep, updatedUser.userName || undefined)
        };
    }

    /**
     * Crea el Google Sheet personal del usuario cuando completa el registro
     * @param phoneNumber - Número del usuario
     * @returns Link a su Google Sheet personal
     */
    async onRegistrationComplete(phoneNumber: string): Promise<{
        message: string;
        sheetUrl: string;
    }> {
        try {
            console.log(`📊 Creando Google Sheet para usuario: ${phoneNumber}`);

            // 1. Obtener usuario
            const user = await this.userRepository.findByPhoneNumber(phoneNumber);
            if (!user) throw new Error('Usuario no encontrado');

            if (!user.email) throw new Error('Usuario no tiene email');

            // 2. Crear Sheet en Google Drive
            console.log(`🔄 Creando copia de plantilla para ${user.userName}...`);
            const { spreadsheetId, webViewLink } = await this.googleDriveService.createUserSheet(
                user.userName || 'Usuario',
                user.email
            );

            // 3. Guardar IDs en la BD
            await this.userRepository.updateByPhoneNumber(phoneNumber, {
                googleSheetId: spreadsheetId,
                googleSheetUrl: webViewLink
            });
            console.log(`✅ Sheet creado y guardado en BD: ${spreadsheetId}`);

            // 4. Retornar mensaje con el link
            const message = REGISTRATION_MESSAGES.SHEET_CREATED(webViewLink);

            return {
                message,
                sheetUrl: webViewLink
            };
        } catch (error) {
            console.error('❌ Error creando Google Sheet:', error);
            throw error;
        }
    }
} 