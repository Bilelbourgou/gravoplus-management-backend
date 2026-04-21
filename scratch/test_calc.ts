
import { MachineType } from '../src/types';
import { CalculationService } from '../src/services/calculation.service';

// Mock prisma if needed, but calculation.service uses it.
// I'll just check the logic by looking at the code, but a script is better.
// Actually, I'll just use a small script that I can run with ts-node if available, 
// or just look at the code carefully.

async function test() {
    const service = new CalculationService();
    
    // Test PANNEAUX
    // input.quantity = 2
    // pricing.pricePerUnit = 10
    // Expected: 2 * 10 = 20
    // Current logic: 
    // nombre = 2
    // lineTotal = 2 * 10 = 20
    // lineTotal *= 2 = 40
    // Result: 40 (Bug!)
}
