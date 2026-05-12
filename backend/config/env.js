import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const backendEnvPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: backendEnvPath, quiet: true });

export function getRequiredEnv(name) {
    const value = String(process.env[name] || "").trim();
    if (!value) {
        throw new Error(`Missing ${name} in ${backendEnvPath}`);
    }
    return value;
}
