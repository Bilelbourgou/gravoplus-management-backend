const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSchema() {
    try {
        const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'expenses'
    `;
        console.log('Columns in expenses table:');
        console.log(JSON.stringify(result, null, 2));

        const categoriesTable = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'expense_categories'
    `;
        console.log('Expense categories table exists:', categoriesTable.length > 0);
    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkSchema();
