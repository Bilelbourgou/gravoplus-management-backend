import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserPayload } from '../types';

interface AuthenticatedSocket extends Socket {
    user?: UserPayload;
}

export const setupSocketIO = (io: Server) => {
    // Authentication middleware
    io.use((socket: AuthenticatedSocket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret) as UserPayload;
            socket.user = decoded;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        console.log(`User connected: ${socket.user?.username} (${socket.id})`);

        // Join user's own room
        socket.join(`user:${socket.user?.id}`);

        // Admin joins admin room
        if (socket.user?.role === 'ADMIN') {
            socket.join('admins');
        }

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user?.username} (${socket.id})`);
        });
    });

    return io;
};

// Helper functions for emitting events
export const emitToAdmins = (io: Server, event: string, data: unknown) => {
    io.to('admins').emit(event, data);
};

export const emitToUser = (io: Server, userId: string, event: string, data: unknown) => {
    io.to(`user:${userId}`).emit(event, data);
};

export const emitToAll = (io: Server, event: string, data: unknown) => {
    io.emit(event, data);
};

// Event types
export const SOCKET_EVENTS = {
    DEVIS_CREATED: 'devis:created',
    DEVIS_UPDATED: 'devis:updated',
    DEVIS_VALIDATED: 'devis:validated',
    INVOICE_CREATED: 'invoice:created',
    CLIENT_CREATED: 'client:created',
    CLIENT_UPDATED: 'client:updated',
};
