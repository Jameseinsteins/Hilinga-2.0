/**
 * Payment Service - Handles all payment processing, transaction management, and state
 * Supports multiple payment methods: card, digital wallet, cash on arrival
 * Implements retry logic with exponential backoff and offline queueing
 * Supabase-only (Phase 2: Firebase uid = TEXT id, no Firestore fallback)
 */

// Firestore removed — Supabase-only (Phase 2)
import { isSupabaseConfigured, supabase, withSupabaseTimeout } from '@/lib/supabase';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.');
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled' | 'partially_refunded';
export type BookingStatus = 'draft' | 'awaiting_payment' | 'paid' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentMethod = 'credit_card' | 'debit_card' | 'digital_wallet' | 'bank_transfer' | 'cash_on_arrival';

export interface PaymentTransaction {
  id: string;
  bookingId: string;
  userId: string;
  amount: number; // in cents
  currency: string; // ISO currency code
  status: PaymentStatus;
  method: PaymentMethod;
  transactionId?: string; // external processor ID
  receiptUrl?: string;
  failureReason?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number; // timestamp
  updatedAt: number;
  processedAt?: number;
  refundedAt?: number;
}

export interface Booking {
  id: string;
  userId: string;
  tripPlanId: string;
  status: BookingStatus;
  participants: number;
  startDate: string;
  endDate: string;
  pricing: PriceBreakdown;
  paymentId?: string;
  paymentStatus: PaymentStatus;
  confirmationNumber: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  cancelledAt?: number;
}

export interface PriceBreakdown {
  basePrice: number;
  taxes: number;
  fees: number;
  discount?: number;
  total: number;
  currencyCode: string;
  breakdown: Array<{ label: string; amount: number }>;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  bookingId?: string;
  confirmationNumber?: string;
  message?: string;
  timestamp: number;
}

export interface PaymentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

// ============================================================================
// Supabase row types & converters
// ============================================================================

type SupabasePaymentRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  method: string | null;
  transaction_id: string | null;
  receipt_url: string | null;
  failure_reason: string | null;
  retry_count: number | null;
  max_retries: number | null;
  processed_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  sync_state: string | null;
};

type SupabaseBookingRow = {
  id: string;
  user_id: string;
  trip_plan_id: string | null;
  status: string | null;
  participants: number | null;
  start_date: string | null;
  end_date: string | null;
  pricing: unknown | null;
  payment_id: string | null;
  payment_status: string | null;
  confirmation_number: string | null;
  notes: string | null;
  created_at: string | null;
  cancelled_at: string | null;
  updated_at: string | null;
  sync_state: string | null;
};

function toSupabasePaymentRow(payment: PaymentTransaction): Record<string, unknown> {
  return {
    id: payment.id,
    user_id: payment.userId,
    booking_id: payment.bookingId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    transaction_id: payment.transactionId ?? null,
    receipt_url: payment.receiptUrl ?? null,
    failure_reason: payment.failureReason ?? null,
    retry_count: payment.retryCount,
    max_retries: payment.maxRetries,
    processed_at: payment.processedAt != null ? String(payment.processedAt) : null,
    refunded_at: payment.refundedAt != null ? String(payment.refundedAt) : null,
    created_at: String(payment.createdAt),
    updated_at: String(payment.updatedAt),
    sync_state: 'synced',
  };
}

function fromSupabasePaymentRow(row: SupabasePaymentRow): PaymentTransaction {
  return {
    id: row.id,
    bookingId: row.booking_id ?? '',
    userId: row.user_id,
    amount: row.amount ?? 0,
    currency: row.currency ?? 'USD',
    status: (row.status as PaymentStatus) ?? 'pending',
    method: (row.method as PaymentMethod) ?? 'credit_card',
    transactionId: row.transaction_id ?? undefined,
    receiptUrl: row.receipt_url ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    retryCount: row.retry_count ?? 0,
    maxRetries: row.max_retries ?? 3,
    createdAt: row.created_at ? Number(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Number(row.updated_at) : Date.now(),
    processedAt: row.processed_at ? Number(row.processed_at) : undefined,
    refundedAt: row.refunded_at ? Number(row.refunded_at) : undefined,
  };
}

function toSupabaseBookingRow(booking: Booking): Record<string, unknown> {
  return {
    id: booking.id,
    user_id: booking.userId,
    trip_plan_id: booking.tripPlanId,
    status: booking.status,
    participants: booking.participants,
    start_date: booking.startDate,
    end_date: booking.endDate,
    pricing: booking.pricing as unknown,
    payment_id: booking.paymentId ?? null,
    payment_status: booking.paymentStatus,
    confirmation_number: booking.confirmationNumber,
    notes: booking.notes ?? null,
    created_at: String(booking.createdAt),
    cancelled_at: booking.cancelledAt != null ? String(booking.cancelledAt) : null,
    updated_at: String(booking.updatedAt),
    sync_state: 'synced',
  };
}

function fromSupabaseBookingRow(row: SupabaseBookingRow): Booking {
  return {
    id: row.id,
    userId: row.user_id,
    tripPlanId: row.trip_plan_id ?? '',
    status: (row.status as BookingStatus) ?? 'draft',
    participants: row.participants ?? 0,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    pricing: (row.pricing as PriceBreakdown) ?? {
      basePrice: 0,
      taxes: 0,
      fees: 0,
      total: 0,
      currencyCode: 'USD',
      breakdown: [],
    },
    paymentId: row.payment_id ?? undefined,
    paymentStatus: (row.payment_status as PaymentStatus) ?? 'pending',
    confirmationNumber: row.confirmation_number ?? '',
    notes: row.notes ?? undefined,
    createdAt: row.created_at ? Number(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Number(row.updated_at) : Date.now(),
    cancelledAt: row.cancelled_at ? Number(row.cancelled_at) : undefined,
  };
}

// ── Supabase helpers ──

async function supabaseUpsertBooking(booking: Booking): Promise<void> {
  const row = toSupabaseBookingRow(booking);
  const { error } = await withSupabaseTimeout(
    supabase!.from('bookings').upsert(row as never, { onConflict: 'user_id,id' }),
    'Supabase booking upsert timed out.'
  );
  if (error) throw new Error(error.message);
}

async function supabasePatchBooking(userId: string, bookingId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = (await withSupabaseTimeout(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase!.from('bookings').update(patch as never) as any).eq('user_id', userId).eq('id', bookingId),
    'Supabase booking update timed out.'
  )) as { error: { message: string } | null };
  if (error) throw new Error(error.message);
}

async function supabaseFetchBooking(userId: string, bookingId: string): Promise<Booking | null> {
  const { data, error } = await withSupabaseTimeout(
    supabase!.from('bookings').select('*').eq('user_id', userId).eq('id', bookingId).maybeSingle(),
    'Supabase booking fetch timed out.'
  );
  if (error) throw new Error(error.message);
  if (!data) return null;
  return fromSupabaseBookingRow(data as unknown as SupabaseBookingRow);
}

async function supabaseUpsertPayment(payment: PaymentTransaction): Promise<void> {
  const row = toSupabasePaymentRow(payment);
  const { error } = await withSupabaseTimeout(
    supabase!.from('payments').upsert(row as never, { onConflict: 'user_id,id' }),
    'Supabase payment upsert timed out.'
  );
  if (error) throw new Error(error.message);
}

async function supabasePatchPayment(userId: string, paymentId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = (await withSupabaseTimeout(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase!.from('payments').update(patch as never) as any).eq('user_id', userId).eq('id', paymentId),
    'Supabase payment update timed out.'
  )) as { error: { message: string } | null };
  if (error) throw new Error(error.message);
}

async function supabaseFetchPayment(userId: string, paymentId: string): Promise<PaymentTransaction | null> {
  const { data, error } = await withSupabaseTimeout(
    supabase!.from('payments').select('*').eq('user_id', userId).eq('id', paymentId).maybeSingle(),
    'Supabase payment fetch timed out.'
  );
  if (error) throw new Error(error.message);
  if (!data) return null;
  return fromSupabasePaymentRow(data as unknown as SupabasePaymentRow);
}

// ============================================================================
// Configuration
// ============================================================================

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const TAX_RATE = 0.10; // 10%
const FEE_RATE = 0.05; // 5%

// ============================================================================
// Payment Service Class
// ============================================================================

export class PaymentService {
  private static instance: PaymentService;
  private retryQueue: Map<string, RetryEntry> = new Map();
  private offlineQueue: PaymentQueueItem[] = [];
  private isOnline: boolean = navigator.onLine;

  private constructor() {
    this.setupNetworkListeners();
    this.loadOfflineQueue();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Create a new booking with initial payment info
   */
  async createBooking(
    userId: string,
    tripPlanId: string,
    participants: number,
    startDate: string,
    endDate: string,
    basePrice: number,
    currency: string = 'USD'
  ): Promise<Booking> {
    const bookingId = `booking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const confirmationNumber = `HNG-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const pricing = this.calculatePricing(basePrice * participants, currency);
    const booking: Booking = {
      id: bookingId,
      userId,
      tripPlanId,
      status: 'draft',
      participants,
      startDate,
      endDate,
      pricing,
      paymentStatus: 'pending',
      confirmationNumber,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    requireSupabase();
    try {
      await supabaseUpsertBooking(booking);
      return booking;
    } catch (error) {
      console.error('Failed to create booking:', error);
      throw this.handleError(error, 'CREATE_BOOKING_FAILED');
    }
  }

  /**
   * Process payment with retry logic
   */
  async processPayment(
    booking: Booking,
    paymentMethod: PaymentMethod,
    cardDetails?: CardDetails
  ): Promise<PaymentResult> {
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const payment: PaymentTransaction = {
      id: paymentId,
      bookingId: booking.id,
      userId: booking.userId,
      amount: booking.pricing.total,
      currency: booking.pricing.currencyCode,
      status: 'pending',
      method: paymentMethod,
      retryCount: 0,
      maxRetries: RETRY_CONFIG.maxRetries,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      // Validate payment method first
      await this.validatePaymentMethod(paymentMethod, cardDetails);

      // Update booking status -> awaiting_payment / processing (Supabase-first)
      requireSupabase();
      try {
        await supabasePatchBooking(booking.userId, booking.id, {
          status: 'awaiting_payment',
          payment_status: 'processing',
          payment_id: paymentId,
          updated_at: String(Date.now()),
          sync_state: 'synced',
        });
      } catch {
        try {
          const merged: Booking = { ...booking, status: 'awaiting_payment', paymentStatus: 'processing', paymentId, updatedAt: Date.now() };
          await supabaseUpsertBooking(merged);
        } catch (e2) {
          console.error('[payment-service] Supabase awaiting_payment upsert failed:', e2);
          throw e2 as Error;
        }
      }

      // Process payment (call cloud function)
      const result = await this.callPaymentProcessor(payment, cardDetails);

      if (result.success) {
        // Mark payment as completed
        await this.recordPayment(booking.userId, {
          ...payment,
          status: 'completed',
          transactionId: result.transactionId,
          processedAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Update booking status -> paid/completed (Supabase-first)
        requireSupabase();
        try {
          await supabasePatchBooking(booking.userId, booking.id, {
            status: 'paid',
            payment_status: 'completed',
            payment_id: paymentId,
            updated_at: String(Date.now()),
            sync_state: 'synced',
          });
        } catch {
          const merged: Booking = { ...booking, status: 'paid', paymentStatus: 'completed', paymentId, updatedAt: Date.now() };
          await supabaseUpsertBooking(merged);
        }

        return {
          success: true,
          bookingId: booking.id,
          transactionId: result.transactionId,
          confirmationNumber: booking.confirmationNumber,
          message: 'Payment completed successfully',
          timestamp: Date.now(),
        };
      } else {
        throw {
          code: result.code || 'PAYMENT_FAILED',
          message: result.message || 'Payment processing failed',
          retryable: result.retryable !== false,
        };
      }
    } catch (error) {
      return await this.handlePaymentError(error, booking, payment);
    }
  }

  /**
   * Retry a failed payment
   */
  async retryPayment(
    paymentId: string,
    userId: string,
    cardDetails?: CardDetails
  ): Promise<PaymentResult> {
    try {
      requireSupabase();
      const payment = await supabaseFetchPayment(userId, paymentId);
      if (!payment) {
        throw { code: 'PAYMENT_NOT_FOUND', message: 'Payment transaction not found', retryable: false };
      }

      if (payment.status === 'completed') {
        return {
          success: true,
          transactionId: payment.transactionId,
          bookingId: payment.bookingId,
          message: 'Payment already completed',
          timestamp: Date.now(),
        };
      }

      if (payment.retryCount >= payment.maxRetries) {
        throw { code: 'MAX_RETRIES_EXCEEDED', message: 'Maximum retry attempts exceeded', retryable: false };
      }

      // Update retry count (Supabase-first)
      const nextRetryCount = payment.retryCount + 1;
      await supabasePatchPayment(userId, paymentId, {
        retry_count: nextRetryCount,
        updated_at: String(Date.now()),
        sync_state: 'synced',
      });

      // Attempt payment again
      const result = await this.callPaymentProcessor({ ...payment, retryCount: nextRetryCount }, cardDetails);

      if (result.success) {
        const completedSnake = {
          status: 'completed',
          transaction_id: result.transactionId ?? null,
          processed_at: String(Date.now()),
          updated_at: String(Date.now()),
          sync_state: 'synced',
        };
        const completedFallback = {
          status: 'completed',
          transactionId: result.transactionId,
          processedAt: Date.now(),
          updatedAt: Date.now(),
        };
                await supabasePatchPayment(userId, paymentId, completedSnake);

        // Get booking and update status
        const booking = await this.getBooking(payment.userId, payment.bookingId);
        if (booking) {
          const paidPatchSnake = {
            status: 'paid',
            payment_status: 'completed',
            updated_at: String(Date.now()),
            sync_state: 'synced',
          };
          try {
            await supabasePatchBooking(payment.userId, booking.id, paidPatchSnake);
          } catch {
            const merged: Booking = { ...booking, status: 'paid', paymentStatus: 'completed', updatedAt: Date.now() };
            await supabaseUpsertBooking(merged);
          }
        }

        return {
          success: true,
          transactionId: result.transactionId,
          bookingId: payment.bookingId,
          message: 'Payment retry successful',
          timestamp: Date.now(),
        };
      } else {
        throw {
          code: result.code || 'PAYMENT_RETRY_FAILED',
          message: result.message || 'Payment retry failed',
          retryable: result.retryable !== false,
        };
      }
    } catch (error) {
      console.error('Payment retry error:', error);
      throw error;
    }
  }

  /**
   * Refund a completed payment
   */
  async refundPayment(
    paymentId: string,
    userId: string,
    amount?: number
  ): Promise<{ success: boolean; refundId?: string; message: string }> {
    try {
      const payment = await supabaseFetchPayment(userId, paymentId);
      if (!payment) {
        throw { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found', retryable: false };
      }

      if (payment.status !== 'completed' && payment.status !== 'partially_refunded') {
        throw {
          code: 'INVALID_REFUND_STATE',
          message: `Cannot refund payment in ${payment.status} state`,
          retryable: false,
        };
      }

      const refundAmount = amount || payment.amount;

      if (refundAmount > payment.amount) {
        throw {
          code: 'INVALID_REFUND_AMOUNT',
          message: 'Refund amount exceeds original payment',
          retryable: false,
        };
      }

      // Call refund processor
      const refundId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Call cloud function to process refund
      const result = await this.callRefundProcessor(payment, refundAmount);

      if (result.success) {
        const newStatus = refundAmount === payment.amount ? 'refunded' : 'partially_refunded';
        await supabasePatchPayment(userId, paymentId, {
          status: newStatus,
          refunded_at: String(Date.now()),
          updated_at: String(Date.now()),
          sync_state: 'synced',
        });

        // Update booking if fully refunded
        if (newStatus === 'refunded') {
          const booking = await this.getBooking(userId, payment.bookingId);
          if (booking) {
            const cancelPatchSnake = {
              status: 'cancelled',
              payment_status: 'refunded',
              cancelled_at: String(Date.now()),
              updated_at: String(Date.now()),
              sync_state: 'synced',
            };
            try {
              await supabasePatchBooking(userId, booking.id, cancelPatchSnake);
            } catch {
              const merged: Booking = { ...booking, status: 'cancelled', paymentStatus: 'refunded', cancelledAt: Date.now(), updatedAt: Date.now() };
              await supabaseUpsertBooking(merged);
            }
          }
        }

        return {
          success: true,
          refundId,
          message: `Refund of ${refundAmount / 100} ${payment.currency} processed`,
        };
      } else {
        throw {
          code: result.code || 'REFUND_FAILED',
          message: result.message || 'Refund processing failed',
          retryable: result.retryable !== false,
        };
      }
    } catch (error) {
      console.error('Refund error:', error);
      throw error;
    }
  }

  /**
   * Get transaction status from external processor
   */
  async getTransactionStatus(transactionId: string): Promise<PaymentStatus> {
    try {
      // Call cloud function to check status
      const response = await fetch('/api/payment/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });

      if (!response.ok) throw new Error('Failed to get transaction status');

      const result = await response.json();
      return result.status as PaymentStatus;
    } catch (error) {
      console.error('Error checking transaction status:', error);
      return 'pending';
    }
  }

  /**
   * Validate payment method
   */
  private async validatePaymentMethod(
    method: PaymentMethod,
    cardDetails?: CardDetails
  ): Promise<boolean> {
    if (method === 'credit_card' || method === 'debit_card') {
      if (!cardDetails) throw { code: 'INVALID_CARD', message: 'Card details required', retryable: false };

      if (!cardDetails.number || cardDetails.number.length < 13) {
        throw { code: 'INVALID_CARD_NUMBER', message: 'Invalid card number', retryable: false };
      }

      if (!cardDetails.expiry || !this.validateExpiry(cardDetails.expiry)) {
        throw { code: 'INVALID_CARD_EXPIRY', message: 'Card has expired or invalid expiry date', retryable: false };
      }

      if (!cardDetails.cvv || cardDetails.cvv.length < 3) {
        throw { code: 'INVALID_CVV', message: 'Invalid CVV', retryable: false };
      }
    }

    return true;
  }

  /**
   * Validate card expiry (MM/YY format)
   */
  private validateExpiry(expiry: string): boolean {
    const [month, year] = expiry.split('/').map(Number);
    if (!month || !year || month < 1 || month > 12) return false;

    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;

    if (year < currentYear) return false;
    if (year === currentYear && month < currentMonth) return false;

    return true;
  }

  /**
   * Calculate pricing with taxes and fees
   */
  private calculatePricing(basePrice: number, currency: string): PriceBreakdown {
    const taxes = Math.round(basePrice * TAX_RATE);
    const fees = Math.round(basePrice * FEE_RATE);
    const total = basePrice + taxes + fees;

    return {
      basePrice,
      taxes,
      fees,
      total,
      currencyCode: currency,
      breakdown: [
        { label: 'Base Price', amount: basePrice },
        { label: 'Taxes', amount: taxes },
        { label: 'Fees', amount: fees },
      ],
    };
  }

  /**
   * Record payment transaction
   */
  private async recordPayment(userId: string, payment: PaymentTransaction): Promise<void> {
    requireSupabase();
    await supabaseUpsertPayment(payment);
  }

  /**
   * Get booking by ID
   */
  private async getBooking(userId: string, bookingId: string): Promise<Booking | null> {
    requireSupabase();
    return supabaseFetchBooking(userId, bookingId);
  }

  /**
   * Call payment processor (cloud function)
   */
  private async callPaymentProcessor(
    payment: PaymentTransaction,
    cardDetails?: CardDetails
  ): Promise<{ success: boolean; transactionId?: string; code?: string; message?: string; retryable?: boolean }> {
    try {
      const response = await fetch('/api/payment/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          cardDetails,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          code: error.code,
          message: error.message,
          retryable: response.status >= 500 || response.status === 408,
        };
      }

      const result = await response.json();
      return {
        success: true,
        transactionId: result.transactionId,
      };
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      console.error('Payment processor error:', error);
      return {
        success: false,
        code: err.name === 'AbortError' ? 'PAYMENT_TIMEOUT' : 'PAYMENT_API_ERROR',
        message: err.message || 'Payment processor unavailable',
        retryable: true,
      };
    }
  }

  /**
   * Call refund processor (cloud function)
   */
  private async callRefundProcessor(
    payment: PaymentTransaction,
    amount: number
  ): Promise<{ success: boolean; refundId?: string; code?: string; message?: string; retryable?: boolean }> {
    try {
      const response = await fetch('/api/payment/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: payment.transactionId,
          amount,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          code: error.code,
          message: error.message,
          retryable: response.status >= 500,
        };
      }

      const result = await response.json();
      return {
        success: true,
        refundId: result.refundId,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Refund processor error:', error);
      return {
        success: false,
        code: 'REFUND_API_ERROR',
        message: err.message || 'Refund processor unavailable',
        retryable: true,
      };
    }
  }

  /**
   * Handle payment errors with retry logic
   */
  private async handlePaymentError(
    error: unknown,
    booking: Booking,
    payment: PaymentTransaction
  ): Promise<PaymentResult> {
    const err = error as { retryable?: boolean; message?: string };
    const isRetryable = err.retryable !== false && payment.retryCount < RETRY_CONFIG.maxRetries;

    if (isRetryable) {
      // Queue for retry
      const delayMs = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, payment.retryCount),
        RETRY_CONFIG.maxDelayMs
      );

      this.retryQueue.set(payment.id, {
        payment,
        booking,
        retryAt: Date.now() + delayMs,
        attempt: payment.retryCount + 1,
      });

      if (!this.isOnline) {
        this.offlineQueue.push({
          type: 'payment',
          data: { payment, booking },
          timestamp: Date.now(),
        });
        this.saveOfflineQueue();
      }
    }

    await this.recordPayment(booking.userId, {
      ...payment,
      status: 'failed',
      failureReason: err.message,
      updatedAt: Date.now(),
    });

    return {
      success: false,
      bookingId: booking.id,
      message: err.message || 'Payment processing failed',
      timestamp: Date.now(),
    };
  }

  /**
   * Handle generic errors
   */
  private handleError(error: unknown, code: string): PaymentError {
    const err = error as { message?: string; code?: string };
    return {
      code,
      message: err?.message || 'An error occurred',
      retryable: err?.code !== 'PERMISSION_DENIED',
    };
  }

  /**
   * Setup network listeners for offline support
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * Load offline queue from localStorage
   */
  private loadOfflineQueue(): void {
    try {
      const stored = localStorage.getItem('payment_offline_queue');
      if (stored) {
        this.offlineQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
      this.offlineQueue = [];
    }
  }

  /**
   * Save offline queue to localStorage
   */
  private saveOfflineQueue(): void {
    try {
      localStorage.setItem('payment_offline_queue', JSON.stringify(this.offlineQueue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  /**
   * Process offline queue when online
   */
  private async processOfflineQueue(): Promise<void> {
    for (const item of this.offlineQueue) {
      try {
        if (item.type === 'payment') {
          const { payment, booking } = item.data as { payment: PaymentTransaction; booking: Booking };
          // Retry payment
          await this.processPayment(booking, payment.method);
        }
      } catch (error) {
        console.error('Error processing offline queue item:', error);
      }
    }

    this.offlineQueue = [];
    this.saveOfflineQueue();
  }
}

// ============================================================================
// Helper Interfaces
// ============================================================================

export interface CardDetails {
  number: string;
  expiry: string; // MM/YY
  cvv: string;
  name?: string;
}

interface RetryEntry {
  payment: PaymentTransaction;
  booking: Booking;
  retryAt: number;
  attempt: number;
}

interface PaymentQueueItem {
  type: 'payment' | 'refund';
  data: unknown;
  timestamp: number;
}

// ============================================================================
// Singleton Export
// ============================================================================

export const paymentService = PaymentService.getInstance();
