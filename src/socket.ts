import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { UserPayload } from './types';

let ioInstance: Server | null = null;

export function setupSocketIO(io: Server) {
    ioInstance = io;

    // Authentication middleware for Socket.IO
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret) as UserPayload;
            socket.data.user = decoded;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: Socket) => {
        const user = socket.data.user as UserPayload;
        console.log(`🔌 User connected: ${user.firstName} ${user.lastName} (${user.role})`);

        // Join admin room if user is admin
        if (user.role === 'ADMIN') {
            socket.join('admins');
            console.log(`👑 Admin joined admins room: ${user.firstName}`);
        }

        // Join user-specific room
        socket.join(`user:${user.id}`);

        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${user.firstName} ${user.lastName}`);
        });
    });

    console.log('🔌 Socket.IO initialized');
}

export function getIO(): Server | null {
    return ioInstance;
}

export function emitToAdmins(event: string, data: unknown) {
    if (ioInstance) {
        ioInstance.to('admins').emit(event, data);
    }
}

export function emitToUser(userId: string, event: string, data: unknown) {
    if (ioInstance) {
        ioInstance.to(`user:${userId}`).emit(event, data);
    }
}
