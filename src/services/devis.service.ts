
import path from 'path';
import prisma from '../config/database';
import { CreateDevisDto, AddDevisLineDto, AddDevisServiceDto, DevisStatus, DevisType, UserRole, CreateCustomDevisDto, MachineType } from '../types';
import { ApiError } from '../middleware';
import { calculationService } from './calculation.service';
import { notificationService } from './notification.service';
import { paymentService } from './payment.service';

export class DevisService {
    /**
     * Generate unique devis reference
     */
    private async generateReference(prefix: string = 'DEV'): Promise<string> {
        const year = new Date().getFullYear();
        const lastDevis = await prisma.devis.findFirst({
            where: {
                reference: {
                    startsWith: `${prefix}-${year}`,
                },
            },
            orderBy: {
                reference: 'desc',
            },
        });

        let number = 1;
        if (lastDevis) {
            const parts = lastDevis.reference.split('-');
            if (parts.length === 3) {
                const lastNum = parseInt(parts[2], 10);
                if (!isNaN(lastNum)) {
                    number = lastNum + 1;
                }
            }
        }

        return `${prefix}-${year}-${number.toString().padStart(4, '0')}`;
    }

    /**
     * Get all devis (filtered by role)
     */
    async getAllDevis(userId: string, role: UserRole, filters?: {
        clientId?: string;
        status?: DevisStatus;
        type?: DevisType;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const where: Record<string, unknown> = {};

        // Employees can only see their own devis
        if (role === UserRole.EMPLOYEE) {
            where.createdById = userId;
        } else if (role === UserRole.ADMIN) {
            // Admin should not see devis created by superadmin
            where.createdBy = { role: { not: UserRole.SUPERADMIN } };
        }

        if (filters?.clientId) {
            where.clientId = filters.clientId;
        }

        if (filters?.status) {
            where.status = filters.status;
        }

        if (filters?.type) {
            where.type = filters.type;
        }

        if (filters?.dateFrom || filters?.dateTo) {
            where.createdAt = {};
            if (filters?.dateFrom) {
                (where.createdAt as Record<string, Date>).gte = filters.dateFrom;
            }
            if (filters?.dateTo) {
                (where.createdAt as Record<string, Date>).lte = filters.dateTo;
            }
        }

        return prisma.devis.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                client: {
                    select: { id: true, name: true, phone: true },
                },
                createdBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
                invoice: true,
                _count: {
                    select: { lines: true, services: true },
                },
            },
        });
    }

    /**
     * Get devis by ID with full details
     */
    async getDevisById(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: {
                client: true,
                createdBy: {
                    select: { id: true, firstName: true, lastName: true, username: true },
                },
                lines: {
                    include: {
                        material: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
                services: {
                    include: { service: true },
                },
                invoice: true,
            },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        return devis;
    }

    /**
     * Create new devis
     */
    async createDevis(userId: string, data: CreateDevisDto) {
        // Verify client exists
        const client = await prisma.client.findUnique({
            where: { id: data.clientId },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError(401, 'User session expired. Please log in again.');
        }

        const reference = await this.generateReference('DEV');

        const devis = await prisma.devis.create({
            data: {
                reference,
                type: DevisType.DEVIS,
                clientId: data.clientId,
                createdById: userId,
                notes: data.notes,
            },
            include: {
                client: true,
                createdBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });

        // Create notification
        await notificationService.create({
            type: 'DEVIS_CREATED',
            title: 'Nouveau devis',
            message: `Devis ${devis.reference} créé pour ${client.name}`,
            entityType: 'devis',
            entityId: devis.id,
            triggeredById: userId,
        });

        return devis;
    }

    /**
     * Create new encaissement (Admin/Employee)
     */
    async createEncaissement(userId: string, data: CreateDevisDto) {
        // Verify client exists
        const client = await prisma.client.findUnique({
            where: { id: data.clientId },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError(401, 'User session expired. Please log in again.');
        }

        const reference = await this.generateReference('ENC');

        const encaissement = await prisma.devis.create({
            data: {
                reference,
                type: DevisType.ENCAISSEMENT,
                clientId: data.clientId,
                createdById: userId,
                notes: data.notes,
                timbreFiscal: 0,
            },
            include: {
                client: true,
                createdBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });

        return encaissement;
    }

    /**
     * Finalize encaissement: validate + auto-create full payment
     */
    async finalizeEncaissement(encaissementId: string, userId: string, paymentMethod?: string) {
        const encaissement = await prisma.devis.findUnique({
            where: { id: encaissementId },
            include: { lines: true, client: true },
        });

        if (!encaissement) {
            throw new ApiError(404, 'Encaissement not found');
        }

        if (encaissement.type !== DevisType.ENCAISSEMENT) {
            throw new ApiError(400, 'This is not an encaissement');
        }

        if (encaissement.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Encaissement is not in draft status');
        }

        if (encaissement.lines.length === 0) {
            throw new ApiError(400, 'Cannot finalize an empty encaissement');
        }

        const totalAmount = Number(encaissement.totalAmount);

        // Validate the encaissement
        const updated = await prisma.devis.update({
            where: { id: encaissementId },
            data: {
                status: DevisStatus.VALIDATED,
                validatedAt: new Date(),
            },
            include: { client: true },
        });

        // Create notification
        await notificationService.create({
            type: 'DEVIS_VALIDATED',
            title: 'Nouvel encaissement',
            message: `Encaissement ${encaissement.reference} finalisé pour ${encaissement.client.name} - ${totalAmount.toFixed(3)} TND`,
            entityType: 'devis',
            entityId: encaissementId,
            triggeredById: userId,
        });

        return updated;
    }

    /**
     * Create custom devis with multiple items (Admin only)
     */
    async createCustomDevis(userId: string, data: CreateCustomDevisDto) {
        // Verify client exists
        const client = await prisma.client.findUnique({
            where: { id: data.clientId },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError(401, 'User session expired. Please log in again.');
        }

        if (data.items.length === 0) {
            throw new ApiError(400, 'At least one item is required');
        }

        const reference = await this.generateReference();

        // Calculate total amount
        let totalAmount = 0;
        const linesData = data.items.map(item => {
            const lineTotal = item.quantity * item.unitPrice;
            totalAmount += lineTotal;
            return {
                machineType: MachineType.CUSTOM,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                materialCost: 0,
                lineTotal,
            };
        });

        // Create devis with all lines in a transaction
        const devis = await prisma.$transaction(async (tx) => {
            const newDevis = await tx.devis.create({
                data: {
                    reference,
                    clientId: data.clientId,
                    createdById: userId,
                    notes: data.notes,
                    totalAmount,
                },
            });

            // Create all lines
            await tx.devisLine.createMany({
                data: linesData.map(line => ({
                    ...line,
                    devisId: newDevis.id,
                })),
            });

            return tx.devis.findUnique({
                where: { id: newDevis.id },
                include: {
                    client: true,
                    createdBy: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                    lines: true,
                },
            });
        });

        // Create notification
        await notificationService.create({
            type: 'DEVIS_CREATED',
            title: 'Nouveau devis personnalisé',
            message: `Devis ${reference} créé pour ${client.name}`,
            entityType: 'devis',
            entityId: devis!.id,
            triggeredById: userId,
        });

        return devis;
    }

    /**
     * Add line to devis
     */
    async addLine(devisId: string, userId: string, role: UserRole, data: AddDevisLineDto) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        // Check if employee is authorized to use this machine
        if (role === UserRole.EMPLOYEE) {
            const authorized = await prisma.userMachine.findFirst({
                where: {
                    userId,
                    machine: data.machineType,
                },
            });

            if (!authorized) {
                throw new ApiError(403, 'You are not authorized to use this machine');
            }
        }

        // Calculate line
        const calculation = await calculationService.calculateLine({
            machineType: data.machineType,
            minutes: data.minutes,
            meters: data.meters,
            quantity: data.quantity,
            materialId: data.materialId,
            maintenanceMaterialId: data.maintenanceMaterialId,
            serviceId: data.serviceId,
            unitPrice: data.unitPrice,
            width: data.width,
            height: data.height,
            dimensionUnit: data.dimensionUnit,
            materialMeters: data.materialMeters,
        });

        const line = await prisma.devisLine.create({
            data: {
                devisId,
                machineType: data.machineType,
                description: data.description,
                minutes: data.minutes ?? null,
                meters: data.meters ?? null,
                quantity: data.quantity,
                unitPrice: calculation.unitPrice,
                materialCost: calculation.materialCost,
                lineTotal: calculation.lineTotal,
                materialId: data.materialId,
                maintenanceMaterialId: data.maintenanceMaterialId,
                width: data.width ?? null,
                height: data.height ?? null,
                dimensionUnit: data.dimensionUnit ?? 'm',
                materialMeters: data.materialMeters ?? null,
            },
            include: {
                material: true,
                maintenanceMaterial: true,
            },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return {
            line,
            calculation,
        };
    }

    /**
     * Remove line from devis
     */
    async removeLine(devisId: string, lineId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        await prisma.devisLine.delete({
            where: { id: lineId, devisId },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return { message: 'Line removed successfully' };
    }

    /**
     * Add fixed service to devis
     */
    async addService(devisId: string, data: AddDevisServiceDto) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        // Get service price
        const service = await prisma.fixedService.findUnique({
            where: { id: data.serviceId },
        });

        if (!service || !service.isActive) {
            throw new ApiError(404, 'Service not found');
        }

        // Check if service already added
        const existing = await prisma.devisService.findFirst({
            where: { devisId, serviceId: data.serviceId },
        });

        if (existing) {
            throw new ApiError(400, 'Service already added to this devis');
        }

        const devisService = await prisma.devisService.create({
            data: {
                devisId,
                serviceId: data.serviceId,
                price: service.price,
            },
            include: { service: true },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return devisService;
    }

    /**
     * Remove service from devis
     */
    async removeService(devisId: string, devisServiceId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        await prisma.devisService.delete({
            where: { id: devisServiceId, devisId },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return { message: 'Service removed successfully' };
    }

    /**
     * Update acompte on a devis (SuperAdmin only, DRAFT only)
     */
    async updateAcompte(devisId: string, acompte: number) {
        const devis = await prisma.devis.findUnique({ where: { id: devisId } });
        if (!devis) throw new ApiError(404, 'Devis not found');
        if (devis.status !== DevisStatus.DRAFT) throw new ApiError(400, 'Cannot modify a non-draft devis');
        if (acompte < 0) throw new ApiError(400, 'L\'acompte ne peut pas être négatif');

        return prisma.devis.update({
            where: { id: devisId },
            data: { acompte },
        });
    }

    /**
     * Update remise on a devis (SuperAdmin only, DRAFT only)
     */
    async updateRemise(devisId: string, remise: number, remiseType: 'FIXED' | 'PERCENTAGE') {
        const devis = await prisma.devis.findUnique({ where: { id: devisId } });
        if (!devis) throw new ApiError(404, 'Devis not found');
        if (devis.status !== DevisStatus.DRAFT) throw new ApiError(400, 'Cannot modify a non-draft devis');
        if (remise < 0) throw new ApiError(400, 'La remise ne peut pas être négative');

        await prisma.devis.update({
            where: { id: devisId },
            data: { remise, remiseType },
        });

        return calculationService.calculateDevisTotal(devisId);
    }

    /**
     * Update timbre fiscal on a devis (SuperAdmin only, DRAFT only)
     */
    async updateTimbreFiscal(devisId: string, amount: number) {
        const devis = await prisma.devis.findUnique({ where: { id: devisId } });
        if (!devis) throw new ApiError(404, 'Devis not found');
        if (devis.status !== DevisStatus.DRAFT) throw new ApiError(400, 'Cannot modify a non-draft devis');
        if (amount < 0) throw new ApiError(400, 'Le timbre fiscal ne peut pas être négatif');

        await prisma.devis.update({
            where: { id: devisId },
            data: { timbreFiscal: amount },
        });

        return calculationService.calculateDevisTotal(devisId);
    }

    /**
     * Validate devis (Admin only)
     */
    async validateDevis(devisId: string, userId?: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: { lines: true, client: true },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Devis is not in draft status');
        }

        if (devis.lines.length === 0) {
            throw new ApiError(400, 'Cannot validate an empty devis');
        }

        const updatedDevis = await prisma.devis.update({
            where: { id: devisId },
            data: {
                status: DevisStatus.VALIDATED,
                validatedAt: new Date(),
            },
            include: { client: true },
        });

        // Auto-create payment if acompte > 0
        const acompteAmount = Number(devis.acompte);
        if (acompteAmount > 0) {
            await prisma.payment.create({
                data: {
                    amount: acompteAmount,
                    description: `Acompte - ${devis.reference}`,
                    devisId: devis.id,
                    paymentDate: new Date(),
                    paymentMethod: 'Espèces',
                    createdById: userId,
                },
            });

            await notificationService.create({
                type: 'PAYMENT_RECEIVED',
                title: 'Acompte reçu',
                message: `Acompte de ${acompteAmount.toFixed(3)} TND reçu pour ${devis.client.name} (${devis.reference})`,
                entityType: 'payment',
                entityId: devis.id,
                triggeredById: userId,
            });
        }

        // Create notification
        await notificationService.create({
            type: 'DEVIS_VALIDATED',
            title: 'Devis validé',
            message: `Devis ${updatedDevis.reference} a été validé`,
            entityType: 'devis',
            entityId: devisId,
        });

        return updatedDevis;
    }

    /**
     * Cancel a devis
     */
    async cancelDevis(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status === DevisStatus.INVOICED) {
            throw new ApiError(400, 'Cannot cancel an invoiced devis');
        }

        return prisma.devis.update({
            where: { id: devisId },
            data: {
                status: DevisStatus.CANCELLED,
            },
        });
    }

    /**
     * Delete a devis
     */
    async deleteDevis(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: {
                invoice: true,
            },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status === DevisStatus.INVOICED || devis.invoice) {
            throw new ApiError(400, 'Cannot delete an invoiced devis');
        }

        // Delete associated lines and services first
        await prisma.devisLine.deleteMany({
            where: { devisId },
        });

        await prisma.devisService.deleteMany({
            where: { devisId },
        });
        
        // Delete associated payments to keep caisse balance accurate
        await prisma.payment.deleteMany({
            where: { devisId },
        });

        // Delete the devis
        await prisma.devis.delete({
            where: { id: devisId },
        });
        return { success: true, message: 'Devis deleted successfully' };
    }

    /**
     * Update devis status (Superadmin override)
     */
    async updateStatus(devisId: string, status: DevisStatus) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        // Validate status
        if (!Object.values(DevisStatus).includes(status)) {
            throw new ApiError(400, 'Invalid status');
        }

        const data: any = { status };

        // If moving back to DRAFT from VALIDATED, we might want to clear validatedAt?
        // Actually, just let the superadmin override strictly as requested.
        if (status === DevisStatus.VALIDATED && !devis.validatedAt) {
            data.validatedAt = new Date();
        }

        return prisma.devis.update({
            where: { id: devisId },
            data,
            include: { client: true },
        });
    }

    /**
     * Update devis notes
     */
    async updateNotes(devisId: string, notes: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        return prisma.devis.update({
            where: { id: devisId },
            data: { notes },
        });
    }
    /**
     * Generate PDF for a devis
     */
    async generateDevisPDF(devisId: string): Promise<Buffer> {
        const PDFDocument = (await import('pdfkit')).default;

        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: {
                client: true,
                createdBy: { select: { firstName: true, lastName: true } },
                lines: {
                    include: { material: true, maintenanceMaterial: true },
                    orderBy: { createdAt: 'asc' },
                },
                services: { include: { service: true } },
            },
        });

        if (!devis) throw new ApiError(404, 'Devis not found');

        const { client } = devis;

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 0, size: 'A4' });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const PW = doc.page.width;   // 595.28
            const PH = doc.page.height;  // 841.89
            const M  = 40;
            const CW = PW - M * 2;       // 515.28

            // ── Helpers ──────────────────────────────────────────────────────
            const hline = (x1: number, ly: number, x2: number) =>
                doc.moveTo(x1, ly).lineTo(x2, ly).stroke('#000');

            const vline = (lx: number, y1: number, y2: number) =>
                doc.moveTo(lx, y1).lineTo(lx, y2).stroke('#000');

            const fillRect = (x: number, fy: number, w: number, h: number, fill: string) => {
                doc.rect(x, fy, w, h).fillAndStroke(fill, '#000');
                doc.fillColor('#000');
            };

            const strokeRect = (x: number, sy: number, w: number, h: number) =>
                doc.rect(x, sy, w, h).stroke('#000');

            const txt = (
                text: string, x: number, ty: number, w: number,
                opts?: { bold?: boolean; size?: number; align?: 'left' | 'right' | 'center'; color?: string }
            ) => {
                doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
                   .fontSize(opts?.size ?? 8)
                   .fillColor(opts?.color ?? '#000')
                   .text(text, x, ty, { width: w, lineBreak: false });
            };

            // ── Logo ─────────────────────────────────────────────────────────
            const logoPath = path.join(process.cwd(), 'assets', 'logo.png');
            try {
                doc.image(logoPath, M, M, { fit: [130, 55] });
            } catch (_) { /* logo file not found, skip */ }

            // ── Section 1: Company box (left) + Client box (right) ────────────
            let y = M + 65;

            // Company info box
            strokeRect(M, y, 245, 128);
            txt('M. - CHERIF LASSAD - GRAVOPLUS', M + 5, y + 8,  235, { bold: true, size: 9 });
            txt('Avenue Habib Bourguiba Djerba',  M + 5, y + 22, 235, { size: 8 });
            txt('4180 Houmet Souk',               M + 5, y + 33, 235, { size: 8 });
            txt('Tél: 0021675622335',             M + 5, y + 44, 235, { size: 8 });
            txt('Mobile: 0021650868976',          M + 5, y + 55, 235, { size: 8 });
            txt('Email: gravoplus@gmail.com',     M + 5, y + 66, 235, { size: 8 });
            txt('TVA Intra: 000CN840811/D',       M + 5, y + 77, 235, { size: 8 });
            txt('BANQUE ZITOUNA',                 M + 5, y + 88, 235, { size: 8 });
            txt('RIB: 2503400000032226629',       M + 5, y + 99, 235, { size: 8 });

            // Client info box
            const cbX = PW - M - 200;
            strokeRect(cbX, y, 200, 80);
            txt(client.name,          cbX + 5, y + 14, 190, { bold: true, size: 10 });
            if (client.address) txt(client.address,  cbX + 5, y + 30, 190, { size: 8 });
            if (client.phone)   txt(`Tél: ${client.phone}`, cbX + 5, y + 42, 190, { size: 8 });
            if (client.email)   txt(client.email,    cbX + 5, y + 54, 190, { size: 8 });

            // ── Section 2: Devis reference table ─────────────────────────────
            y = M + 208;
            const rh   = 18;
            const cw4  = CW / 4;

            const validityDate = new Date(devis.createdAt);
            validityDate.setDate(validityDate.getDate() + 30);

            // Header row (blue-grey fill)
            fillRect(M, y, CW, rh, '#c8d4e8');
            txt('Devis',         M + cw4 * 0 + 5, y + 5, cw4 - 10, { bold: true, size: 9 });
            txt('Date',          M + cw4 * 1 + 5, y + 5, cw4 - 10, { bold: true, size: 9 });
            txt('Date validité', M + cw4 * 2 + 5, y + 5, cw4 - 10, { bold: true, size: 9 });
            txt('Code Client',   M + cw4 * 3 + 5, y + 5, cw4 - 10, { bold: true, size: 9 });
            [1, 2, 3].forEach(i => vline(M + cw4 * i, y, y + rh));

            y += rh;

            // Data row
            strokeRect(M, y, CW, rh);
            txt(devis.reference,                             M + cw4 * 0 + 5, y + 5, cw4 - 10, { size: 9 });
            txt(devis.createdAt.toLocaleDateString('fr-FR'), M + cw4 * 1 + 5, y + 5, cw4 - 10, { size: 9 });
            txt(validityDate.toLocaleDateString('fr-FR'),    M + cw4 * 2 + 5, y + 5, cw4 - 10, { size: 9 });
            txt(client.id.slice(-7).toUpperCase(),           M + cw4 * 3 + 5, y + 5, cw4 - 10, { size: 9 });
            [1, 2, 3].forEach(i => vline(M + cw4 * i, y, y + rh));

            // ── Section 3: Items table ────────────────────────────────────────
            y += rh + 8;

            // Columns: x position + width  (total = 515)
            const C = [
                { x: M,       w: 25  }, // Réf
                { x: M + 25,  w: 195 }, // Désignation
                { x: M + 220, w: 40  }, // Unité
                { x: M + 260, w: 55  }, // Quantité
                { x: M + 315, w: 70  }, // PU HT
                { x: M + 385, w: 55  }, // Remise
                { x: M + 440, w: 75  }, // Total HT
            ];
            const HEADERS = ['Réf', 'Désignation', 'Unité', 'Quantité', 'PU HT', 'Remise', 'Total HT'];
            const HALIGN: Array<'left' | 'right' | 'center'> = ['center', 'left', 'center', 'right', 'right', 'center', 'right'];
            const rowH = 18;

            // Table header row
            fillRect(M, y, CW, rowH, '#e0e0e0');
            C.forEach((c, i) => txt(HEADERS[i], c.x + 2, y + 5, c.w - 4, { bold: true, align: HALIGN[i] }));
            C.slice(1).forEach(c => vline(c.x, y, y + rowH));
            y += rowH;

            // Helper: draw one data row
            const drawRow = (cols: string[]) => {
                if (y + rowH > PH - 190) { doc.addPage(); y = M; }
                hline(M, y + rowH, M + CW);
                vline(M, y, y + rowH);
                vline(M + CW, y, y + rowH);
                C.slice(1).forEach(c => vline(c.x, y, y + rowH));
                C.forEach((c, i) => txt(cols[i] ?? '', c.x + 2, y + 5, c.w - 4, { align: HALIGN[i] }));
                y += rowH;
            };

            let lineNum = 1;
            for (const line of devis.lines) {
                const unit = line.minutes ? 'min'
                    : line.meters ? 'm'
                    : (line.material?.unit ?? (line as any).maintenanceMaterial?.unit ?? 'p');
                const qty  = line.minutes ?? line.meters ?? Number(line.quantity ?? 1);
                drawRow([
                    String(lineNum++),
                    line.description ?? line.machineType,
                    unit,
                    Number(qty).toFixed(2),
                    Number(line.unitPrice).toFixed(3),
                    '-',
                    Number(line.lineTotal).toFixed(3),
                ]);
            }

            for (const ds of devis.services) {
                drawRow([
                    String(lineNum++),
                    ds.service.name,
                    'p',
                    '1,00',
                    Number(ds.price).toFixed(3),
                    '-',
                    Number(ds.price).toFixed(3),
                ]);
            }

            // Sum of lines and services
            const linesTotal = devis.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
            const servicesTotal = devis.services.reduce((sum, ds) => sum + Number(ds.price), 0);
            const subtotal = linesTotal + servicesTotal;
            
            let remiseAmount = 0;
            if (devis.remiseType === 'PERCENTAGE') {
                remiseAmount = subtotal * (Number(devis.remise) / 100);
            } else {
                remiseAmount = Number(devis.remise);
            }

            const totalHT = Math.max(0, subtotal - remiseAmount);
            const timbreFiscal = Number(devis.timbreFiscal);
            const totalTTC = totalHT + timbreFiscal;

            // ── Section 4: Totals summary box (right) ────────────────────────
            const sbW  = 215;
            const sbX  = PW - M - sbW;
            const srh  = 16;
            let   sy   = y + 12;

            if (sy + srh * 6 + 10 > PH - 80) { doc.addPage(); sy = M; }

            strokeRect(sbX, sy, sbW, srh * 6);
            [1, 2, 3, 4, 5].forEach(i => hline(sbX, sy + srh * i, sbX + sbW));

            const sumRow = (label: string, value: string, i: number, bold?: boolean) => {
                const ry = sy + srh * i;
                txt(label, sbX + 4,   ry + 4, 110,         { bold, size: 8 });
                txt(value, sbX + 118, ry + 4, sbW - 122,   { bold, size: 8, align: 'right' });
            };

            sumRow('Total :',       `${subtotal.toFixed(3)} Dt`,     0);
            sumRow('Remise :',      `${remiseAmount.toFixed(3)} Dt`,  1);
            sumRow('Total HT :',    `${totalHT.toFixed(3)} Dt`,      2);
            sumRow('Timbre Fiscal', `${timbreFiscal.toFixed(3)} Dt`,  3);
            sumRow('Total TTC:',    `${totalTTC.toFixed(3)} Dt`,      4, true);
            const acompteVal = Number(devis.acompte);
            sumRow('Acomptes:',     `${acompteVal.toFixed(3)} Dt`,     5);

            // ── Section 5: Payment conditions (left) ─────────────────────────
            const nw = sbX - M - 12;
            let   ny = y + 12;

            doc.font('Helvetica').fontSize(7.5).fillColor('#000');

            if (devis.notes) {
                doc.text(devis.notes, M, ny, { width: nw });
                ny = doc.y + 5;
            }

            doc.font('Helvetica-Bold').fontSize(7.5)
               .text('Règlement(s)/Acompte(s) :', M, ny, { width: nw });
            ny = doc.y + 2;
            doc.font('Helvetica').fontSize(7.5)
               .text('Avance sur devis 50%/2eme avance 30% a livraison/20% a la reception', M, ny, { width: nw });
            ny = doc.y + 5;

            doc.font('Helvetica-Bold').fontSize(7.5)
               .text('Mode de règlement: ', M, ny, { continued: true });
            doc.font('Helvetica').text('Espèce');
            ny = doc.y + 5;

            doc.font('Helvetica').fontSize(7.5).fillColor('red')
               .text(`Devis valable jusqu'au: ${validityDate.toLocaleDateString('fr-FR')}`, M, ny, { width: nw });
            doc.fillColor('#000');

            // ── Footer ────────────────────────────────────────────────────────
            const fy = PH - 40;
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
               .text('GRAVOPLUS', M, fy, { width: CW, align: 'center' });
            doc.font('Helvetica').fontSize(7)
               .text('Avenue Habib Bourguiba Djerba - 4180 Houmet Souk | gravoplus@gmail.com', M, fy + 13, { width: CW, align: 'center' });
            doc.fontSize(7)
               .text('1/1', M, fy + 24, { width: CW, align: 'right' });

            doc.end();
        });
    }
}

export const devisService = new DevisService();
