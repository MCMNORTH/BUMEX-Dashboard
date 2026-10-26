import "server-only";

import { logActivity } from "@/lib/activity/service";
import { asPerson, selectOne } from "@/lib/work/db";

// A ticket moved to another day (the Week tab): its due date, written in the person's session (the rules decide).
export async function updateTaskDueDate(ticketId: string, dueDate: string | null, actorUserId: string) {
  const previousTask = await asPerson(async (tx) => {
    const previous = await selectOne<{ due_date: string | null }>(tx, "select due_date from erp.task where id = $1::uuid", [ticketId]);
    const updated = await tx.run("update erp.task set due_date = $2::date where id = $1::uuid", [ticketId, dueDate]);
    if (!updated) throw new Error("You cannot reschedule this ticket.");
    return previous;
  });

  await logActivity({
    userId: actorUserId,
    action: dueDate ? `Moved task to ${dueDate}` : "Moved task to unscheduled",
    entityType: "task",
    entityId: ticketId,
    metadata: { kind: "due_date_change", field: "due_date", from: previousTask?.due_date ?? null, to: dueDate },
  });
}
