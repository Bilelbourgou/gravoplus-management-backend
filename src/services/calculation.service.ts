
import prisma from '../config/database';
import { CalculationInput, CalculationResult, MachineType } from '../types';
import { ApiError } from '../middleware';

export class CalculationService {
    /**
     * Calculate line total based on machine type and inputs
     */
    async calculateLine(input: CalculationInput): Promise<CalculationResult> {
        // Get machine pricing
        const pricing = await prisma.machinePricing.findUnique({
            where: { machineType: input.machineType },
        });

        if (!pricing) {
            throw new ApiError(400, `Pricing not found for machine type: ${input.machineType}`);
        }

        const unitPrice = Number(pricing.pricePerUnit);
        let lineTotal = 0;
        let materialCost = 0;
        let breakdown = '';

        switch (input.machineType) {
            case MachineType.CNC:
                // CNC: minutes × pricePerMinute
                if (!input.minutes || input.minutes <= 0) {
                    throw new ApiError(400, 'Minutes are required for CNC calculation');
                }
                lineTotal = input.minutes * unitPrice;
                breakdown = `${input.minutes} min × ${unitPrice} TND/min = ${lineTotal.toFixed(2)} TND`;
                break;

            case MachineType.LASER:
                // Laser: (minutes × pricePerMinute) + material cost
                if (!input.minutes || input.minutes <= 0) {
                    throw new ApiError(400, 'Minutes are required for Laser calculation');
                }

                const machineWork = input.minutes * unitPrice;

                if (input.materialId) {
                    const material = await prisma.material.findUnique({
                        where: { id: input.materialId },
                    });

                    if (material) {
                        materialCost = Number(material.pricePerUnit);
                    }
                }

                lineTotal = machineWork + materialCost;
                breakdown = `(${input.minutes} min × ${unitPrice} TND/min) + ${materialCost.toFixed(2)} TND material = ${lineTotal.toFixed(2)} TND`;
                break;

            case MachineType.CHAMPS:
                // Champs: meters × pricePerMeter
                if (!input.meters || input.meters <= 0) {
                    throw new ApiError(400, 'Meters are required for Champs calculation');
                }
                lineTotal = input.meters * unitPrice;
                breakdown = `${input.meters} m × ${unitPrice} TND/m = ${lineTotal.toFixed(2)} TND`;
                break;

            case MachineType.PANNEAUX:
                // Panneaux: quantity × unitPrice
                if (!input.quantity || input.quantity <= 0) {
                    throw new ApiError(400, 'Quantity is required for Panneaux calculation');
                }
                lineTotal = input.quantity * unitPrice;
                breakdown = `${input.quantity} units × ${unitPrice} TND/unit = ${lineTotal.toFixed(2)} TND`;
                break;

            default:
                throw new ApiError(400, `Unknown machine type: ${input.machineType}`);
        }

        return {
            machineType: input.machineType,
            unitPrice,
            materialCost,
            lineTotal: Math.round(lineTotal * 100) / 100,
            breakdown,
        };
    }

    /**
     * Calculate total for a devis
     */
    async calculateDevisTotal(devisId: string): Promise<number> {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: {
                lines: true,
                services: {
                    include: { service: true },
                },
            },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        // Sum line totals
        const linesTotal = devis.lines.reduce(
            (sum, line) => sum + Number(line.lineTotal),
            0
        );

        // Sum service prices
        const servicesTotal = devis.services.reduce(
            (sum, ds) => sum + Number(ds.price),
            0
        );

        const total = linesTotal + servicesTotal;

        // Update devis total
        await prisma.devis.update({
            where: { id: devisId },
            data: { totalAmount: total },
        });

        return Math.round(total * 100) / 100;
    }
}

export const calculationService = new CalculationService();
