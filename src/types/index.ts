export enum UserRole {
    SUPERADMIN = 'SUPERADMIN',
    ADMIN = 'ADMIN',
    EMPLOYEE = 'EMPLOYEE',
}

export enum MachineType {
    CNC = 'CNC',
    LASER = 'LASER',
    CHAMPS = 'CHAMPS',
    PANNEAUX = 'PANNEAUX',
    SERVICE_MAINTENANCE = 'SERVICE_MAINTENANCE',
    VENTE_MATERIAU = 'VENTE_MATERIAU',
    PLIAGE = 'PLIAGE',
    CUSTOM = 'CUSTOM',
}

export enum DevisType {
    DEVIS = 'DEVIS',
    ENCAISSEMENT = 'ENCAISSEMENT',
}

export enum DevisStatus {
    DRAFT = 'DRAFT',
    VALIDATED = 'VALIDATED',
    INVOICED = 'INVOICED',
    CANCELLED = 'CANCELLED',
}

export interface UserPayload {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: UserRole;
}

export interface AuthResponse {
    user: {
        id: string;
        username: string;
        firstName: string;
        lastName: string;
        role: UserRole;
    };
    token: string;
}

export interface CreateUserDto {
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    allowedMachines?: MachineType[];
}

export interface CreateClientDto {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
}

export interface CreateDevisDto {
    clientId: string;
    notes?: string;
}

export interface AddDevisLineDto {
    machineType: MachineType;
    description?: string;
    minutes?: number;
    meters?: number;
    quantity?: number;
    materialId?: string;
    maintenanceMaterialId?: string;
    serviceId?: string;
    unitPrice?: number;
    width?: number;
    height?: number;
    dimensionUnit?: string;
}

export interface AddDevisServiceDto {
    serviceId: string;
}

export interface CalculationInput {
    machineType: MachineType;
    minutes?: number;
    meters?: number;
    quantity?: number;
    materialId?: string;
    maintenanceMaterialId?: string;
    serviceId?: string;
    unitPrice?: number;
    width?: number;
    height?: number;
    dimensionUnit?: string;
}

export interface CalculationResult {
    machineType: MachineType;
    unitPrice: number;
    materialCost: number;
    lineTotal: number;
    breakdown: string;
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

export interface CustomDevisItemDto {
    description: string;
    quantity: number;
    unitPrice: number;
}

export interface CreateCustomDevisDto {
    clientId: string;
    items: CustomDevisItemDto[];
    notes?: string;
}
export interface UpdateDevisFinanceDto {
    remise?: number;
    remiseType?: 'FIXED' | 'PERCENTAGE';
    timbreFiscal?: number;
}
