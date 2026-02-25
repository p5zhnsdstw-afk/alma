/**
 * Import Roam Research home layout data into Alma's home_profile schema.
 *
 * Source: October 27th, 2023.md — Robert's house electrical/room layout
 * from the generator/battery backup planning session.
 *
 * This transforms the nested Roam outline into structured home_profile rows
 * for Alma's per-family SQLite database.
 */

import { randomUUID } from 'crypto';

interface HomeItem {
  id: string;
  category: string;
  name: string;
  brand: string | null;
  model: string | null;
  install_date: string | null;
  warranty_expires: string | null;
  location: string;
  notes: string | null;
}

// Parsed from October 27th, 2023.md — Robert's house layout
// This is the complete room-by-room inventory from the generator planning session
const ROOMS: Record<string, Array<{ name: string; category: string; notes?: string }>> = {
  'Cuarto Eléctrico': [
    { name: 'Alarma', category: 'security' },
    { name: 'Sistema de Automatización', category: 'automation' },
    { name: 'Router Internet', category: 'networking' },
    { name: 'Rack de Red', category: 'networking', notes: 'Manda señal a toda la casa' },
    { name: 'Generador / Baterías', category: 'electrical', notes: 'Generador principal del hogar' },
  ],
  'Hall Entrada': [
    { name: 'Luces LED (7)', category: 'lighting' },
    { name: 'Luz Indirecta', category: 'lighting' },
    { name: 'Tomacorrientes (2)', category: 'electrical' },
  ],
  'Sala': [
    { name: 'Tomacorrientes (4)', category: 'electrical' },
  ],
  'Estudio': [
    { name: 'Luces LED (4)', category: 'lighting' },
    { name: 'Tomacorrientes (3)', category: 'electrical' },
    { name: 'Sistema de Automatización', category: 'automation' },
    { name: 'Wifi Access Point', category: 'networking' },
  ],
  'Comedor': [
    { name: 'Luces LED (6)', category: 'lighting' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'Tomacorriente (1)', category: 'electrical' },
  ],
  'Baño Visitas': [
    { name: 'Luces LED (4)', category: 'lighting' },
    { name: 'Extractor de Aire', category: 'hvac' },
  ],
  'Comedor Diario': [
    { name: 'Luces LED (10)', category: 'lighting' },
    { name: 'Luz Indirecta', category: 'lighting' },
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'TV', category: 'appliance' },
    { name: 'Tomacorrientes (4)', category: 'electrical' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'Cámara de Seguridad', category: 'security' },
  ],
  'Cocina': [
    { name: 'Refrigerador/Congelador', category: 'appliance' },
    { name: 'Luz Indirecta', category: 'lighting' },
    { name: 'Luces LED (14)', category: 'lighting' },
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'Tomacorrientes (6)', category: 'electrical' },
  ],
  'Garaje': [
    { name: 'Luces LED (6)', category: 'lighting' },
  ],
  'Escaleras Secundarias': [
    { name: 'Luces LED (4)', category: 'lighting' },
  ],
  'Cuarto Chofer': [
    { name: 'Luces LED (2)', category: 'lighting' },
    { name: 'Tomacorriente (1)', category: 'electrical' },
  ],
  'Cuarto Empleados': [
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'Tomacorrientes (3)', category: 'electrical' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'Focos LED (5)', category: 'lighting' },
  ],
  'Corredor Arriba': [
    { name: 'Focos LED (6)', category: 'lighting' },
  ],
  'Cuarto K&I': [
    { name: 'Split AC', category: 'hvac' },
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'Focos LED (9)', category: 'lighting' },
    { name: 'Tomacorrientes (5)', category: 'electrical' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'Cámara de Seguridad', category: 'security' },
  ],
  'Cuarto O': [
    { name: 'Split AC', category: 'hvac' },
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'LED (9)', category: 'lighting' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'Tomacorrientes (5)', category: 'electrical' },
    { name: 'Cámara de Seguridad', category: 'security' },
  ],
  'Estar': [
    { name: 'LED (10)', category: 'lighting' },
    { name: 'Luz Indirecta', category: 'lighting' },
    { name: 'Ventiladores de Techo (2)', category: 'hvac' },
    { name: 'Tomacorrientes (6)', category: 'electrical' },
    { name: 'Cámara de Seguridad', category: 'security' },
    { name: 'TV', category: 'appliance' },
    { name: 'Wifi Access Point', category: 'networking' },
  ],
  'Oficina': [
    { name: 'Luces LED (7)', category: 'lighting' },
    { name: 'Luz Indirecta', category: 'lighting' },
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'Tomacorrientes (5)', category: 'electrical' },
    { name: 'Wifi Access Point', category: 'networking' },
  ],
  'Puente': [
    { name: 'Luces LED (2)', category: 'lighting' },
  ],
  'Master': [
    { name: 'Luces LED (8)', category: 'lighting' },
    { name: 'Luz Indirecta', category: 'lighting' },
    { name: 'Ventilador de Techo', category: 'hvac' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'TV', category: 'appliance' },
    { name: 'Tomacorrientes (7)', category: 'electrical' },
  ],
  'Baño Master': [
    { name: 'Luces LED (10)', category: 'lighting' },
    { name: 'Tomacorrientes (5)', category: 'electrical' },
  ],
  'Afuera': [
    { name: 'Ventiladores (3)', category: 'hvac' },
    { name: 'Apliques (5)', category: 'lighting' },
    { name: 'Ice Maker', category: 'appliance' },
    { name: 'Bombas de Agua', category: 'plumbing' },
    { name: 'Luces LED (20)', category: 'lighting' },
    { name: 'TV', category: 'appliance' },
    { name: 'Wifi Access Point', category: 'networking' },
    { name: 'Cámaras de Seguridad (2)', category: 'security' },
    { name: 'Tomacorrientes (3)', category: 'electrical' },
  ],
  'Bodega Piscina': [
    { name: 'Congelador', category: 'appliance' },
    { name: 'Luces LED (2)', category: 'lighting' },
  ],
};

function generateHomeProfile(): HomeItem[] {
  const items: HomeItem[] = [];

  for (const [room, devices] of Object.entries(ROOMS)) {
    for (const device of devices) {
      items.push({
        id: randomUUID(),
        category: device.category,
        name: device.name,
        brand: null,
        model: null,
        install_date: null,
        warranty_expires: null,
        location: room,
        notes: device.notes || null,
      });
    }
  }

  return items;
}

function generateSQL(items: HomeItem[]): string {
  const lines = [
    '-- Auto-generated from Roam Research: October 27th, 2023.md',
    '-- Robert\'s house layout (generator/battery backup planning session)',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Total items: ${items.length}`,
    '',
  ];

  for (const item of items) {
    const notes = item.notes ? `'${item.notes.replace(/'/g, "''")}'` : 'NULL';
    lines.push(
      `INSERT INTO home_profile (id, category, name, brand, model, install_date, warranty_expires, location, notes)` +
      ` VALUES ('${item.id}', '${item.category}', '${item.name}', NULL, NULL, NULL, NULL, '${item.location}', ${notes});`
    );
  }

  return lines.join('\n');
}

function generateSummary(items: HomeItem[]): string {
  const byCategory: Record<string, number> = {};
  const byRoom: Record<string, number> = {};

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byRoom[item.location] = (byRoom[item.location] || 0) + 1;
  }

  const lines = [
    `## Home Profile Import Summary`,
    ``,
    `**Source:** Roam Research — October 27th, 2023`,
    `**Total items:** ${items.length}`,
    `**Rooms:** ${Object.keys(byRoom).length}`,
    ``,
    `### By Category`,
    ...Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `- ${cat}: ${count}`),
    ``,
    `### By Room`,
    ...Object.entries(byRoom)
      .sort((a, b) => b[1] - a[1])
      .map(([room, count]) => `- ${room}: ${count}`),
  ];

  return lines.join('\n');
}

// Run
const items = generateHomeProfile();
const sql = generateSQL(items);
const summary = generateSummary(items);

console.log(summary);
console.log('\n---\n');
console.log(`SQL output: ${items.length} INSERT statements`);
console.log('Write to: data/seed/home-profile-robert.sql');

// Write files
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const seedDir = join('/Users/colo/projects/Personal/Alma/data/seed');
mkdirSync(seedDir, { recursive: true });
writeFileSync(join(seedDir, 'home-profile-robert.sql'), sql);
writeFileSync(join(seedDir, 'home-profile-robert-summary.md'), summary);

console.log('\nDone. Files written to data/seed/');
