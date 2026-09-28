// Usage: npm run create-user -- <email> <password> <zohoOrgId>
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(currentDirectory, '../.env') });

// Imported after dotenv so DATABASE_URL is available when the Prisma client is created.
const { default: bcrypt } = await import('bcryptjs');
const { prisma } = await import('../src/db/prisma.js');

const [email, password, zohoOrgId] = process.argv.slice(2);

if (!email || !password || !zohoOrgId) {
  console.error('Usage: npm run create-user -- <email> <password> <zohoOrgId>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

try {
  const organization = await prisma.organization.findUnique({ where: { zohoOrgId } });
  if (!organization) {
    console.error(`No organization with Zoho id ${zohoOrgId}. Run the Zoho connect flow first.`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      organizationId: organization.id,
    },
    select: { email: true },
  });

  console.log(`Created user ${user.email} for ${organization.name}.`);
} finally {
  await prisma.$disconnect();
}
