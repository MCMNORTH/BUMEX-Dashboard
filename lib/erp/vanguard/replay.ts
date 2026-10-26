import { canOpenRoom, canUseModule, COMMON_MODULES, withIdSource, type State } from "@/lib/erp/engine";
import { commandModules, vanguardCommands, type VanguardCommand } from "@/lib/erp/vanguard/commands";
import { stateOf, type VanguardChange } from "@/lib/erp/vanguard/record";

// The server's half of record.ts: the recorded engine calls, run again on the state the server loaded for the
// person (their own session, role and entities). The browser's result is never taken as such.

export class ReplayError extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function idsOf(state: State): Set<string> {
  const ids = new Set<string>();
  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) if (row && typeof row === "object" && "id" in row && typeof row.id === "string") ids.add(row.id);
  }
  return ids;
}

// The entities whose rows a call added, changed or removed (a bank line is its account's entity's). The engine never
// changes a row in place: an untouched row is the same object before and after.
function touchedEntities(before: State, after: State): Set<string> {
  const accountEntity = new Map([...before.bankAccounts, ...after.bankAccounts].map((a) => [a.id, a.entityId]));
  const entityOf = (row: unknown) => {
    if (!row || typeof row !== "object") return undefined;
    if ("entityId" in row && typeof row.entityId === "string") return row.entityId;
    return "bankAccountId" in row && typeof row.bankAccountId === "string" ? accountEntity.get(row.bankAccountId) : undefined;
  };
  const touched = new Set<string>();
  for (const key of Object.keys(after) as (keyof State)[]) {
    const was = before[key];
    const now = after[key];
    if (was === now || !Array.isArray(was) || !Array.isArray(now)) continue;
    const kept = new Set<unknown>(now);
    const had = new Set<unknown>(was);
    for (const row of now) if (!had.has(row)) touched.add(entityOf(row) ?? "");
    for (const row of was) if (!kept.has(row)) touched.add(entityOf(row) ?? "");
  }
  touched.delete("");
  return touched;
}

// newId: for a call that needs more ids than the browser made (its state was older than the server's)
export function replay(base: State, change: VanguardChange, newId: () => string): State {
  if (!change || !Array.isArray(change.calls) || change.calls.length === 0 || change.calls.length > 100) throw new ReplayError("Modification vide ou trop longue.");

  const used = idsOf(base);
  const states: State[] = [base];
  for (const call of change.calls) {
    const command = typeof call?.name === "string" && Object.hasOwn(vanguardCommands, call.name)
      ? (vanguardCommands[call.name as VanguardCommand] as (state: State, ...args: unknown[]) => unknown)
      : null;
    if (!command) throw new ReplayError("Opération inconnue.");
    const input = Number.isInteger(call.input) ? states[call.input] : undefined;
    if (!input || !Array.isArray(call.args) || !Array.isArray(call.ids)) throw new ReplayError("Modification mal formée.");
    const room = commandModules[call.name as VanguardCommand];
    if (room && !canUseModule(input, room)) throw new ReplayError("Ce module n'est pas ouvert à votre accès ERP.");
    // new rows only: an id the person could see already, or one used twice, is refused
    for (const id of call.ids) {
      if (typeof id !== "string" || !uuid.test(id) || used.has(id)) throw new ReplayError("Identifiant refusé.");
      used.add(id);
    }
    const ids = [...call.ids];
    const output = stateOf(withIdSource(() => ids.shift() ?? newId(), () => command(input, ...call.args)));
    if (!output) throw new ReplayError("Opération sans résultat.");
    // a module can be open on one entity and not on another (0009): every entity the call touched must open it
    if (room && room !== "penthouse" && !COMMON_MODULES.includes(room)) {
      for (const entityId of touchedEntities(input, output)) {
        if (!canOpenRoom(input, entityId, room)) throw new ReplayError("Ce module n'est pas ouvert à votre accès sur cette entité.");
      }
    }
    states.push(output);
  }

  const result = Number.isInteger(change.result) && change.result > 0 ? states[change.result] : undefined;
  if (!result) throw new ReplayError("Modification mal formée.");
  return result;
}
