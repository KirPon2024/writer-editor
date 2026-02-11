// Public re-export surface for contracts.
// No runtime logic. No platform imports.

export type { CoreCommand } from "./core-command.contract";
export type { CoreEvent } from "./core-event.contract";
export type { CoreStateSnapshot } from "./core-state.contract";
export type { FileSystemPort } from "./filesystem-port.contract";
export type { DialogPort } from "./dialog-port.contract";
export type { PlatformInfoPort } from "./platform-info-port.contract";

export type {
  RuntimeExecutionContract,
  RuntimeEffectsContract,
  RuntimeQueueContract,
  RuntimeTraceContract,
} from "./runtime";
