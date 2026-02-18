const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCategories() {
    const categories = [
        { name: 'Matériel', color: '#0066cc', icon: 'Package' },
        { name: 'Fournitures', color: '#28a745', icon: 'Receipt' },
        { name: 'Transport', color: '#856404', icon: 'Truck' },
        { name: 'Maintenance', color: '#6f42c1', icon: 'Tool' },
        { name: 'Salaires', color: '#17a2b8', icon: 'Users' },
        { name: 'Loyer', color: '#fd7e14', icon: 'Home' },
        { name: 'Électricité', color: '#d39e00', icon: 'Zap' },
        { name: 'Autre', color: '#6c757d', icon: 'MoreHorizontal' },
    ];

    console.log('Seeding initial categories...');

    for (const cat of categories) {
        try {
            await prisma.expenseCategory.upsert({
                where: { name: cat.name },
                update: { color: cat.color, icon: cat.icon },
                create: cat,
            });
            console.log(`- Seeded category: ${cat.name}`);
        } catch (e) {
            console.error(`- Error seeding ${cat.name}:`, e.message);
        }
    }

    // Also migrate existing expenses to "Autre" if they have no valid category
    // Since we changed 'category' to 'categoryName', and its required based on relation
    // db push might have cleared data if it couldn't map, but let's be safe.

    console.log('Seeding complete.');
    await prisma.$disconnect();
}

seedCategories();
