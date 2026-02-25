/**
 * Tasks module — task tracking, reminders, recurrence.
 */

import type { UserService } from "../users/index.js";

export class TaskService {
  constructor(private users: UserService) {}

  /** Get pending tasks for a user's family (optionally filtered to one user) */
  async getPending(familyId: string, userId?: string): Promise<Task[]> {
    const familyDb = this.users.getFamilyDb(familyId);
    const query = userId
      ? `SELECT * FROM items WHERE status = 'active' AND type IN ('task', 'reminder')
         AND (assigned_to = ? OR assigned_to IS NULL OR user_id = ?)
         ORDER BY due_at ASC NULLS LAST`
      : `SELECT * FROM items WHERE status = 'active' AND type IN ('task', 'reminder')
         ORDER BY due_at ASC NULLS LAST`;

    const rows = userId
      ? (familyDb.prepare(query).all(userId, userId) as Array<Record<string, unknown>>)
      : (familyDb.prepare(query).all() as Array<Record<string, unknown>>);

    return rows.map(rowToTask);
  }

  /** Get overdue tasks for a family */
  async getOverdue(familyId: string): Promise<Task[]> {
    const familyDb = this.users.getFamilyDb(familyId);
    const rows = familyDb
      .prepare(
        `SELECT * FROM items
         WHERE status = 'active' AND due_at IS NOT NULL
         AND due_at < datetime('now')
         ORDER BY due_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(rowToTask);
  }

  /** Mark task as done. Handles recurrence if set. */
  async complete(familyId: string, taskId: string): Promise<void> {
    const familyDb = this.users.getFamilyDb(familyId);
    familyDb
      .prepare(
        "UPDATE items SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .run(taskId);

    // TODO: if recurrence is set, create next occurrence
  }

  /** Create a task */
  async create(
    familyId: string,
    task: { userId: string; title: string; dueAt?: Date; assignedTo?: string; type?: string },
  ): Promise<string> {
    const familyDb = this.users.getFamilyDb(familyId);
    const id = crypto.randomUUID();

    familyDb
      .prepare(
        `INSERT INTO items (id, user_id, type, title, status, due_at, assigned_to)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        id,
        task.userId,
        task.type ?? "task",
        task.title,
        task.dueAt?.toISOString() ?? null,
        task.assignedTo ?? null,
      );

    return id;
  }
}

export interface Task {
  id: string;
  title: string;
  status: "active" | "done" | "dismissed";
  dueAt: Date | null;
  assignedTo: string | null;
  createdAt: Date;
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as Task["status"],
    dueAt: row.due_at ? new Date(row.due_at as string) : null,
    assignedTo: (row.assigned_to as string) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}
