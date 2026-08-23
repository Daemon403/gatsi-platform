import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
const peppers = [process.env.TOKEN_PEPPER_CURRENT, process.env.TOKEN_PEPPER_PREVIOUS].filter(Boolean);
if (!peppers.length) { if (process.env.NODE_ENV === 'production') throw new Error('TOKEN_PEPPER_CURRENT is required in production.'); peppers.push('development-only-change-me'); }
export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token, pepper = peppers[0]) => createHmac('sha256', pepper).update(token).digest('hex');
export const tokenHashes = (token) => peppers.map((pepper) => tokenHash(token, pepper));
export const passwordHash = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
export const passwordValid = (password, stored) => { const [salt, hash] = String(stored).split(':'); if (!salt || !hash) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); };
export const passwordAcceptable = (password) => typeof password === 'string' && password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
export const safeUser = ({ password_hash, passwordHash: _passwordHash, ...user }) => user;
