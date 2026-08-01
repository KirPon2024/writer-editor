import {
  hashCoreDomainEvents,
  validateCoreDomainEvent,
} from '../core/domainEvents.mjs';

export const DOMAIN_EVENT_PRODUCT_PORT_SCHEMA_VERSION = 'yalken.product.domainEventPort.v1';

export function createCoreDomainEventProductPort() {
  return Object.freeze({
    schemaVersion: DOMAIN_EVENT_PRODUCT_PORT_SCHEMA_VERSION,
    authority: Object.freeze({
      productAdapter: true,
      validatesCoreDomainEvents: true,
      hashesCoreDomainEvents: true,
      network: false,
      storage: false,
      secondJournal: false,
      commandDispatch: false,
    }),
    validateCoreDomainEvent(event) {
      return validateCoreDomainEvent(event);
    },
    hashCoreDomainEvents(events) {
      return hashCoreDomainEvents(events);
    },
  });
}
