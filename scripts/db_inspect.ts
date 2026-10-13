import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const directUrl = process.env.DIRECT_URL || '';
const sslUrl = directUrl + (directUrl.includes('?') ? '&' : '?') + 'sslmode=require';
const db = new PrismaClient({ datasourceUrl: sslUrl });

async function main() {
  try {
    const cols: any = await db.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='Assignment'");
    console.log('Assignment columns:', cols.map((c: any) => c.column_name));
    
    const userCols: any = await db.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='User'");
    console.log('User columns:', userCols.map((c: any) => c.column_name));

    const stepTable: any = await db.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_name='LessonStep'");
    console.log('LessonStep table exists:', stepTable.length > 0);
  } catch (err: any) {
    console.error('Error querying DB:', err.message);
  } finally {
    await db.$disconnect();
  }
}

main();
