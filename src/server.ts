import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import routes from './routes';
import { machineService } from './services/machine.service';
import { errorHandler, notFoundHandler } from './middleware';
import { setupSocketIO } from './socket';

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
    cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

setupSocketIO(io);

// Make io available in request handlers
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors({
    origin: '*',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
httpServer.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port}`);
    console.log(`📝 Environment: ${config.env}`);
    console.log(`🔗 CORS origins: ${config.cors.origin.join(', ')}`);

    // Initialize default machine pricing
    machineService.initializeDefaultPricing()
        .then(() => console.log('✅ Default machine pricing initialized'))
        .catch(err => console.error('❌ Failed to initialize machine pricing:', err));
});

export { app, io };
