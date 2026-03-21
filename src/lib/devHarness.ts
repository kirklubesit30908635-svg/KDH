export function assertDevOnly() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev Harness disabled in production.');
  }
}

export function mask(value: string, keep = 6) {
  if (!value) return '';
  if (value.length <= keep) return value;
  return value.slice(0, keep) + '…';
}
