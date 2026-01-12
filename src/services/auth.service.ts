import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config';
import { AuthResponse, CreateUserDto, UserPayload, UserRole, MachineType } from '../types';
import { ApiError } from '../middleware';

export class AuthService {
    /**
     * Login user with username and password
     */
    async login(username: string, password: string): Promise<AuthResponse> {
        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (!user || !user.isActive) {
            throw new ApiError(401, 'Invalid credentials');
        }

        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            throw new ApiError(401, 'Invalid credentials');
        }

        const payload: UserPayload = {
            id: user.id,
            username: user.username,
            role: user.role as UserRole,
        };

        const token = jwt.sign(payload, config.jwt.secret, {
            expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
        });

        return {
            user: {
                id: user.id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role as UserRole,
            },
            token,
        };
    }

    /**
     * Get current user info
     */
    async getCurrentUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                allowedMachines: true,
            },
        });

        if (!user || !user.isActive) {
            throw new ApiError(404, 'User not found');
        }

        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Create a new user (Admin only)
     */
    async createUser(data: CreateUserDto) {
        const existingUser = await prisma.user.findUnique({
            where: { username: data.username },
        });

        if (existingUser) {
            throw new ApiError(400, 'Username already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, 12);

        const user = await prisma.user.create({
            data: {
                username: data.username,
                password: hashedPassword,
                firstName: data.firstName,
                lastName: data.lastName,
                role: data.role || UserRole.EMPLOYEE,
                allowedMachines: data.allowedMachines ? {
                    create: data.allowedMachines.map((machine) => ({ machine })),
                } : undefined,
            },
            include: {
                allowedMachines: true,
            },
        });

        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Update user
     */
    async updateUser(
        userId: string,
        data: Partial<Omit<CreateUserDto, 'password'>> & { password?: string }
    ) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        const updateData: Record<string, unknown> = {};

        if (data.firstName) updateData.firstName = data.firstName;
        if (data.lastName) updateData.lastName = data.lastName;
        if (data.role) updateData.role = data.role;
        if (data.password) {
            updateData.password = await bcrypt.hash(data.password, 12);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                allowedMachines: true,
            },
        });

        const { password: _, ...userWithoutPassword } = updatedUser;
        return userWithoutPassword;
    }

    /**
     * Assign machines to user
     */
    async assignMachines(userId: string, machines: MachineType[]) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        // Delete existing machine assignments
        await prisma.userMachine.deleteMany({
            where: { userId },
        });

        // Create new assignments
        if (machines.length > 0) {
            await prisma.userMachine.createMany({
                data: machines.map((machine) => ({
                    userId,
                    machine,
                })),
            });
        }

        return prisma.user.findUnique({
            where: { id: userId },
            include: { allowedMachines: true },
        });
    }

    /**
     * Get all users
     */
    async getAllUsers() {
        const users = await prisma.user.findMany({
            include: {
                allowedMachines: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return users.map(({ password: _, ...user }) => user);
    }

    /**
     * Deactivate user
     */
    async deactivateUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        await prisma.user.update({
            where: { id: userId },
            data: { isActive: false },
        });

        return { message: 'User deactivated successfully' };
    }
}

export const authService = new AuthService();
