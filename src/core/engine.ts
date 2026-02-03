import type { CoreCommand, CoreState } from "./contracts";
import { reduce } from "./reducer";

export function run(state: CoreState, command: CoreCommand): CoreState {
  return reduce(state, command);
}
