import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import { ApiError } from '../middleware';
import { DevisStatus } from '../types';

interface InvoiceItemInput {
    description: string;
    quantity: number;
    unitPrice: number;
}


export class InvoiceService {
    /**
     * Generate unique invoice reference
     */
    private async generateReference(): Promise<string> {
        const year = new Date().getFullYear();
        const count = await prisma.invoice.count({
            where: {
                reference: {
                    startsWith: `INV-${year}`,
                },
            },
        });

        const number = (count + 1).toString().padStart(4, '0');
        return `INV-${year}-${number}`;
    }

    /**
     * Create invoice directly with custom items (no devis required)
     */
    async createDirectInvoice(clientId: string, items: InvoiceItemInput[]) {
        if (!items || items.length === 0) {
            throw new ApiError(400, 'At least one item is required');
        }

        // Validate client exists
        const client = await prisma.client.findUnique({
            where: { id: clientId },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        const reference = await this.generateReference();
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

        // Create invoice with items in a transaction
        const invoice = await prisma.$transaction(async (tx) => {
            const newInvoice = await tx.invoice.create({
                data: {
                    reference,
                    clientId,
                    totalAmount,
                    items: {
                        create: items.map(item => ({
                            description: item.description,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.quantity * item.unitPrice,
                        })),
                    },
                },
                include: {
                    items: true,
                    client: true,
                },
            });

            return newInvoice;
        });

        return invoice;
    }

    /**
     * Convert devis to invoice (supports multiple devis)
     */
    async createInvoiceFromDevis(devisIds: string | string[]) {
        const ids = Array.isArray(devisIds) ? devisIds : [devisIds];

        if (ids.length === 0) {
            throw new ApiError(400, 'At least one devis is required');
        }

        // Fetch all devis
        const devisList = await prisma.devis.findMany({
            where: { id: { in: ids } },
            include: {
                client: true,
                invoice: true,
            },
        });

        if (devisList.length !== ids.length) {
            throw new ApiError(404, 'One or more devis not found');
        }

        // Validate all devis belong to same client
        const clientIds = [...new Set(devisList.map(d => d.clientId))];
        if (clientIds.length > 1) {
            throw new ApiError(400, 'All devis must belong to the same client');
        }

        // Validate all devis are VALIDATED
        const nonValidated = devisList.filter(d => d.status !== DevisStatus.VALIDATED);
        if (nonValidated.length > 0) {
            throw new ApiError(400, 'All devis must be validated before creating an invoice');
        }

        // Check if any devis already has an invoice
        const alreadyInvoiced = devisList.filter(d => d.invoiceId);
        if (alreadyInvoiced.length > 0) {
            throw new ApiError(400, 'One or more devis already have an invoice');
        }

        const reference = await this.generateReference();
        const clientId = clientIds[0];
        const totalAmount = devisList.reduce((sum, d) => sum + Number(d.totalAmount), 0);

        // Create invoice and update all devis in a transaction
        const invoice = await prisma.$transaction(async (tx) => {
            const newInvoice = await tx.invoice.create({
                data: {
                    reference,
                    clientId,
                    totalAmount,
                },
            });

            // Update all devis to link to invoice and set status
            await tx.devis.updateMany({
                where: { id: { in: ids } },
                data: {
                    status: DevisStatus.INVOICED,
                    invoiceId: newInvoice.id,
                },
            });

            return newInvoice;
        });

        return invoice;
    }

    /**
     * Generate PDF for invoice
     */
    async generatePDF(invoiceId: string): Promise<Buffer> {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                client: true,
                devis: {
                    include: {
                        lines: { include: { material: true } },
                        services: { include: { service: true } },
                        createdBy: {
                            select: { firstName: true, lastName: true },
                        },
                    },
                },
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        const { devis: devisList, client } = invoice;

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.fontSize(24).font('Helvetica-Bold').text('FACTURE', { align: 'center' });
            doc.moveDown();

            // Invoice info
            doc.fontSize(12).font('Helvetica');
            doc.text(`N° Facture: ${invoice.reference}`);
            doc.text(`Date: ${invoice.createdAt.toLocaleDateString('fr-FR')}`);
            doc.text(`N° Devis: ${devisList.map(d => d.reference).join(', ')}`);
            doc.moveDown();

            // Client info
            doc.font('Helvetica-Bold').text('Client:');
            doc.font('Helvetica');
            doc.text(client.name);
            if (client.phone) doc.text(`Tél: ${client.phone}`);
            if (client.email) doc.text(`Email: ${client.email}`);
            if (client.address) doc.text(`Adresse: ${client.address}`);
            doc.moveDown();

            // Line items
            doc.font('Helvetica-Bold').text('Détails:');
            doc.moveDown(0.5);

            // Table header
            const tableTop = doc.y;
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('Description', 50, tableTop);
            doc.text('Quantité', 300, tableTop);
            doc.text('Prix Unit.', 380, tableTop);
            doc.text('Total', 460, tableTop);

            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            let y = tableTop + 25;
            doc.font('Helvetica').fontSize(10);

            // Loop through each devis
            for (const devis of devisList) {
                // Devis header
                if (devisList.length > 1) {
                    doc.font('Helvetica-Bold').fontSize(10);
                    doc.text(`Devis: ${devis.reference}`, 50, y);
                    y += 18;
                    doc.font('Helvetica').fontSize(10);
                }

                // Lines
                for (const line of devis.lines) {
                    const desc = `${line.machineType}${line.description ? ` - ${line.description}` : ''}`;
                    const qty = line.minutes ? `${line.minutes} min` :
                        line.meters ? `${line.meters} m` :
                            `${line.quantity} unités`;

                    doc.text(desc, 50, y, { width: 240 });
                    doc.text(qty, 300, y);
                    doc.text(`${Number(line.unitPrice).toFixed(2)} TND`, 380, y);
                    doc.text(`${Number(line.lineTotal).toFixed(2)} TND`, 460, y);

                    y += 20;
                }

                // Services
                for (const ds of devis.services) {
                    doc.text(ds.service.name, 50, y);
                    doc.text('1', 300, y);
                    doc.text(`${Number(ds.price).toFixed(2)} TND`, 380, y);
                    doc.text(`${Number(ds.price).toFixed(2)} TND`, 460, y);

                    y += 20;
                }

                // Add spacing between devis if multiple
                if (devisList.length > 1) {
                    y += 10;
                }
            }

            // Total
            doc.moveTo(50, y).lineTo(550, y).stroke();
            y += 10;

            doc.font('Helvetica-Bold').fontSize(14);
            doc.text('TOTAL:', 380, y);
            doc.text(`${Number(invoice.totalAmount).toFixed(2)} TND`, 460, y);

            // Footer
            doc.fontSize(10).font('Helvetica');
            doc.text(
                'Merci pour votre confiance!',
                50,
                doc.page.height - 100,
                { align: 'center', width: 500 }
            );

            doc.end();
        });
    }

    /**
     * Get all invoices
     */
    async getAllInvoices() {
        return prisma.invoice.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                client: {
                    select: { id: true, name: true },
                },
                devis: {
                    select: {
                        id: true,
                        reference: true,
                        totalAmount: true,
                    },
                },
            },
        });
    }

    /**
     * Get invoice by ID
     */
    async getInvoiceById(invoiceId: string) {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                client: true,
                items: true,
                devis: {
                    include: {
                        lines: { include: { material: true } },
                        services: { include: { service: true } },
                        createdBy: {
                            select: { id: true, firstName: true, lastName: true },
                        },
                    },
                },
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        return invoice;
    }

    /**
     * Delete an invoice
     */
    async deleteInvoice(invoiceId: string) {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                payments: true,
                devis: true,
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        // Cannot delete invoice if it has payments
        if (invoice.payments && invoice.payments.length > 0) {
            throw new ApiError(400, 'Cannot delete an invoice with payments. Delete all payments first.');
        }

        // Delete invoice and reset associated devis in a transaction
        await prisma.$transaction(async (tx) => {
            // Reset devis status back to VALIDATED and remove invoice link
            await tx.devis.updateMany({
                where: { invoiceId },
                data: {
                    invoiceId: null,
                    status: DevisStatus.VALIDATED,
                },
            });

            // Delete the invoice
            await tx.invoice.delete({
                where: { id: invoiceId },
            });
        });

        return { success: true, message: 'Invoice deleted successfully' };
    }
}

export const invoiceService = new InvoiceService();
