import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demouser123';
const DEMO_BCRYPT_COST = 12;

// 10-min interval per plan §9 — bounds Redis cost regardless of which §3
// option you picked, and "look, it's checking" is enough for a demo.
const DEMO_MONITORS: Array<{ name: string; url: string }> = [
  { name: 'Example', url: 'https://example.com' },
  { name: 'GitHub', url: 'https://github.com' },
  // { name: 'Cloudflare', url: 'https://www.cloudflare.com' },
  { name: 'Google', url: 'https://www.google.com' },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, DEMO_BCRYPT_COST);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { isDemo: true },
    create: { email: DEMO_EMAIL, passwordHash, isDemo: true },
  });

  const existing = await prisma.monitor.count({ where: { userId: user.id } });
  if (existing > 0) {
    console.log(`Demo user already has ${existing} monitor(s); skipping monitor seed.`);
    return;
  }

  await prisma.monitor.createMany({
    data: DEMO_MONITORS.map((m) => ({
      userId: user.id,
      name: m.name,
      url: m.url,
      intervalMinutes: 10,
    })),
  });

  console.log(`Seeded ${DEMO_MONITORS.length} demo monitors for ${DEMO_EMAIL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
