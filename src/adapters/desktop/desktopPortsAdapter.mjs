import {
  isDialogPort,
  isFileSystemPort,
  isPlatformInfoPort,
} from '../../ports/index.mjs';
import { createPortsAdapterBase } from '../shared/portsAdapterBase.mjs';

const PLATFORM_ID = 'node';

export function createDesktopPortsAdapter(electronAPI = {}, context = {}) {
  return createPortsAdapterBase({
    api: electronAPI,
    context,
    platformId: PLATFORM_ID,
    // Keep typed envelope contract visible at desktop entrypoint for parity guards:
    // code, op, reason, details.platformId, details.portId.
    validators: {
      isFileSystemPort,
      isDialogPort,
      isPlatformInfoPort,
    },
  });
}
