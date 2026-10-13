/**
 * Razorpay Checkout SDK Loader & Execution Utility
 * Dynamically loads the official checkout.js SDK and manages checkout lifecycle.
 */

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface RazorpayOrderOptions {
  keyId: string;
  orderId: string;
  amount: number; // in INR / primary currency
  currency?: string;
  name?: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, any>;
  themeColor?: string;
  onPaymentSuccess: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
  onDismiss?: () => void;
  onPaymentError?: (error: any) => void;
}

/**
 * Dynamically load Razorpay Checkout SDK script
 */
export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById('razorpay-checkout-js');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      console.warn('Failed to load official Razorpay script from CDN.');
      resolve(false);
    };

    document.body.appendChild(script);
  });
};

/**
 * Trigger Razorpay Checkout Modal
 */
export const triggerRazorpayCheckout = async (options: RazorpayOrderOptions): Promise<void> => {
  const isLoaded = await loadRazorpayScript();

  // Only real Razorpay gateway keys are accepted. Test (rzp_test_) and live
  // (rzp_live_) keys both open the official Razorpay checkout; every other case
  // fails closed so no payment can ever be "simulated" as successful.
  const isRealRazorpayKey = Boolean(options.keyId)
    && (options.keyId.startsWith('rzp_live_') || options.keyId.startsWith('rzp_test_'))
    && !options.keyId.includes('demo')
    && !options.keyId.includes('YourKeyId');

  if (!isLoaded || !window.Razorpay || !isRealRazorpayKey) {
    const unavailableError = new Error(
      'The payment gateway is not configured. Please contact support to complete this payment.'
    );
    if (options.onPaymentError) options.onPaymentError(unavailableError);
    return;
  }

  const rzpOptions = {
    key: options.keyId,
    amount: Math.round(options.amount * 100), // in paise
    currency: options.currency || 'INR',
    name: options.name || 'TekDoctor Services',
    description: options.description || 'Device Repair Invoice Payment',
    order_id: options.orderId,
    prefill: {
      name: options.prefill?.name || '',
      email: options.prefill?.email || '',
      contact: options.prefill?.contact || '',
    },
    notes: options.notes || {},
    theme: {
      color: options.themeColor || '#00f0ff',
    },
    handler: async function (response: any) {
      try {
        await options.onPaymentSuccess({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
        });
      } catch (err) {
        if (options.onPaymentError) options.onPaymentError(err);
      }
    },
    modal: {
      ondismiss: function () {
        if (options.onDismiss) options.onDismiss();
      },
    },
  };

  const rzp = new window.Razorpay(rzpOptions);
  rzp.on('payment.failed', function (response: any) {
    if (options.onPaymentError) {
      options.onPaymentError(response.error);
    }
  });

  rzp.open();
};
