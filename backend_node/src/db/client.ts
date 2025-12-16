/**
   * src/db/client.ts
   * 
   * Prisma Client Singleton
   * Evita múltiples instancias en desarrollo (hot reload)
   * Graceful shutdown en producción
   */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

  const isDevelopment = process.env.NODE_ENV !== 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const adapter = new PrismaPg({ 
  connectionString: process.env.DATABASE_URL 
});

  // Configurar logging según entorno
  const logConfig = isDevelopment
    ? ['query', 'info', 'warn', 'error'] as const
    : ['error'] as const;

  // Declaración global para evitar múltiples instancias en hot reload
  declare global {
    // eslint-disable-next-line no-var
    var prismaGlobal: PrismaClient | undefined;
  }

  // Crear o reutilizar instancia existente
  const prisma = global.prismaGlobal || new PrismaClient({ adapter });

  // En desarrollo, guardar instancia global
  if (isDevelopment && !isTest) {
    global.prismaGlobal = prisma;
  }

  // Graceful shutdown handlers
  const shutdownHandlers = async () => {
    console.log('🔌 Desconectando Prisma Client...');
    await prisma.$disconnect();
    console.log('✅ Prisma Client desconectado');
  };

  process.on('SIGINT', shutdownHandlers);
  process.on('SIGTERM', shutdownHandlers);

  export default prisma;