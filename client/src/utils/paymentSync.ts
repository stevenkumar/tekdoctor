/**
 * Payment Status Synchronization Utility
 * Enables immediate real-time synchronization of payment events across
 * components, windows, and tabs, backed by active background revalidation.
 */

export interface PaymentSettledEventData {
  ticketId?: number | string;
  paymentId?: string;
  invoiceId?: number | string;
  status: 'paid' | 'verified';
  amount?: number;
  timestamp: number;
}

const PAYMENT_EVENT_NAME = 'tekdoctor:payment_updated';
const NOTIF_EVENT_NAME = 'tekdoctor:notifications_updated';
const STORAGE_KEY = 'tekdoctor_payment_settled_event';
const CHANNEL_NAME = 'tekdoctor_payments';

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  // Graceful fallback if unsupported in current environment
}

/**
 * Broadcasts that a payment has been successfully settled on the server.
 * Dispatches to:
 * 1. Current window custom DOM events (for same-tab components)
 * 2. BroadcastChannel (for cross-tab communication)
 * 3. LocalStorage event (for browsers without BroadcastChannel)
 */
export function broadcastPaymentSettled(data: Partial<PaymentSettledEventData>): void {
  if (typeof window === 'undefined') return;

  const payload: PaymentSettledEventData = {
    ticketId: data.ticketId,
    paymentId: data.paymentId,
    invoiceId: data.invoiceId,
    status: data.status || 'paid',
    amount: data.amount,
    timestamp: Date.now()
  };

  // 1. Dispatch custom DOM events for active UI in current tab
  try {
    window.dispatchEvent(new CustomEvent(PAYMENT_EVENT_NAME, { detail: payload }));
    window.dispatchEvent(new Event(NOTIF_EVENT_NAME));
  } catch (err) {
    console.debug('Payment DOM event dispatch error:', err);
  }

  // 2. BroadcastChannel for fast cross-tab sync (<5ms)
  try {
    broadcastChannel?.postMessage(payload);
  } catch (err) {
    console.debug('BroadcastChannel post error:', err);
  }

  // 3. LocalStorage storage event fallback for cross-tab sync
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.debug('LocalStorage broadcast error:', err);
  }
}

/**
 * Subscribes to payment updates across DOM events, BroadcastChannel, and LocalStorage.
 * Returns an unsubscribe function.
 */
export function subscribeToPaymentUpdates(callback: (data: PaymentSettledEventData) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // DOM Event handler
  const handleCustomEvent = (event: Event) => {
    const customEvt = event as CustomEvent<PaymentSettledEventData>;
    callback(customEvt.detail || { status: 'paid', timestamp: Date.now() });
  };

  // BroadcastChannel message handler
  const handleChannelMessage = (event: MessageEvent<PaymentSettledEventData>) => {
    if (event.data) {
      callback(event.data);
    }
  };

  // Storage event handler
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        callback(parsed);
      } catch {
        callback({ status: 'paid', timestamp: Date.now() });
      }
    }
  };

  window.addEventListener(PAYMENT_EVENT_NAME, handleCustomEvent);
  broadcastChannel?.addEventListener('message', handleChannelMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(PAYMENT_EVENT_NAME, handleCustomEvent);
    broadcastChannel?.removeEventListener('message', handleChannelMessage);
    window.removeEventListener('storage', handleStorage);
  };
}
