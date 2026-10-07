import { z } from 'zod';
import { isISODate } from '@busledger/core';

export const uuid = z.string().uuid();
export const isoDate = z.string().refine(isISODate, 'Expected a date YYYY-MM-DD');
export const isoDateTime = z.string().datetime({ offset: true });
export const lisente = z.number().int().nonnegative().max(1_000_000_000_00);
export const pin = z.string().regex(/^\d{6,8}$/, 'PIN must be 6 to 8 digits');

export const RegisterBody = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(120),
  phone: z.string().min(8).max(20),
  email: z.string().email().max(200).optional().nullable(),
  businessName: z.string().trim().max(120).optional().default(''),
  pin,
});

export const LoginBody = z.object({ phone: z.string().min(8).max(20), pin: z.string().min(1).max(20) });
export const ResetRequestBody = z.object({ phone: z.string().min(8).max(20) });
export const ResetConfirmBody = z.object({ phone: z.string().min(8).max(20), code: z.string().regex(/^\d{6}$/), newPin: pin });
export const DeviceBody = z.object({ id: uuid, name: z.string().max(80).optional() });

export const SettingsBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  businessName: z.string().trim().max(120).optional(),
  email: z.string().email().max(200).nullable().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  graceDays: z.number().int().min(0).max(60).optional(),
  paymentMethods: z.array(z.string().trim().min(1).max(40)).min(1).max(12).optional(),
});

export const StudentDTO = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(120),
  parentName: z.string().trim().min(1).max(120),
  parentPhone: z.string().min(8).max(20),
  school: z.string().trim().max(120).default(''),
  pickupLocation: z.string().trim().max(200).default(''),
  dropoffLocation: z.string().trim().max(200).default(''),
  monthlyFee: lisente,
  onboardedAt: isoDate,
  status: z.enum(['active', 'inactive']),
});

export const PeriodPush = z.object({
  id: uuid,
  studentId: uuid,
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amountDue: lisente,
  cancelled: z.boolean(),
  origin: z.enum(['server', 'onboarding', 'provisional']),
});

export const PaymentDTO = z.object({
  id: uuid,
  studentId: uuid,
  amount: lisente.refine((v) => v > 0, 'Amount must be more than zero'),
  method: z.string().trim().min(1).max(40),
  paymentDate: isoDate,
  reference: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  source: z.enum(['manual', 'voice']),
  createdAt: isoDateTime,
  idempotencyKey: z.string().min(8).max(100),
  acknowledgementNumber: z.string().max(40).nullable().optional(),
  voidedAt: isoDateTime.nullable().optional(),
  voidReason: z.string().trim().max(300).nullable().optional(),
  correctsPaymentId: uuid.nullable().optional(),
  longOffline: z.boolean().optional().default(false),
});

export const CreditAdjustmentDTO = z.object({
  id: uuid,
  studentId: uuid,
  type: z.enum(['refunded_outside_app', 'written_off', 'other']),
  amount: lisente.refine((v) => v > 0, 'Amount must be more than zero'),
  reason: z.string().trim().min(1).max(300),
  createdAt: isoDateTime,
});

export const AcknowledgementDTO = z.object({
  id: uuid,
  paymentId: uuid,
  number: z.string().min(3).max(40),
  balanceShown: z.number().int(),
  balanceAsOf: isoDateTime,
  balanceProvisional: z.boolean(),
  generatedAt: isoDateTime,
  sharedVia: z.string().max(40).nullable().optional(),
});

/** Records are validated one by one so a single bad record never blocks the rest. */
export const SyncBody = z.object({
  deviceId: uuid,
  cursor: z.number().int().nonnegative(),
  push: z
    .object({
      students: z.array(z.unknown()).max(2000).default([]),
      periods: z.array(z.unknown()).max(5000).default([]),
      payments: z.array(z.unknown()).max(5000).default([]),
      creditAdjustments: z.array(z.unknown()).max(1000).default([]),
      acknowledgements: z.array(z.unknown()).max(5000).default([]),
    })
    .default({ students: [], periods: [], payments: [], creditAdjustments: [], acknowledgements: [] }),
});

export type StudentIn = z.infer<typeof StudentDTO>;
export type PeriodIn = z.infer<typeof PeriodPush>;
export type PaymentIn = z.infer<typeof PaymentDTO>;
export type AdjustmentIn = z.infer<typeof CreditAdjustmentDTO>;
export type AckIn = z.infer<typeof AcknowledgementDTO>;
