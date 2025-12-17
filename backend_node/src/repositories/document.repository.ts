import prisma from "@/db/client.js";
import { User } from "@/domain/user.js";
import { DocumentProcessingStatus } from "@/dtos/documento.dto";
import type { CreateUserDTO } from "@/dtos/user.dto.js";


/**
 * Repositorio para manejar operaciones de documentos
 */
export class DocumentRepository {

    /**
     * Actualiza el estado de un documento
     */
    async updateDocumentStatus(
        documentId: string,
        status: DocumentProcessingStatus,
        data?: {
            errorCode?: number;
            errorMessage?: string;
            retryCount?: number;
            extractionResult?: any;
            processedAt?: Date;
        }
    ) {
        return await prisma.documentProcessing.update({
            where: { id: documentId },
            data: {
                status,
                ...data,
            },
        });
    }


    /**
     * Busca un documento existente por message ID
     */
    async findExistingDocument(messageId: string) {
        return await prisma.documentProcessing.findUnique({
            where: { messageId },
        });
    }

    /**
     * Crea un registro de documento en la BD
     */
    async createDocumentRecord(data: {
        userId: string;
        phoneNumber: string;
        messageId: string;
        type: string;
        filename: string;
        mimeType: string;
        fileSize: number | undefined;
        kapsoMediaUrl: string | undefined;
    }) {
        return await prisma.documentProcessing.create({
            data: {
                userId: data.userId,
                phoneNumber: data.phoneNumber,
                messageId: data.messageId,
                type: data.type,
                filename: data.filename,
                mimeType: data.mimeType,
                fileSize: data.fileSize ?? null,
                kapsoMediaUrl: data.kapsoMediaUrl ?? null,
                status: DocumentProcessingStatus.PENDING,
                retryCount: 0,
            },
        });
    }

}