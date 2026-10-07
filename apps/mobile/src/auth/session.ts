import * as SecureStore from 'expo-secure-store';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';

const TOKEN = 'busledger.token';
const PIN = 'busledger.pinverifier';

export const getToken = () => SecureStore.getItemAsync(TOKEN);
export const setToken = (t: string) => SecureStore.setItemAsync(TOKEN, t);

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

async function stretch(pin: string, salt: string): Promise<string> {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < 300; i++) h = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}${h}`);
  return h;
}

/** Stores a salted, stretched verifier so the idle lock (FR-002) works offline. The PIN itself is never stored. */
export async function rememberPin(pin: string): Promise<void> {
  const salt = toHex(getRandomBytes(16));
  await SecureStore.setItemAsync(PIN, `${salt}$${await stretch(pin, salt)}`);
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN);
  if (!stored) return false;
  const [salt, hash] = stored.split('$');
  return !!salt && (await stretch(pin, salt)) === hash;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN);
  await SecureStore.deleteItemAsync(PIN);
}
