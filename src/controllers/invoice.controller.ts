import { Request, Response, NextFunction } from 'express';
import { invoiceService } from '../services';

export class InvoiceController {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const invoices = await invoiceService.getAllInvoices();

            res.json({
                success: true,
                data: invoices,
            });
        } catch (error) {
            next(error);
        }
    }

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const invoice = await invoiceService.getInvoiceById(id);

            res.json({
                success: true,
                data: invoice,
            });
        } catch (error) {
            next(error);
        }
    }

    async createFromDevis(req: Request, res: Response, next: NextFunction) {
        try {
            const { devisId } = req.params;

            const invoice = await invoiceService.createInvoiceFromDevis(devisId);

            res.status(201).json({
                success: true,
                data: invoice,
            });
        } catch (error) {
            next(error);
        }
    }

    async downloadPDF(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const pdfBuffer = await invoiceService.generatePDF(id);
            const invoice = await invoiceService.getInvoiceById(id);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${invoice.reference}.pdf"`
            );
            res.send(pdfBuffer);
        } catch (error) {
            next(error);
        }
    }
}

export const invoiceController = new InvoiceController();
