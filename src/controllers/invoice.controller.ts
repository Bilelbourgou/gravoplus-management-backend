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
            const invoice = await invoiceService.getInvoiceById(id as string);

            res.json({
                success: true,
                data: invoice,
            });
        } catch (error) {
            next(error);
        }
    }

    async createDirect(req: Request, res: Response, next: NextFunction) {
        try {
            const { clientId, items } = req.body;

            if (!clientId || !items) {
                return res.status(400).json({
                    success: false,
                    error: 'clientId and items are required',
                });
            }

            const invoice = await invoiceService.createDirectInvoice(clientId, items);

            res.status(201).json({
                success: true,
                data: invoice,
            });
        } catch (error) {
            next(error);
        }
    }

    async createFromDevis(req: Request, res: Response, next: NextFunction) {
        try {
            // Support both single devisId from params (backward compatible) and devisIds from body
            const { devisId } = req.params;
            const devisIds = req.body?.devisIds;

            const ids = devisIds || devisId;

            if (!ids) {
                return res.status(400).json({
                    success: false,
                    error: 'devisId or devisIds is required',
                });
            }

            const invoice = await invoiceService.createInvoiceFromDevis(ids);

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

            const pdfBuffer = await invoiceService.generatePDF(id as string);
            const invoice = await invoiceService.getInvoiceById(id as string);

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

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const result = await invoiceService.deleteInvoice(id as string);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const invoiceController = new InvoiceController();
