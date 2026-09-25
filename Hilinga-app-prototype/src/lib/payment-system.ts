/**
 * Hilinga Payment Processing System
 * Handles booking payments, tracking, and status management
 */

// ── Payment Data Models ──

export type PaymentMethod = "card" | "digital_wallet" | "cash_on_arrival";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "cancelled";

export type BookingStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled";

export type UserTrackingStatus = "not_started" | "arriving" | "arrived" | "departed";

export interface PaymentMethod_Card {
  type: "card";
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface PaymentMethod_Wallet {
  type: "digital_wallet";
  provider: "apple_pay" | "google_pay" | "paypal";
}

export interface PaymentMethod_Cash {
  type: "cash_on_arrival";
}

export interface PaymentTransaction {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod_Card | PaymentMethod_Wallet | PaymentMethod_Cash;
  transactionId?: string; // External payment processor ID
  receiptUrl?: string;
  failureReason?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  refundedAt?: string;
}

export interface InstallmentSchedule {
  id: string;
  paymentId: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  dueDate: string;
  status: "pending" | "completed" | "overdue";
  transactionId?: string;
}

export interface PriceBreakdown {
  basePrice: number;
  taxes: number;
  fees: number;
  discount?: number;
  total: number;
  currencyCode: string;
  breakdown: Array<{
    label: string;
    amount: number;
  }>;
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
  installments?: InstallmentSchedule[];
  confirmationNumber: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

export interface BookingWithTracking extends Booking {
  trackingStatus: UserTrackingStatus;
  currentStop?: number;
  estimatedArrival?: string;
  lastLocationUpdate?: string;
}

export interface PaymentProcessor {
  processPayment(
    booking: Booking,
    paymentMethod: PaymentMethod_Card | PaymentMethod_Wallet | PaymentMethod_Cash,
  ): Promise<PaymentTransaction>;

  validatePaymentMethod(method: PaymentMethod): Promise<boolean>;

  refundPayment(transactionId: string, amount?: number): Promise<PaymentTransaction>;

  getTransactionStatus(transactionId: string): Promise<PaymentStatus>;

  retryFailedPayment(transactionId: string): Promise<PaymentTransaction>;
}

export interface LocationTracker {
  startTracking(bookingId: string, userId: string): Promise<void>;

  stopTracking(bookingId: string): Promise<void>;

  updateLocation(bookingId: string, latitude: number, longitude: number): Promise<UserTrackingStatus>;

  getTrackingStatus(bookingId: string): Promise<BookingWithTracking>;

  checkProximity(
    bookingId: string,
    stopIndex: number,
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<boolean>;

  advanceToNextStop(bookingId: string): Promise<number>;

  getCurrentStop(bookingId: string): Promise<number | null>;
}

// ── State Management ──

export interface PaymentState {
  currentBooking: Booking | null;
  bookingStatus: BookingStatus;
  paymentError: string | null;
  isProcessing: boolean;
  lastTransaction?: PaymentTransaction;
  trackingActive: boolean;
  userTrackingStatus: UserTrackingStatus;
  currentStopIndex: number;
}

export const initialPaymentState: PaymentState = {
  currentBooking: null,
  bookingStatus: "draft",
  paymentError: null,
  isProcessing: false,
  trackingActive: false,
  userTrackingStatus: "not_started",
  currentStopIndex: 0,
};

// ── Action Creators ──

export interface PaymentActions {
  setCurrentBooking: (booking: Booking) => void;
  setBookingStatus: (status: BookingStatus) => void;
  setPaymentError: (error: string | null) => void;
  setIsProcessing: (processing: boolean) => void;
  setLastTransaction: (transaction: PaymentTransaction) => void;
  setTrackingActive: (active: boolean) => void;
  setUserTrackingStatus: (status: UserTrackingStatus) => void;
  setCurrentStopIndex: (index: number) => void;
  resetPaymentState: () => void;
}

// ── Error Handling ──

export class PaymentError extends Error {
  constructor(
    public code: string,
    public message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export class PaymentTimeoutError extends PaymentError {
  constructor(message: string = "Payment processing timeout") {
    super("PAYMENT_TIMEOUT", message);
    this.name = "PaymentTimeoutError";
  }
}

export class PaymentRetryableError extends PaymentError {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = "PaymentRetryableError";
  }
}

// ── Retry Logic ──

export interface RetryStrategy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const defaultRetryStrategy: RetryStrategy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export function calculateRetryDelay(
  attemptNumber: number,
  strategy: RetryStrategy = defaultRetryStrategy,
): number {
  const delay = strategy.initialDelayMs * Math.pow(strategy.backoffMultiplier, attemptNumber);
  return Math.min(delay, strategy.maxDelayMs);
}

// ── Booking Utilities ──

export function generateConfirmationNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `HNG-${timestamp}-${random}`;
}

export function calculateTotalPrice(
  basePrice: number,
  taxRate: number = 0.12,
  serviceFeesRate: number = 0.05,
): PriceBreakdown {
  const taxes = basePrice * taxRate;
  const fees = basePrice * serviceFeesRate;
  const total = basePrice + taxes + fees;

  return {
    basePrice,
    taxes,
    fees,
    total,
    currencyCode: "PHP",
    breakdown: [
      { label: "Base Price", amount: basePrice },
      { label: "Taxes", amount: taxes },
      { label: "Service Fees", amount: fees },
    ],
  };
}

// ── Payment Status Transitions ──

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    pending: ["processing", "failed", "cancelled"],
    processing: ["completed", "failed", "cancelled"],
    completed: ["partially_refunded", "refunded"],
    failed: ["pending", "cancelled"],
    refunded: [],
    partially_refunded: ["refunded"],
    cancelled: [],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  const validTransitions: Record<BookingStatus, BookingStatus[]> = {
    draft: ["awaiting_payment", "cancelled"],
    awaiting_payment: ["paid", "cancelled"],
    paid: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// ── Tracking Status Transitions ──

export function canTransitionTrackingStatus(from: UserTrackingStatus, to: UserTrackingStatus): boolean {
  const validTransitions: Record<UserTrackingStatus, UserTrackingStatus[]> = {
    not_started: ["arriving"],
    arriving: ["arrived", "not_started"],
    arrived: ["departed", "arriving"],
    departed: ["arriving"],
  };

  return validTransitions[from]?.includes(to) ?? false;
}
