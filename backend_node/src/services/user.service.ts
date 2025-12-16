import type { CreateUserDTO } from "@/dtos/user.dto.js";
import type { UserRepository } from "@/repositories/user.repository.js";
import type { User } from "@/domain/user.js";

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
    constructor(private userRepository: UserRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Obtiene el siguiente paso del registro según qué información falta
     */
    private getNextRegistrationStep(user: User): RegistrationStep {
        console.log(`   🔍 DEBUG getNextRegistrationStep - name: "${user.name}", company: "${user.company_name}", email: "${user.email}"`);

        if (!user.name || user.name.trim() === '') return 'awaiting_name';
        if (!user.company_name || user.company_name.trim() === '') return 'awaiting_company';
        if (!user.email || user.email.trim() === '') return 'awaiting_email';
        return 'complete';
    }

    /**
     * Valida el formato de un email
     */
    private validateEmail(email: string): { valid: boolean; error?: string } {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email || email.trim() === '') {
            return { valid: false, error: 'El email no puede estar vacío' };
        }

        if (!emailRegex.test(email.trim())) {
            return {
                valid: false,
                error: '❌ Ese no parece un email válido.\n\nIntenta de nuevo (Ej: juan@empresa.com)'
            };
        }

        return { valid: true };
    }

    /**
     * Genera el mensaje para el paso actual del registro
     * Los mensajes están optimizados para ser claros, personales y menos robóticos
     */
    private getRegistrationMessage(step: RegistrationStep, userName?: string): string {
        const messages: Record<RegistrationStep, string> = {
            awaiting_name:
                '👋 ¡Hola! Soy el asistente de *Factura Scanner*.\n\n' +
                'Para comenzar a procesar tus facturas, necesito unos datos rápidos:\n\n' +
                '1️⃣ *¿Cuál es tu nombre completo?*',

            awaiting_company:
                `2️⃣ ¡Genial, ${userName || 'amigo'}! ¿Cuál es el *nombre de tu empresa*?\n\n` +
                'Lo usaremos para clasificar tus documentos.\n' +
                '(Ej: Mi Empresa S.A.)',

            awaiting_email:
                '3️⃣ Por último, ¿me indicas tu *correo electrónico*?\n\n' +
                'Aquí te enviaremos el enlace a tu planilla de Excel con los datos extraídos.\n' +
                '(Ej: tu@email.com)',

            complete:
                '🎉 *¡Registro Completado!*\n\n' +
                `¡Bienvenido ${userName || 'a Factura Scanner'}! 🚀\n\n` +
                'Ahora puedes enviarme una *foto* o *PDF* de tus facturas y las procesaré automáticamente. 📸\n\n' +
                '_Los datos se guardarán en tu planilla de Google Sheets_'
        };
        return messages[step];
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
                message: this.getRegistrationMessage(nextStep, user.name || undefined)
            };
        }

        // 3. Usuario existe - verificar si está completo
        console.log('   → Usuario existente encontrado');

        if (!user.canProcess()) {
            console.log('   → Registro incompleto, pidiendo información');
            const nextStep = this.getNextRegistrationStep(user);
            return {
                state: 'INCOMPLETE',
                user: user,
                nextStep: nextStep,
                message: this.getRegistrationMessage(nextStep, user.name || undefined)
            };
        }

        // 4. Usuario listo para procesar facturas
        console.log('   → Usuario listo para procesar');
        return {
            state: 'READY',
            user: user,
            nextStep: 'complete',
            message: this.getRegistrationMessage('complete', user.name || undefined)
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
                user.name = textMessage.trim();
                console.log(`   → Nombre guardado: ${user.name}`);
                break;

            case 'awaiting_company':
                user.company_name = textMessage.trim();
                console.log(`   → Empresa guardada: ${user.company_name}`);
                break;

            case 'awaiting_email':
                // Validar email ANTES de guardar
                const emailValidation = this.validateEmail(textMessage);
                if (!emailValidation.valid) {
                    console.log(`   ❌ Email inválido: ${textMessage}`);
                    // Retorna el paso actual sin avanzar
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
                console.log('   → Registro ya completo');
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
            userName: user.name || '',
            companyName: user.company_name || '',
            email: user.email || ''
        };

        // Si completó todos los datos, marcar como completo
        if (nextStep === 'complete') {
            updateData.registrationComplete = true;
            console.log('   → Registro completado!');
        }

        // Guardar cambios en la BD
        const updatedUser = await this.userRepository.updateByPhoneNumber(phoneNumber, updateData);
        console.log('   → Datos guardados en la BD');

        return {
            user: updatedUser,
            nextStep: nextStep,
            message: this.getRegistrationMessage(nextStep, updatedUser.name || undefined)
        };
    }
} 