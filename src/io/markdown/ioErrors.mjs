export class MarkdownIoError extends Error {
  constructor(code, reason, details) {
    super(typeof reason === 'string' && reason.length > 0 ? reason : 'io_failure');
    this.name = 'MarkdownIoError';
    this.code = typeof code === 'string' && code.length > 0 ? code : 'E_IO_INTERNAL';
    this.reason = typeof reason === 'string' && reason.length > 0 ? reason : 'io_failure';
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      this.details = details;
    }
  }
}

export function createMarkdownIoError(code, reason, details) {
  return new MarkdownIoError(code, reason, details);
}

export function asMarkdownIoError(error, fallbackCode, fallbackReason, details) {
  if (error instanceof MarkdownIoError) return error;
  const safeDetails = {
    ...(details && typeof details === 'object' && !Array.isArray(details) ? details : {}),
  };
  if (error && typeof error.message === 'string' && error.message.length > 0) {
    safeDetails.message = error.message;
  }
  return createMarkdownIoError(fallbackCode, fallbackReason, safeDetails);
}
