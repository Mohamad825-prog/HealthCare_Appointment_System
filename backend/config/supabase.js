import { createClient } from '@supabase/supabase-js';
import { getRequiredEnv } from './env.js';

const supabaseUrl = getRequiredEnv('SUPABASE_URL');
const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

let supabaseHost;

try {
    supabaseHost = new URL(supabaseUrl).host;
} catch {
    throw new Error('Invalid SUPABASE_URL. Expected a full URL like https://your-project-ref.supabase.co');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
export { supabaseHost };
