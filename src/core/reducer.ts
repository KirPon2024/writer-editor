import type { CoreCommand, CoreState } from "./contracts";

export function reduce(state: CoreState, command: CoreCommand): CoreState;
export function reduce(state: CoreState, command: CoreCommand): CoreState {
  throw new Error("CORE reducer not implemented");
}
