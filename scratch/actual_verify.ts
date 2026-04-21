
import { MachineType } from '../src/types';
import { CalculationService } from '../src/services/calculation.service';
import prisma from '../src/config/database';

// Mocking prisma methods used in calculateLine
(prisma.machinePricing.findUnique as any) = async ({ where }: any) => {
    console.log(`[MOCK] Fetching pricing for ${where.machineType}`);
    if (where.machineType === MachineType.PANNEAUX) return { pricePerUnit: 10 };
    if (where.machineType === MachineType.CNC) return { pricePerUnit: 2 };
    if (where.machineType === MachineType.CUSTOM) return { pricePerUnit: 20 };
    return null;
};

(prisma.material.findUnique as any) = async ({ where }: any) => {
    console.log(`[MOCK] Fetching material ${where.id}`);
    return null;
};

async function runVerification() {
    const service = new CalculationService();

    console.log("--- Testing PANNEAUX ---");
    const resPanneaux = await service.calculateLine({
        machineType: MachineType.PANNEAUX,
        quantity: 5
    });
    console.log(`Input: Quantity=5, Price=10`);
    console.log(`Total: ${resPanneaux.lineTotal}`);
    console.log(`Breakdown: ${resPanneaux.breakdown}`);
    if (resPanneaux.lineTotal === 50) {
        console.log("✅ PANNEAUX Fixed!");
    } else {
        console.error("❌ PANNEAUX Bug still exists!");
    }

    console.log("\n--- Testing CUSTOM ---");
    const resCustom = await service.calculateLine({
        machineType: MachineType.CUSTOM,
        quantity: 3,
        unitPrice: 20
    });
    console.log(`Input: Quantity=3, UnitPrice=20`);
    console.log(`Total: ${resCustom.lineTotal}`);
    console.log(`Breakdown: ${resCustom.breakdown}`);
    if (resCustom.lineTotal === 60) {
        console.log("✅ CUSTOM Fixed!");
    } else {
        console.error("❌ CUSTOM Bug still exists!");
    }

    console.log("\n--- Testing CNC (Standard multiplier check) ---");
    const resCnc = await service.calculateLine({
        machineType: MachineType.CNC,
        minutes: 10,
        quantity: 5
    });
    console.log(`Input: Minutes=10, Quantity=5, Price=2/min`);
    console.log(`Total: ${resCnc.lineTotal}`);
    console.log(`Breakdown: ${resCnc.breakdown}`);
    if (resCnc.lineTotal === 100) {
        console.log("✅ CNC still works correctly!");
    } else {
        console.error("❌ CNC logic broken!");
    }
}

runVerification().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
