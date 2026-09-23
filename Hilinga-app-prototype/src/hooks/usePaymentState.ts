/**
 * usePaymentState Hook - Manages payment UI state, processing, and error handling
 * Provides state and actions for payment workflow in MapScreen
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { paymentService } from '@/lib/payment-service';
import type { Booking, PaymentStatus, PaymentMethod } from '@/lib/payment-service';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PaymentInfo {
  bookingId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionId?: string;
  confirmationNumber?: string;
  errorMessage?: string;
}

export interface PaymentState {
  paymentInfo: PaymentInfo | null;
  paymentMethod: PaymentMethod | null;
  isProcessing: boolean;
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  selectedInstallment: number;
  totalInstallments: number;
}

export interface PaymentActions {
  initializePayment: (bookingId: string, amount: number, currency?: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  processPayment: (cardDetails?: any) => Promise<boolean>;
  retryPayment: (cardDetails?: any) => Promise<boolean>;
  clearPaymentError: () => void;
  resetPayment: () => void;
  setInstallment: (current: number, total: number) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: PaymentState = {
  paymentInfo: null,
  paymentMethod: null,
  isProcessing: false,
  isRetrying: false,
  retryCount: 0,
  maxRetries: 3,
  lastError: null,
  selectedInstallment: 1,
  totalInstallments: 1,
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePaymentState(): [PaymentState, PaymentActions] {
  const [state, setState] = useState<PaymentState>(initialState);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Initialize payment with booking and amount
   */
  const initializePayment = useCallback((bookingId: string, amount: number, currency: string = 'USD') => {
    setState(prev => ({
      ...prev,
      paymentInfo: {
        bookingId,
        amount,
        currency,
        status: 'pending',
      },
      lastError: null,
      retryCount: 0,
    }));
  }, []);

  /**
   * Set payment method
   */
  const setPaymentMethod = useCallback((method: PaymentMethod) => {
    setState(prev => ({
      ...prev,
      paymentMethod: method,
      lastError: null, // Clear error when method changes
    }));
  }, []);

  /**
   * Process payment
   */
  const processPayment = useCallback(
    async (cardDetails?: any): Promise<boolean> => {
      if (processingRef.current || !state.paymentInfo) {
        return false;
      }

      // Validate method is selected
      if (!state.paymentMethod) {
        setState(prev => ({
          ...prev,
          lastError: 'Please select a payment method',
        }));
        return false;
      }

      processingRef.current = true;

      try {
        setState(prev => ({
          ...prev,
          isProcessing: true,
          lastError: null,
        }));

        // Create booking object for service
        const booking: Booking = {
          id: state.paymentInfo.bookingId,
          userId: '', // Will be injected by auth context
          tripPlanId: '',
          status: 'awaiting_payment',
          participants: 1,
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          pricing: {
            basePrice: state.paymentInfo.amount,
            taxes: Math.round(state.paymentInfo.amount * 0.1),
            fees: Math.round(state.paymentInfo.amount * 0.05),
            total: Math.round(state.paymentInfo.amount * 1.15),
            currencyCode: state.paymentInfo.currency,
            breakdown: [
              { label: 'Base Price', amount: state.paymentInfo.amount },
              { label: 'Taxes', amount: Math.round(state.paymentInfo.amount * 0.1) },
              { label: 'Fees', amount: Math.round(state.paymentInfo.amount * 0.05) },
            ],
          },
          paymentStatus: 'processing',
          confirmationNumber: `HNG-${Date.now()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Process payment
        const result = await paymentService.processPayment(booking, state.paymentMethod, cardDetails);

        if (result.success) {
          setState(prev => ({
            ...prev,
            paymentInfo: {
              ...prev.paymentInfo!,
              status: 'completed',
              transactionId: result.transactionId,
              confirmationNumber: result.confirmationNumber,
            },
            isProcessing: false,
            retryCount: 0,
          }));

          return true;
        } else {
          setState(prev => ({
            ...prev,
            paymentInfo: {
              ...prev.paymentInfo!,
              status: 'failed',
              errorMessage: result.message,
            },
            isProcessing: false,
            lastError: result.message ?? null,
          }));

          return false;
        }
      } catch (error: any) {
        const errorMessage = error?.message || 'Payment processing failed. Please try again.';

        setState(prev => ({
          ...prev,
          paymentInfo: {
            ...prev.paymentInfo!,
            status: 'failed',
            errorMessage,
          },
          isProcessing: false,
          lastError: errorMessage,
        }));

        return false;
      } finally {
        processingRef.current = false;
      }
    },
    [state.paymentInfo, state.paymentMethod]
  );

  /**
   * Retry payment with exponential backoff
   */
  const retryPayment = useCallback(
    async (cardDetails?: any): Promise<boolean> => {
      if (!state.paymentInfo || state.retryCount >= state.maxRetries) {
        setState(prev => ({
          ...prev,
          lastError: 'Maximum retry attempts exceeded. Please contact support.',
        }));
        return false;
      }

      setState(prev => ({
        ...prev,
        isRetrying: true,
        lastError: null,
      }));

      try {
        // Calculate exponential backoff delay
        const delayMs = Math.min(1000 * Math.pow(2, state.retryCount), 30000);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Retry payment
        const success = await processPayment(cardDetails);

        if (success) {
          setState(prev => ({
            ...prev,
            isRetrying: false,
            retryCount: 0,
          }));
          return true;
        } else {
          setState(prev => ({
            ...prev,
            isRetrying: false,
            retryCount: prev.retryCount + 1,
          }));
          return false;
        }
      } catch (error: any) {
        setState(prev => ({
          ...prev,
          isRetrying: false,
          retryCount: prev.retryCount + 1,
          lastError: error?.message || 'Retry failed',
        }));
        return false;
      }
    },
    [state.paymentInfo, state.retryCount, state.maxRetries, processPayment]
  );

  /**
   * Clear payment error
   */
  const clearPaymentError = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastError: null,
    }));
  }, []);

  /**
   * Reset payment state
   */
  const resetPayment = useCallback(() => {
    setState(initialState);
  }, []);

  /**
   * Set installment payment option
   */
  const setInstallment = useCallback((current: number, total: number) => {
    setState(prev => ({
      ...prev,
      selectedInstallment: current,
      totalInstallments: total,
    }));
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Handle online/offline status
   */
  useEffect(() => {
    const handleOnline = () => {
      // Retry failed payments when coming online
      if (state.paymentInfo?.status === 'failed' && state.retryCount < state.maxRetries) {
        console.log('Connection restored. Retrying payment...');
        retryPayment();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [state.paymentInfo, state.retryCount, state.maxRetries, retryPayment]);

  return [
    state,
    {
      initializePayment,
      setPaymentMethod,
      processPayment,
      retryPayment,
      clearPaymentError,
      resetPayment,
      setInstallment,
    },
  ];
}

// ============================================================================
// Helper Hook: Payment Validation
// ============================================================================

export function usePaymentValidation() {
  const validateCardNumber = useCallback((number: string): boolean => {
    // Luhn algorithm
    const digits = number.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }, []);

  const validateExpiry = useCallback((expiry: string): boolean => {
    const [month, year] = expiry.split('/').map(Number);

    if (!month || !year || month < 1 || month > 12) return false;

    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;

    if (year < currentYear) return false;
    if (year === currentYear && month < currentMonth) return false;

    return true;
  }, []);

  const validateCVV = useCallback((cvv: string): boolean => {
    return /^\d{3,4}$/.test(cvv);
  }, []);

  return {
    validateCardNumber,
    validateExpiry,
    validateCVV,
  };
}

// ============================================================================
// Helper Hook: Installment Payments
// ============================================================================

export interface InstallmentOption {
  months: number;
  interestRate: number;
  monthlyPayment: number;
}

export function useInstallmentPlans(amount: number) {
  return useCallback((): InstallmentOption[] => {
    return [
      {
        months: 1,
        interestRate: 0,
        monthlyPayment: amount,
      },
      {
        months: 3,
        interestRate: 0.05,
        monthlyPayment: Math.round((amount * 1.05) / 3),
      },
      {
        months: 6,
        interestRate: 0.08,
        monthlyPayment: Math.round((amount * 1.08) / 6),
      },
      {
        months: 12,
        interestRate: 0.12,
        monthlyPayment: Math.round((amount * 1.12) / 12),
      },
    ];
  }, [amount]);
}
