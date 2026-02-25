/**
 * Home maintenance module — the positioning wedge (D-3).
 * ADR-005: Shared knowledge in Postgres + pgvector.
 * Per-family schedules in family SQLite.
 *
 * NBR-2: All maintenance schedules grounded in manufacturer data, not LLM-generated.
 *
 * Job Story: "When I buy a home and realize I have no idea what maintenance is needed,
 * I want to tell an assistant what I own and have it proactively tell me what to do,
 * so I can prevent $5K+ emergency repairs without becoming a maintenance expert."
 */

import type Database from "better-sqlite3";

export class MaintenanceService {
  /** Get overdue maintenance tasks for a family */
  getOverdue(familyDb: Database.Database): MaintenanceTask[] {
    const rows = familyDb
      .prepare(
        `SELECT ms.*, hp.name as item_name, hp.category
         FROM maintenance_schedule ms
         JOIN home_profile hp ON ms.home_item_id = hp.id
         WHERE ms.next_due <= date('now')
         ORDER BY ms.next_due ASC`,
      )
      .all() as MaintenanceTask[];

    return rows;
  }

  /** Get upcoming maintenance tasks for next N days */
  getUpcoming(familyDb: Database.Database, days: number): MaintenanceTask[] {
    const rows = familyDb
      .prepare(
        `SELECT ms.*, hp.name as item_name, hp.category
         FROM maintenance_schedule ms
         JOIN home_profile hp ON ms.home_item_id = hp.id
         WHERE ms.next_due BETWEEN date('now') AND date('now', '+' || ? || ' days')
         ORDER BY ms.next_due ASC`,
      )
      .all(days) as MaintenanceTask[];

    return rows;
  }

  /** Add a home item and auto-generate maintenance schedule from KB */
  async addHomeItem(
    familyDb: Database.Database,
    item: NewHomeItem,
  ): Promise<string> {
    // TODO: look up maintenance schedule from shared KB (pgvector)
    // based on item category, brand, model, age
    // Insert into home_profile and maintenance_schedule
    return "";
  }
}

export interface MaintenanceTask {
  id: string;
  home_item_id: string;
  item_name: string;
  category: string;
  task: string;
  next_due: string;
  priority: string;
}

interface NewHomeItem {
  category: string;
  name: string;
  brand?: string;
  model?: string;
  installDate?: string;
  warrantyExpires?: string;
  location?: string;
}
