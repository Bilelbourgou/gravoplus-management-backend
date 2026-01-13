import dotenv from 'dotenv';

dotenv.config();

export const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),

    database: {
        url: process.env.DATABASE_URL || '',
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:8081', 'http://127.0.0.1:46447'],
    },
};
