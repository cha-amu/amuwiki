import { resolveConfig } from './domain/config';

export const config = resolveConfig(import.meta.env, window.location.href);
