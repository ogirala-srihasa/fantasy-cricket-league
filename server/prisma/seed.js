const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  console.log('🏏 Seeding Fantasy Cricket League database...\n');

  // Load player data
  const seedPath = path.join(__dirname, '../../seeds/ipl2026-players.json');
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  let totalPlayers = 0;

  for (const team of seedData.teams) {
    console.log(`  📋 Seeding ${team.fullName} (${team.name})...`);
    
    for (const player of team.players) {
      const externalId = `ipl2026_${team.name.toLowerCase()}_${player.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
      
      await prisma.player.upsert({
        where: { externalId },
        update: {
          name: player.name,
          iplTeam: team.name,
          role: player.role,
          tier: player.tier,
          basePrice: player.basePrice,
          lastSyncedAt: new Date(),
        },
        create: {
          externalId,
          name: player.name,
          iplTeam: team.name,
          role: player.role,
          tier: player.tier,
          basePrice: player.basePrice,
          lastSyncedAt: new Date(),
        },
      });
      totalPlayers++;
    }
  }

  console.log(`\n✅ Seeded ${totalPlayers} players across ${seedData.teams.length} teams`);

  // Seed mock matches for demo mode
  const mockLeague = await prisma.league.findFirst();
  if (!mockLeague) {
    console.log('\n📅 No league found — mock matches will be seeded when a league is created.');
  }

  console.log('\n🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
