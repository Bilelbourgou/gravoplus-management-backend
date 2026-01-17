import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/payment.service';

export class PaymentController {
    async createPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const { invoiceId } = req.params;
            const paymentData = req.body;

            const payment = await paymentService.createPayment(invoiceId, paymentData);

            res.status(201).json({
                success: true,
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    async getPaymentsByInvoice(req: Request, res: Response, next: NextFunction) {
        try {
            const { invoiceId } = req.params;

            const payments = await paymentService.getPaymentsByInvoice(invoiceId);

            res.json({
                success: true,
                data: payments,
            });
        } catch (error) {
            next(error);
        }
    }

    async getPaymentById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const payment = await paymentService.getPaymentById(id);

            res.json({
                success: true,
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    async updatePayment(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const paymentData = req.body;

            const payment = await paymentService.updatePayment(id, paymentData);

            res.json({
                success: true,
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    async deletePayment(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const result = await paymentService.deletePayment(id);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async getPaymentStats(req: Request, res: Response, next: NextFunction) {
        try {
            const { invoiceId } = req.params;

            const stats = await paymentService.getPaymentStats(invoiceId);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const paymentController = new PaymentController();
