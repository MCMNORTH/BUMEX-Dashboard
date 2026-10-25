import { withIdSource, type State } from "@/lib/erp/engine";

// BUMEX Vanguard changes its state the way the prototype did: a screen calls the engine inside the store's apply().
// On real data the store records those engine calls (which state each ran on, its arguments, the ids it made) and
// the server replays them with the same engine on the state it loads itself, then writes the result (run.ts).
// The screens and the engine stay as the ERP team delivered them.

export type VanguardCall = {
  name: string;
  input: number; // the state the call ran on: 0 = the state before apply(), n = the output of the n-th call
  args: unknown[];
  ids: string[]; // the ids the call made, in order
};

export type VanguardChange = {
  calls: VanguardCall[];
  result: number; // the state apply() kept
};

function isState(value: unknown): value is State {
  return typeof value === "object" && value !== null && "entities" in value && "session" in value && "entries" in value;
}

// Engine changes return the state, [state, record] or { state, ... } (requestDeletion).
export function stateOf(value: unknown): State | null {
  if (isState(value)) return value;
  if (Array.isArray(value) && isState(value[0])) return value[0];
  if (typeof value === "object" && value !== null && "state" in value && isState(value.state)) return value.state;
  return null;
}

let recording: { states: Map<State, number>; calls: VanguardCall[]; ids: string[] } | null = null;

// An engine change as the screens import it (domain.ts): recorded when it runs on a state of the current apply().
export function recorded<A extends unknown[], R>(name: string, change: (state: State, ...args: A) => R): (state: State, ...args: A) => R {
  return (state, ...args) => {
    const current = recording;
    const input = current?.states.get(state);
    if (!current || input === undefined) return change(state, ...args);

    // copied now: a screen may reuse the objects it passed
    const copy = structuredClone(args);
    const before = current.ids.length;
    let result: R;
    try {
      result = change(state, ...args);
    } catch (error) {
      current.ids.length = before; // ids made by a call that failed are not replayed
      throw error;
    }
    const output = stateOf(result);
    if (output && output !== state && !current.states.has(output)) {
      current.calls.push({ name, input, args: copy, ids: current.ids.slice(before) });
      current.states.set(output, current.calls.length);
    }
    return result;
  };
}

// Runs one apply() of the store and returns what it did, or null when it changed nothing.
export function record<R>(base: State, run: (state: State) => R): { result: R; change: VanguardChange | null } {
  if (recording) throw new Error("A change is already being recorded.");
  const current = { states: new Map<State, number>([[base, 0]]), calls: [] as VanguardCall[], ids: [] as string[] };
  recording = current;
  try {
    const result = withIdSource(
      () => {
        const id = crypto.randomUUID();
        current.ids.push(id);
        return id;
      },
      () => run(base),
    );
    const final = stateOf(result);
    if (!final || final === base) return { result, change: null };
    const index = current.states.get(final);
    if (index === undefined) {
      throw new Error("Cette modification ne passe pas par le moteur : elle ne peut pas être enregistrée.");
    }
    return { result, change: { calls: current.calls, result: index } };
  } finally {
    recording = null;
  }
}
