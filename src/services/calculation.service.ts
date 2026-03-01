
import prisma from '../config/database';
import { CalculationInput, CalculationResult, MachineType } from '../types';
import { ApiError } from '../middleware';

export class CalculationService {
    /**
     * Calculate line total based on machine type and inputs
     */
    async calculateLine(input: CalculationInput): Promise<CalculationResult> {
        let unitPrice = 0;

        // If manual price provided (e.g. for SERVICE_MAINTENANCE), use it
        if (input.unitPrice !== undefined && input.unitPrice !== null) {
            unitPrice = Number(input.unitPrice);
        } else if (input.machineType === MachineType.VENTE_MATERIAU) {
            // Price comes from material, handled in switch
            unitPrice = 0;
        } else {
            // Otherwise get machine pricing from DB
            const pricing = await prisma.machinePricing.findUnique({
                where: { machineType: input.machineType },
            });

            if (!pricing) {
                throw new ApiError(400, `Pricing not found for machine type: ${input.machineType}`);
            }
            unitPrice = Number(pricing.pricePerUnit);
        }
        let lineTotal = 0;
        let materialCost = 0;
        let breakdown = '';

        switch (input.machineType) {
            case MachineType.CNC:
                // CNC: minutes × pricePerMinute + optional material
                if (!input.minutes || input.minutes <= 0) {
                    throw new ApiError(400, 'Minutes are required for CNC calculation');
                }
                const cncMachineWork = input.minutes * unitPrice;

                if (input.materialId) {
                    const material = await prisma.material.findUnique({
                        where: { id: input.materialId },
                    });

                    if (material) {
                        if (input.width && input.height && material.unit === 'm²') {
                            const widthInMeters = input.dimensionUnit === 'cm' ? input.width / 100 : input.width;
                            const heightInMeters = input.dimensionUnit === 'cm' ? input.height / 100 : input.height;
                            const area = widthInMeters * heightInMeters;

                            materialCost = area * Number(material.pricePerUnit);
                            breakdown = `(${input.minutes} min × ${unitPrice} TND/min) + (${widthInMeters}m × ${heightInMeters}m × ${Number(material.pricePerUnit)} TND/m²) = ${(cncMachineWork + materialCost).toFixed(2)} TND`;
                        } else {
                            materialCost = Number(material.pricePerUnit);
                            breakdown = `(${input.minutes} min × ${unitPrice} TND/min) + ${materialCost.toFixed(2)} TND material = ${(cncMachineWork + materialCost).toFixed(2)} TND`;
                        }
                    }
                } else {
                    breakdown = `${input.minutes} min × ${unitPrice} TND/min = ${cncMachineWork.toFixed(2)} TND`;
                }

                lineTotal = cncMachineWork + materialCost;
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
                        // Check if we have dimensions for area calculation
                        if (input.width && input.height && material.unit === 'm²') {
                            const widthInMeters = input.dimensionUnit === 'cm' ? input.width / 100 : input.width;
                            const heightInMeters = input.dimensionUnit === 'cm' ? input.height / 100 : input.height;
                            const area = widthInMeters * heightInMeters;

                            materialCost = area * Number(material.pricePerUnit);
                            breakdown = `(${input.minutes} min × ${unitPrice} TND/min) + (${widthInMeters}m × ${heightInMeters}m × ${Number(material.pricePerUnit)} TND/m²) = ${(machineWork + materialCost).toFixed(2)} TND`;
                        } else {
                            // Fallback to unit price if no dimensions or unit isn't m²
                            materialCost = Number(material.pricePerUnit);
                            breakdown = `(${input.minutes} min × ${unitPrice} TND/min) + ${materialCost.toFixed(2)} TND material = ${(machineWork + materialCost).toFixed(2)} TND`;
                        }
                    }
                } else {
                    breakdown = `${input.minutes} min × ${unitPrice} TND/min = ${machineWork.toFixed(2)} TND`;
                }

                lineTotal = machineWork + materialCost;
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

            case MachineType.SERVICE_MAINTENANCE:
                // Service Maintenance: can use maintenance material, fixed service, or manual price
                const maintenanceQty = input.quantity && input.quantity > 0 ? input.quantity : 1;

                if (input.maintenanceMaterialId) {
                    // Using maintenance material - calculate based on maintenance material price × quantity
                    const maintenanceMaterial = await prisma.maintenanceMaterial.findUnique({
                        where: { id: input.maintenanceMaterialId },
                    });
                    if (!maintenanceMaterial) {
                        throw new ApiError(404, 'Maintenance material not found');
                    }
                    const materialPrice = Number(maintenanceMaterial.pricePerUnit);
                    lineTotal = maintenanceQty * materialPrice;
                    breakdown = `${maintenanceMaterial.name}: ${maintenanceQty} ${maintenanceMaterial.unit} × ${materialPrice.toFixed(2)} TND = ${lineTotal.toFixed(2)} TND`;
                } else if (input.serviceId) {
                    // Using fixed service - calculate based on service price × quantity
                    const fixedService = await prisma.fixedService.findUnique({
                        where: { id: input.serviceId },
                    });
                    if (!fixedService) {
                        throw new ApiError(404, 'Service not found');
                    }
                    const servicePrice = Number(fixedService.price);
                    lineTotal = maintenanceQty * servicePrice;
                    breakdown = `${fixedService.name}: ${maintenanceQty} × ${servicePrice.toFixed(2)} TND = ${lineTotal.toFixed(2)} TND`;
                } else {
                    // Manual price entry
                    lineTotal = maintenanceQty * unitPrice;
                    breakdown = `${maintenanceQty} ${maintenanceQty > 1 ? 'services' : 'service'} × ${unitPrice} TND = ${lineTotal.toFixed(2)} TND`;
                }
                break;

            case MachineType.VENTE_MATERIAU:
                // Vente Materiau: Area * PricePerUnit
                if (!input.materialId) {
                    throw new ApiError(400, 'Material represents required for Vente Materiau');
                }
                if (!input.width || !input.height) {
                    throw new ApiError(400, 'Width and Height are required for Vente Materiau');
                }

                if (input.width <= 0 || input.height <= 0) {
                    throw new ApiError(400, 'Dimensions must be greater than 0');
                }

                // Fetch material to get price
                const matSimple = await prisma.material.findUnique({
                    where: { id: input.materialId },
                });

                if (!matSimple) {
                    throw new ApiError(404, 'Material not found');
                }

                // Assuming material unit is m² for sheet materials
                const wMeters = input.dimensionUnit === 'cm' ? input.width / 100 : input.width;
                const hMeters = input.dimensionUnit === 'cm' ? input.height / 100 : input.height;
                const areaSimple = wMeters * hMeters;

                // Use material price as unit price if not overridden, but usually we use material price
                // Here unitPrice passed in might be 0 if it came from machinePricing which doesn't exist for VENTE_MATERIAU?
                // Actually, VENTE_MATERIAU might not have a MachinePricing entry. 
                // We should use the material's price.

                lineTotal = areaSimple * Number(matSimple.pricePerUnit);
                breakdown = `${wMeters}m × ${hMeters}m × ${Number(matSimple.pricePerUnit)} TND/m² = ${lineTotal.toFixed(2)} TND`;

                // Set these for the return object
                unitPrice = Number(matSimple.pricePerUnit);
                materialCost = lineTotal; // It's all material cost
                break;

            case MachineType.PLIAGE:
                // Pliage: (machine meters × machinePrice) + (material meters × materialPrice)
                if (!input.meters || input.meters <= 0) {
                    throw new ApiError(400, 'Les mètres de la machine sont requis pour le calcul Pliage');
                }

                let materialUnitPrice = 0;
                let materialName = '';
                if (input.materialId) {
                    const material = await prisma.material.findUnique({
                        where: { id: input.materialId },
                    });
                    if (material) {
                        materialUnitPrice = Number(material.pricePerUnit);
                        materialName = material.name;
                    }
                }

                const materialMeters = input.quantity && input.quantity > 0 ? input.quantity : 0;
                const machineCost = input.meters * unitPrice;
                materialCost = materialMeters * materialUnitPrice;
                lineTotal = machineCost + materialCost;

                breakdown = `${input.meters} m machine × ${unitPrice} TND/m`;
                if (materialMeters > 0) {
                    breakdown += ` + ${materialMeters} m ${materialName || 'matériau'} × ${materialUnitPrice} TND/m`;
                }
                breakdown += ` = ${lineTotal.toFixed(2)} TND`;
                break;

            case MachineType.CUSTOM:
                // Custom: quantity × unitPrice (both provided by user)
                if (!input.unitPrice || input.unitPrice <= 0) {
                    throw new ApiError(400, 'Unit price is required for Custom items');
                }
                const customQty = input.quantity && input.quantity > 0 ? input.quantity : 1;
                lineTotal = customQty * unitPrice;
                breakdown = `${customQty} × ${unitPrice} TND = ${lineTotal.toFixed(2)} TND`;
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
