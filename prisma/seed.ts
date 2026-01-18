import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: adminPassword,
            firstName: 'Administrateur',
            lastName: 'GravoPlus',
            role: 'ADMIN',
        },
    });
    console.log('✅ Admin user created:', admin.username);

    // Create employee user
    const employeePassword = await bcrypt.hash('employee123', 12);
    const employee = await prisma.user.upsert({
        where: { username: 'employee' },
        update: {},
        create: {
            username: 'employee',
            password: employeePassword,
            firstName: 'Ahmed',
            lastName: 'Ben Ali',
            role: 'EMPLOYEE',
            allowedMachines: {
                create: [
                    { machine: 'CNC' },
                    { machine: 'LASER' },
                ],
            },
        },
    });
    console.log('✅ Employee user created:', employee.username);

    // Create machine pricing
    const machineTypes = [
        { machineType: 'CNC' as const, pricePerUnit: 1.5, description: 'Prix par minute (TND)' },
        { machineType: 'LASER' as const, pricePerUnit: 2.0, description: 'Prix par minute (TND)' },
        { machineType: 'CHAMPS' as const, pricePerUnit: 5.0, description: 'Prix par mètre (TND)' },
        { machineType: 'PANNEAUX' as const, pricePerUnit: 25.0, description: 'Prix par unité (TND)' },
    ];

    for (const pricing of machineTypes) {
        await prisma.machinePricing.upsert({
            where: { machineType: pricing.machineType },
            update: { pricePerUnit: pricing.pricePerUnit },
            create: {
                machineType: pricing.machineType,
                pricePerUnit: pricing.pricePerUnit,
                description: pricing.description,
            },
        });
    }
    console.log('✅ Machine pricing configured');

    // Create fixed services
    const services = [
        { name: 'Design', price: 50, description: 'Conception graphique' },
        { name: 'Finition', price: 30, description: 'Finition et polissage' },
        { name: 'Livraison', price: 20, description: 'Livraison sur site' },
        { name: 'Installation', price: 100, description: 'Installation sur site' },
    ];

    for (const service of services) {
        const existing = await prisma.fixedService.findFirst({ where: { name: service.name } });
        if (!existing) {
            await prisma.fixedService.create({
                data: {
                    name: service.name,
                    price: service.price,
                    description: service.description,
                },
            });
        }
    }
    console.log('✅ Fixed services created');

    // Create materials
    const materials = [
        { name: 'Inox 304', pricePerUnit: 15, unit: 'm²', description: 'Acier inoxydable 304' },
        { name: 'Aluminium', pricePerUnit: 10, unit: 'm²', description: 'Plaque aluminium' },
        { name: 'Bois MDF', pricePerUnit: 8, unit: 'm²', description: 'Medium density fiberboard' },
        { name: 'Acrylique', pricePerUnit: 12, unit: 'm²', description: 'Plaque acrylique transparente' },
    ];

    for (const material of materials) {
        const existing = await prisma.material.findFirst({ where: { name: material.name } });
        if (!existing) {
            await prisma.material.create({
                data: {
                    name: material.name,
                    pricePerUnit: material.pricePerUnit,
                    unit: material.unit,
                    description: material.description,
                },
            });
        }
    }
    console.log('✅ Materials created');

    // Create sample clients
    const clients = [
        { name: 'Entreprise ABC', phone: '+216 71 234 567', email: 'contact@abc.tn' },
        { name: 'Société XYZ', phone: '+216 72 345 678', email: 'info@xyz.tn' },
        { name: 'Mohamed Ben Salem', phone: '+216 98 765 432' },
    ];

    const createdClients = [];
    for (const client of clients) {
        let existing = await prisma.client.findFirst({ where: { name: client.name } });
        if (!existing) {
            existing = await prisma.client.create({ data: client });
        }
        createdClients.push(existing);
    }
    console.log('✅ Sample clients created');

    // Create sample validated devis for the same client (to test multi-devis invoice feature)
    const testClient = createdClients[0]; // Entreprise ABC
    
    // Create 3 validated devis for the same client
    for (let i = 1; i <= 3; i++) {
        const devis = await prisma.devis.create({
            data: {
                reference: `DEV-2025-000${i}`,
                clientId: testClient.id,
                createdById: employee.id,
                status: 'VALIDATED',
                validatedAt: new Date(),
                notes: `Devis de test ${i} pour démonstration multi-devis`,
            },
        });

        // Add a sample line to each devis
        await prisma.devisLine.create({
            data: {
                devisId: devis.id,
                machineType: i === 1 ? 'CNC' : i === 2 ? 'LASER' : 'PANNEAUX',
                description: `Travail ${i === 1 ? 'CNC' : i === 2 ? 'Laser' : 'Panneaux'}`,
                minutes: i === 1 || i === 2 ? 30 * i : undefined,
                quantity: i === 3 ? 2 : undefined,
                unitPrice: i === 1 ? 1.5 : i === 2 ? 2.0 : 25.0,
                materialCost: 50 * i,
                lineTotal: (i === 1 ? 45 : i === 2 ? 60 : 50) + (50 * i),
            },
        });

        // Update devis total
        const totalAmount = (i === 1 ? 45 : i === 2 ? 60 : 50) + (50 * i);
        await prisma.devis.update({
            where: { id: devis.id },
            data: { totalAmount },
        });
    }
    console.log('✅ Sample validated devis created for testing');

    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📌 Login credentials:');
    console.log('   Admin: username=admin, password=admin123');
    console.log('   Employee: username=employee, password=employee123');
    console.log('\n💡 Test feature: 3 validated devis created for "Entreprise ABC"');
    console.log('   Go to Devis page to see "Créer facture (3)" button');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
