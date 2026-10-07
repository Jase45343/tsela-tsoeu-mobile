import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import {
  buildBook,
  buildPeriod,
  buildStudentAccount,
  DEFAULT_PAYMENT_METHODS,
  firstPeriodAmount,
  formatAckNumber,
  parts,
  periodsToGenerate,
  todayInMaseru,
  type CreditAdjustmentType,
  type FirstPeriodChoice,
  type ISODate,
  type Lang,
  type Lisente,
  type Student,
  type StudentAccount,
} from '@busledger/core';
import { getMeta, openDb, setMeta, wipe, type DB } from '../db/database';
import * as repo from './repo';
import type { LocalAck, LocalPayment, Snapshot } from './repo';
import { api, ApiError } from '../sync/api';
import { runSync, type RemoteSettings } from '../sync/engine';
import { checkPin, clearSession, getToken, rememberPin, setToken } from '../auth/session';

export type AppStatus = 'loading' | 'signedOut' | 'locked' | 'ready';
export type SyncProblem = null | 'network' | 'auth' | 'closed' | 'server';

export interface Profile {
  userId: string;
  name: string;
  phone: string;
  deviceId: string;
  ackPrefix: string;
}

export interface PaymentInput {
  studentId: string;
  amount: Lisente;
  method: string;
  paymentDate: ISODate;
  reference?: string;
  note?: string;
}

interface AuthUser { id: string; name: string; phone: string; businessName: string; dueDay: number; graceDays: number; paymentMethods: string[] }
interface AuthResponse { token: string; user: AuthUser }

const DAY = 86_400_000;
const EMPTY: Snapshot = { students: [], periods: [], payments: [], adjustments: [], acks: [], sync: [] };
const DEFAULT_SETTINGS: RemoteSettings = { businessName: '', dueDay: 1, graceDays: 7, paymentMethods: [...DEFAULT_PAYMENT_METHODS] };

function useAppState() {
  const dbRef = useRef<DB | null>(null);
  const [status, setStatus] = useState<AppStatus>('loading');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [settings, setSettings] = useState<RemoteSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lang, setLangState] = useState<Lang>('en');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProblem, setSyncProblem] = useState<SyncProblem>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lockMinutes, setLockMinutesState] = useState(5);
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const [today, setToday] = useState<ISODate>(todayInMaseru());

  const syncingRef = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const db = () => {
    if (!dbRef.current) throw new Error('Database not open');
    return dbRef.current;
  };

  /** Reload from disk, creating provisional periods if a month began while offline (FR-038). */
  const refresh = useCallback(async () => {
    const d = db();
    let snap = await repo.loadSnapshot(d);
    const now = todayInMaseru();
    setToday(now);
    const missing = periodsToGenerate(snap.students, snap.periods, now);
    if (missing.length) {
      for (const m of missing) {
        const p = buildPeriod({ id: randomUUID(), studentId: m.studentId, year: m.year, month: m.month, amountDue: m.amountDue, dueDay: settingsRef.current.dueDay, origin: 'provisional' });
        await repo.insertPeriod(d, p, 'local');
      }
      snap = await repo.loadSnapshot(d);
    }
    setSnapshot(snap);
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current || statusRef.current === 'signedOut' || statusRef.current === 'loading') return;
    const d = db();
    const token = await getToken();
    const deviceId = await getMeta(d, 'device_id');
    if (!token || !deviceId) { setSyncProblem('auth'); return; }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await runSync(d, token, deviceId);
      await setToken(res.token);
      setSettings(res.settings);
      setLastSyncAt(new Date().toISOString());
      setSyncProblem(null);
      setSyncMessage(null);
    } catch (e) {
      if (e instanceof ApiError) {
        setSyncProblem(e.status === 0 ? 'network' : e.status === 401 ? 'auth' : e.code === 'account_closed' ? 'closed' : 'server');
        setSyncMessage(e.message);
      } else {
        setSyncProblem('server');
        setSyncMessage(String(e));
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void sync(), 1500);
  }, [sync]);

  /* ----- startup ----- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await openDb();
      dbRef.current = d;
      const [p, s, l, ls, lm, method, token] = await Promise.all([
        getMeta(d, 'profile'), getMeta(d, 'settings'), getMeta(d, 'lang'), getMeta(d, 'last_sync_at'),
        getMeta(d, 'lock_minutes'), getMeta(d, 'last_method'), getToken(),
      ]);
      if (!alive) return;
      if (s) setSettings(JSON.parse(s));
      if (l === 'st' || l === 'en') setLangState(l);
      setLastSyncAt(ls);
      if (lm) setLockMinutesState(Number(lm));
      setLastMethod(method);
      await refresh();
      if (p && token) {
        setProfile(JSON.parse(p));
        setStatus('locked'); // a cold start always asks for the PIN (FR-002)
      } else {
        setStatus('signedOut');
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  /* ----- idle lock, foreground sync, periodic sync ----- */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        backgroundAt.current ??= Date.now();
        return;
      }
      const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
      backgroundAt.current = null;
      if (statusRef.current === 'ready' && away > lockMinutes * 60_000) setStatus('locked');
      if (dbRef.current) void refresh();
      if (statusRef.current === 'ready') scheduleSync();
    });
    const timer = setInterval(() => { if (statusRef.current === 'ready') void sync(); }, 120_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [lockMinutes, refresh, scheduleSync, sync]);

  /* ----- auth ----- */
  const completeAuth = useCallback(async (res: AuthResponse, pin: string) => {
    const d = db();
    const previous = await getMeta(d, 'user_id');
    if (previous && previous !== res.user.id) await wipe(d); // another operator's data never mixes
    await setToken(res.token);
    await rememberPin(pin);
    let deviceId = await getMeta(d, 'device_id');
    if (!deviceId) deviceId = randomUUID();
    const dev = await api<{ deviceId: string; ackPrefix: string }>('/v1/devices', { body: { id: deviceId, name: 'Android' }, token: res.token });
    const prof: Profile = { userId: res.user.id, name: res.user.name, phone: res.user.phone, deviceId, ackPrefix: dev.ackPrefix };
    const remote: RemoteSettings = { businessName: res.user.businessName, dueDay: res.user.dueDay, graceDays: res.user.graceDays, paymentMethods: res.user.paymentMethods };
    await setMeta(d, 'user_id', res.user.id);
    await setMeta(d, 'device_id', deviceId);
    await setMeta(d, 'profile', JSON.stringify(prof));
    await setMeta(d, 'settings', JSON.stringify(remote));
    setProfile(prof);
    setSettings(remote);
    setSyncProblem(null);
    setStatus('ready');
    statusRef.current = 'ready';
    await sync();
  }, [sync]);

  const register = useCallback(async (input: { name: string; phone: string; businessName: string; pin: string }) => {
    const res = await api<AuthResponse>('/v1/auth/register', { body: { id: randomUUID(), name: input.name, phone: input.phone, businessName: input.businessName, pin: input.pin } });
    await completeAuth(res, input.pin);
  }, [completeAuth]);

  const login = useCallback(async (phone: string, pin: string) => {
    await completeAuth(await api<AuthResponse>('/v1/auth/login', { body: { phone, pin } }), pin);
  }, [completeAuth]);

  const requestReset = useCallback(async (phone: string) => {
    await api('/v1/auth/reset/request', { body: { phone } });
  }, []);

  const confirmReset = useCallback(async (phone: string, code: string, newPin: string) => {
    await completeAuth(await api<AuthResponse>('/v1/auth/reset/confirm', { body: { phone, code, newPin } }), newPin);
  }, [completeAuth]);

  const unlock = useCallback(async (pin: string) => {
    if (!(await checkPin(pin))) return false;
    setStatus('ready');
    statusRef.current = 'ready';
    scheduleSync();
    return true;
  }, [scheduleSync]);

  const signOut = useCallback(async () => {
    await wipe(db());
    await clearSession();
    setProfile(null);
    setSnapshot(EMPTY);
    setLastSyncAt(null);
    setStatus('signedOut');
  }, []);

  /* ----- derived ----- */
  const operatorSettings = useMemo(() => ({ dueDay: settings.dueDay, graceDays: settings.graceDays }), [settings]);

  const accounts = useMemo<StudentAccount[]>(
    () => buildBook({ ...snapshot, today, settings: operatorSettings }),
    [snapshot, today, operatorSettings],
  );
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.student.id, a])), [accounts]);

  const unsyncedStudents = useMemo(() => {
    const s = new Set<string>();
    for (const i of snapshot.sync) if ((i.status === 'pending' || i.status === 'failed') && i.studentId) s.add(i.studentId);
    for (const a of accounts) if (a.hasProvisionalPeriods) s.add(a.student.id);
    return s;
  }, [snapshot.sync, accounts]);

  const pendingCount = snapshot.sync.filter((i) => i.status === 'pending').length;
  const failedCount = snapshot.sync.filter((i) => i.status === 'failed').length;
  const daysSinceSync = lastSyncAt ? Math.floor((Date.now() - Date.parse(lastSyncAt)) / DAY) : null;

  /* ----- writes ----- */
  const afterWrite = useCallback(async () => {
    await refresh();
    scheduleSync();
  }, [refresh, scheduleSync]);

  const addStudent = useCallback(async (s: Omit<Student, 'id' | 'status'>, choice: FirstPeriodChoice, custom?: Lisente) => {
    const d = db();
    const student: Student = { ...s, id: randomUUID(), status: 'active' };
    const { year, month } = parts(student.onboardedAt);
    const first = buildPeriod({
      id: randomUUID(), studentId: student.id, year, month,
      amountDue: firstPeriodAmount(student.monthlyFee, choice, custom), dueDay: settings.dueDay, origin: 'onboarding',
    });
    await d.withExclusiveTransactionAsync(async (tx) => {
      await repo.saveStudent(tx, student);
      await repo.insertPeriod(tx, first, 'pending');
    });
    await afterWrite();
    return student.id;
  }, [afterWrite, settings.dueDay]);

  const updateStudent = useCallback(async (s: Student) => {
    await repo.saveStudent(db(), s);
    await afterWrite();
  }, [afterWrite]);

  const setPeriodCancelled = useCallback(async (periodId: string, cancelled: boolean) => {
    await repo.setPeriodCancelled(db(), periodId, cancelled);
    await afterWrite();
  }, [afterWrite]);

  /** FR-011/FR-022: save the record and its acknowledgement in one transaction. */
  const writePayment = useCallback(async (input: PaymentInput, opts: { correctsPaymentId?: string; voidOriginal?: { id: string; reason: string } } = {}) => {
    const d = db();
    if (!profile) throw new Error('Not signed in');
    const student = snapshot.students.find((s) => s.id === input.studentId);
    if (!student) throw new Error('Unknown student');
    const nowIso = new Date().toISOString();
    const payment: LocalPayment = {
      id: randomUUID(), studentId: input.studentId, amount: input.amount, method: input.method, paymentDate: input.paymentDate,
      reference: input.reference?.trim() || null, note: input.note?.trim() || null, source: 'manual', createdAt: nowIso,
      idempotencyKey: `${profile.deviceId}:${randomUUID()}`, acknowledgementNumber: null,
      longOffline: lastSyncAt ? Date.now() - Date.parse(lastSyncAt) > 30 * DAY : false, correctsPaymentId: opts.correctsPaymentId ?? null,
    };
    const otherPayments = snapshot.payments
      .filter((p) => p.studentId === student.id)
      .map((p) => (opts.voidOriginal && p.id === opts.voidOriginal.id ? { ...p, voidedAt: nowIso } : p));
    const after = buildStudentAccount({
      student,
      periods: snapshot.periods.filter((p) => p.studentId === student.id),
      payments: [...otherPayments, payment],
      adjustments: snapshot.adjustments.filter((a) => a.studentId === student.id),
      today, settings: operatorSettings,
    });
    const ackId = randomUUID();
    await d.withExclusiveTransactionAsync(async (tx) => {
      const seq = Number((await getMeta(tx, 'ack_seq')) ?? '0') + 1;
      const number = formatAckNumber(profile.ackPrefix, seq);
      if (opts.voidOriginal) await repo.voidPayment(tx, opts.voidOriginal.id, opts.voidOriginal.reason, nowIso);
      await repo.insertPayment(tx, { ...payment, acknowledgementNumber: number });
      const ack: LocalAck = { id: ackId, paymentId: payment.id, number, balanceShown: after.net, balanceAsOf: nowIso, balanceProvisional: true, generatedAt: nowIso, sharedVia: null };
      await repo.insertAck(tx, ack);
      await setMeta(tx, 'ack_seq', String(seq));
      await setMeta(tx, 'last_method', input.method);
    });
    setLastMethod(input.method);
    await afterWrite();
    return payment.id;
  }, [afterWrite, lastSyncAt, operatorSettings, profile, snapshot, today]);

  const recordPayment = useCallback((input: PaymentInput) => writePayment(input), [writePayment]);

  const voidPayment = useCallback(async (paymentId: string, reason: string) => {
    await repo.voidPayment(db(), paymentId, reason, new Date().toISOString());
    await afterWrite();
  }, [afterWrite]);

  const correctPayment = useCallback(
    (originalId: string, reason: string, input: PaymentInput) => writePayment(input, { correctsPaymentId: originalId, voidOriginal: { id: originalId, reason } }),
    [writePayment],
  );

  const addCreditAdjustment = useCallback(async (studentId: string, type: CreditAdjustmentType, amount: Lisente, reason: string) => {
    const acc = accountById.get(studentId);
    if (!acc || amount > acc.credit) throw new Error('exceeds_credit');
    await repo.insertAdjustment(db(), { id: randomUUID(), studentId, type, amount, reason, createdAt: new Date().toISOString() });
    await afterWrite();
  }, [accountById, afterWrite]);

  const markAckShared = useCallback(async (ackId: string, via: string) => {
    await repo.markAckShared(db(), ackId, via);
    await afterWrite();
  }, [afterWrite]);

  const retryFailed = useCallback(async () => {
    await repo.retryFailed(db());
    await refresh();
    await sync();
  }, [refresh, sync]);

  /* ----- settings ----- */
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (dbRef.current) void setMeta(dbRef.current, 'lang', l);
  }, []);

  const setLockMinutes = useCallback((m: number) => {
    setLockMinutesState(m);
    if (dbRef.current) void setMeta(dbRef.current, 'lock_minutes', String(m));
  }, []);

  const updateRemoteSettings = useCallback(async (patch: Partial<RemoteSettings> & { name?: string }) => {
    const token = await getToken();
    const res = await api<AuthUser>('/v1/settings', { method: 'PUT', body: patch, token });
    const next: RemoteSettings = { businessName: res.businessName, dueDay: res.dueDay, graceDays: res.graceDays, paymentMethods: res.paymentMethods };
    await setMeta(db(), 'settings', JSON.stringify(next));
    setSettings(next);
    if (profile && res.name !== profile.name) {
      const p = { ...profile, name: res.name };
      await setMeta(db(), 'profile', JSON.stringify(p));
      setProfile(p);
    }
  }, [profile]);

  const closeAccount = useCallback(async () => {
    await api('/v1/account/close', { body: {}, token: await getToken() });
    await signOut();
  }, [signOut]);

  return {
    status, lang, setLang, profile, settings, today, lastMethod, lockMinutes, setLockMinutes,
    snapshot, accounts, accountById, unsyncedStudents,
    sync, syncing, syncProblem, syncMessage, lastSyncAt, daysSinceSync, pendingCount, failedCount, retryFailed,
    register, login, requestReset, confirmReset, unlock, signOut, closeAccount, updateRemoteSettings,
    addStudent, updateStudent, setPeriodCancelled, recordPayment, voidPayment, correctPayment, addCreditAdjustment, markAckShared,
  };
}

export type App = ReturnType<typeof useAppState>;
const Ctx = createContext<App | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): App {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
