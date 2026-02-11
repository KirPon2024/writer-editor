import type { CoreCommand, CoreReduceResult, CoreState } from "./contracts";
import { createInitialCoreState, reduceCoreState } from "./runtime.mjs";

export function reduce(state: CoreState, command: CoreCommand): CoreState;
export function reduce(state: CoreState, command: CoreCommand): CoreState {
  return reduceWithResult(state, command).state;
}

export function reduceWithResult(state: CoreState, command: CoreCommand): CoreReduceResult {
  const base = state && typeof state === "object" ? state : createInitialCoreState();
  const result = reduceCoreState(base, command);
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      state: createInitialCoreState(),
      stateHash: "",
      error: {
        code: "E_CORE_INVALID_REDUCER_RESULT",
        op: "core.reduce",
        reason: "INVALID_REDUCER_RESULT",
      },
    };
  }
  return result as CoreReduceResult;
}
