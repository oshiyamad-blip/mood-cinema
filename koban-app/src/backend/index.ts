import { CLOUD_ENABLED } from './config';
import { localBackend } from './local';
import { cloudBackend } from './supabase';
import type { Backend } from './types';

export const backend: Backend = CLOUD_ENABLED ? cloudBackend : localBackend;
