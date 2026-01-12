import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import { ApiError } from '../middleware';
import { DevisStatus } from '../types';
import { Decimal } from '@prisma/client/runtime/library';

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
     * Convert devis to invoice
     */
    async createInvoiceFromDevis(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: {
                client: true,
                lines: { include: { material: true } },
                services: { include: { service: true } },
                invoice: true,
            },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.VALIDATED) {
            throw new ApiError(400, 'Devis must be validated before creating an invoice');
        }

        if (devis.invoice) {
            throw new ApiError(400, 'Invoice already exists for this devis');
        }

        const reference = await this.generateReference();

        // Create invoice
        const invoice = await prisma.invoice.create({
            data: {
                reference,
                devisId,
            },
        });

        // Update devis status
        await prisma.devis.update({
            where: { id: devisId },
            data: { status: DevisStatus.INVOICED },
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
                devis: {
                    include: {
                        client: true,
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

        const { devis } = invoice;

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
            doc.text(`N° Devis: ${devis.reference}`);
            doc.moveDown();

            // Client info
            doc.font('Helvetica-Bold').text('Client:');
            doc.font('Helvetica');
            doc.text(devis.client.name);
            if (devis.client.phone) doc.text(`Tél: ${devis.client.phone}`);
            if (devis.client.email) doc.text(`Email: ${devis.client.email}`);
            if (devis.client.address) doc.text(`Adresse: ${devis.client.address}`);
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

            // Total
            doc.moveTo(50, y).lineTo(550, y).stroke();
            y += 10;

            doc.font('Helvetica-Bold').fontSize(14);
            doc.text('TOTAL:', 380, y);
            doc.text(`${Number(devis.totalAmount).toFixed(2)} TND`, 460, y);

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
                devis: {
                    include: {
                        client: {
                            select: { id: true, name: true },
                        },
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
                devis: {
                    include: {
                        client: true,
                        lines: { include: { material: true } },
                        services: { include: { service: true } },
                    },
                },
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        return invoice;
    }
}

export const invoiceService = new InvoiceService();
