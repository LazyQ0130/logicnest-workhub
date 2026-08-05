import type { AccessClaims } from '../security.js';
import type { AdminRole } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessClaims;
    adminAuth?: {
      adminId: string;
      role: AdminRole;
      mustChangePassword: boolean;
      sessionId: string;
      csrfToken: string;
    };
    originAllowed?: boolean;
  }
}
