import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://ewpozdsrynvueepgcmwy.supabase.co';
const supabaseAnonKey = 'sb_publishable_xezWr5JSu9-nbxXULI_pQQ_5rUFfyH-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);