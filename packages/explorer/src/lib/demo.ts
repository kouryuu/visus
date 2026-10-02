import type { ChangeUnit, Report, Source } from '@visus/core';

const files: Array<{
  id: string;
  kind: ChangeUnit['kind'];
  oldPath?: string;
  newPath: string;
  summary: string;
  before?: string;
  after: string;
}> = [
  {
    id: 'checkout-route', kind: 'text', oldPath: 'src/api/checkout.ts', newPath: 'src/api/checkout.ts', summary: 'Return the same order when a checkout attempt is repeated',
    before: `export async function checkout(request: Request) {
  const cart = await readCart(request);
  const total = cart.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const order = await orders.create({ cart, total });
  return Response.json(order, { status: 201 });
}`,
    after: `import { calculateOrderTotal } from '../orders/totals';

export async function checkout(request: Request) {
  const attemptKey = request.headers.get('Idempotency-Key');
  if (!attemptKey) return Response.json({ error: 'Missing checkout attempt' }, { status: 400 });
  const cart = await readCart(request);
  try {
    const result = await orders.createOnce({ cart, attemptKey, total: calculateOrderTotal(cart.items) });
    return Response.json(result.order, { status: result.reused ? 200 : 201 });
  } catch (error) {
    if (error instanceof CheckoutConflict) {
      return Response.json({ error: 'Cart changed; start a new checkout attempt' }, { status: 409 });
    }
    throw error;
  }
}`
  },
  {
    id: 'order-service', kind: 'text', oldPath: 'src/orders/service.ts', newPath: 'src/orders/service.ts', summary: 'Reuse a completed checkout attempt and reject a changed cart',
    before: `export async function create({ cart, total }) {
  return db.orders.insert({ cartId: cart.id, cartVersion: cart.version, total });
}`,
    after: `export async function createOnce({ cart, attemptKey, total }) {
  return db.transaction(async (tx) => {
    await tx.lockCheckoutAttempt(attemptKey);
    const existing = await tx.orders.findByAttempt(attemptKey);
    if (existing) {
      if (existing.cartId !== cart.id || existing.cartVersion !== cart.version) {
        throw new CheckoutConflict();
      }
      return { order: existing, reused: true };
    }
    const order = await tx.orders.insert({ cartId: cart.id, cartVersion: cart.version, attemptKey, total });
    return { order, reused: false };
  });
}`
  },
  {
    id: 'attempt-migration', kind: 'text', newPath: 'db/migrations/014_checkout_attempt.sql', summary: 'Give each completed checkout attempt a unique key',
    after: `ALTER TABLE orders ADD COLUMN attempt_key TEXT;
CREATE UNIQUE INDEX orders_attempt_key ON orders (attempt_key)
  WHERE attempt_key IS NOT NULL;`
  },
  {
    id: 'checkout-client', kind: 'text', oldPath: 'src/checkout/client.ts', newPath: 'src/checkout/client.ts', summary: 'Send a stable attempt key and apply the shared timeout',
    before: `export async function submitCheckout(cartId: string) {
  const response = await fetch('/api/checkout', {
    method: 'POST', body: JSON.stringify({ cartId })
  });
  if (!response.ok) throw new Error('Checkout failed');
  return response.json();
}`,
    after: `import { checkoutConfig } from './config';

export async function submitCheckout(cartId: string, attemptKey: string) {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attemptKey },
    body: JSON.stringify({ cartId }),
    signal: AbortSignal.timeout(checkoutConfig.timeoutMs)
  });
  if (response.status === 409) throw new CheckoutConflict();
  if (!response.ok) throw new Error('Checkout failed');
  return response.json();
}`
  },
  {
    id: 'checkout-screen', kind: 'text', oldPath: 'src/checkout/Checkout.tsx', newPath: 'src/checkout/Checkout.tsx', summary: 'Keep the cart visible and offer a safe retry after a timeout',
    before: `async function placeOrder() {
  setError('');
  try {
    const order = await submitCheckout(cart.id);
    clearCart();
    navigateToOrder(order.id);
  } catch {
    clearCart();
    setError('Something went wrong. Please start again.');
  }
}

const total = calculateCartTotal(cart.items);`,
    after: `import { calculateOrderTotal } from '../orders/totals';

const attempt = useRef({ cartVersion: cart.version, key: crypto.randomUUID() });

async function placeOrder() {
  if (submitting) return;
  if (attempt.current.cartVersion !== cart.version) {
    attempt.current = { cartVersion: cart.version, key: crypto.randomUUID() };
  }
  setSubmitting(true);
  setError('');
  try {
    const order = await submitCheckout(cart.id, attempt.current.key);
    clearCart();
    navigateToOrder(order.id);
  } catch (error) {
    setError(error instanceof CheckoutConflict
      ? 'Your cart changed. Review it before starting again.'
      : 'We could not confirm your order. Your cart is saved; retry checkout.');
  } finally {
    setSubmitting(false);
  }
}

const total = calculateOrderTotal(cart.items);
<button disabled={submitting} onClick={placeOrder}>
  {submitting ? 'Placing order…' : error ? 'Retry checkout' : 'Place order'}
</button>`
  },
  {
    id: 'checkout-settings', kind: 'text', newPath: 'src/checkout/config.ts', summary: 'Centralize the checkout request timeout',
    after: `export const checkoutConfig = {
  timeoutMs: Number(import.meta.env.VITE_CHECKOUT_TIMEOUT_MS ?? 8000)
};`
  },
  {
    id: 'checkout-env', kind: 'text', oldPath: '.env.example', newPath: '.env.example', summary: 'Expose the checkout timeout in the example configuration',
    before: 'VITE_API_BASE=/api',
    after: `VITE_API_BASE=/api
VITE_CHECKOUT_TIMEOUT_MS=8000`
  },
  {
    id: 'checkout-api-tests', kind: 'text', oldPath: 'src/api/checkout.test.ts', newPath: 'src/api/checkout.test.ts', summary: 'Cover repeated attempts, changed carts, and concurrent requests',
    before: `it('creates an order', async () => {
  const result = await checkoutCart(seedCart());
  expect(result.status).toBe(201);
});`,
    after: `it('returns the existing order for the same attempt', async () => {
  const cart = seedCart();
  const first = await checkoutCart(cart, 'sample-attempt');
  const retry = await checkoutCart(cart, 'sample-attempt');
  expect(retry.status).toBe(200);
  expect(retry.order.id).toBe(first.order.id);
  expect(await countOrders(cart.id)).toBe(1);
});

it('rejects the same key after the cart changes', async () => {
  const cart = seedCart();
  await checkoutCart(cart, 'sample-attempt');
  const changed = await addItem(cart, sampleItem());
  expect((await checkoutCart(changed, 'sample-attempt')).status).toBe(409);
});

it('creates one order for concurrent requests', async () => {
  const cart = seedCart();
  const results = await Promise.all([
    checkoutCart(cart, 'sample-attempt'), checkoutCart(cart, 'sample-attempt')
  ]);
  expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
  expect(await countOrders(cart.id)).toBe(1);
});`
  },
  {
    id: 'checkout-recovery-tests', kind: 'text', newPath: 'src/checkout/Checkout.test.tsx', summary: 'Cover a timeout, saved cart, and explicit retry',
    after: `it('keeps the cart and reuses the attempt after a timeout', async () => {
  submitCheckout.mockRejectedValueOnce(new DOMException('Request timed out', 'TimeoutError'));
  submitCheckout.mockResolvedValueOnce({ id: 'sample-order' });
  render(<Checkout cart={sampleCart} />);
  await user.click(screen.getByRole('button', { name: 'Place order' }));
  expect(clearCart).not.toHaveBeenCalled();
  expect(screen.getByText(/Your cart is saved/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry checkout' }));
  expect(submitCheckout.mock.calls[1][1]).toBe(submitCheckout.mock.calls[0][1]);
  expect(navigateToOrder).toHaveBeenCalledWith('sample-order');
});`
  },
  {
    id: 'order-totals', kind: 'rename', oldPath: 'src/cart/calculate-total.ts', newPath: 'src/orders/totals.ts', summary: 'Share the integer-cent totals helper between the screen and API',
    before: `export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}`,
    after: `export function calculateOrderTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}`
  },
  {
    id: 'checkout-guide', kind: 'text', oldPath: 'docs/checkout.md', newPath: 'docs/checkout.md', summary: 'Document retries, changed carts, and the timeout setting',
    before: `# Checkout

Submit a cart to POST /api/checkout to create an order.`,
    after: `# Checkout

POST /api/checkout requires an Idempotency-Key for each checkout attempt.
Retry the same cart with the same key to receive its existing order.
Start a new attempt after editing the cart; a reused key returns 409.

## Recovering from a timeout

The cart stays visible. Choose Retry checkout to reuse the current attempt.
The client does not retry automatically. A timeout may occur after the order is saved.
VITE_CHECKOUT_TIMEOUT_MS sets the wait; the default is 8000 milliseconds.`
  },
  {
    id: 'checkout-metrics', kind: 'text', newPath: 'src/checkout/metrics.ts', summary: 'Add counters for retry and conflict outcomes',
    after: `export function recordCheckoutOutcome(outcome: 'created' | 'reused' | 'conflict') {
  metrics.increment('checkout.outcome', { outcome });
}`
  },
  {
    id: 'checkout-ci', kind: 'text', oldPath: '.github/workflows/checks.yml', newPath: '.github/workflows/checks.yml', summary: 'Add a focused checkout smoke check to CI',
    before: `steps:
  - run: npm ci
  - run: npm run typecheck`,
    after: `steps:
  - run: npm ci
  - run: npm run typecheck
  - run: npm run test:checkout`
  },
  {
    id: 'checkout-generated', kind: 'text', newPath: 'docs/generated/checkout-api.json', summary: 'Regenerate the checkout request schema',
    after: `{
  "operation": "checkout",
  "method": "POST",
  "path": "/api/checkout",
  "requiredHeaders": ["Idempotency-Key"],
  "responses": [200, 201, 400, 409]
}`
  }
];

const source: Source = {
  id: 'demo-source', scope: 'demo-scope', rootName: 'sample-store', branch: 'feature/checkout-recovery', baseRef: 'main',
  baseCommit: 'demo-base', headCommit: 'demo-head', mergeBase: 'demo-base', capturedAt: '2026-01-15T12:00:00.000Z', fingerprint: 'synthetic-checkout-review',
  units: files.map((file) => ({
    id: file.id, kind: file.kind, newPath: file.newPath, summary: file.summary,
    ...(file.oldPath !== undefined ? { oldPath: file.oldPath } : {}),
    ...(file.before !== undefined ? { before: { start: 1, end: file.before.split('\n').length } } : {}),
    after: { start: 1, end: file.after.split('\n').length }
  })),
  evidence: {}
};

const report: Report = {
  schemaVersion: 1, revision: 'demo-revision', parent: null, scope: 'demo-scope', sourceId: 'demo-source', publishedAt: '2026-01-15T12:30:00.000Z',
  author: { kind: 'agent', name: 'Demo reviewer' },
  entities: [
    { id: 'cart-screen', label: 'Checkout screen', refs: ['checkout-screen', 'checkout-recovery-tests'] },
    { id: 'checkout-request', label: 'Checkout request', refs: ['checkout-route', 'checkout-client', 'checkout-api-tests'] },
    { id: 'order-storage', label: 'Saved order', refs: ['order-service', 'attempt-migration'] },
    { id: 'confirmation', label: 'Order confirmation', refs: ['checkout-screen', 'order-service'] },
    { id: 'timeout-settings', label: 'Timeout setting', refs: ['checkout-settings', 'checkout-env'] },
    { id: 'regression-suite', label: 'Checkout regression tests', refs: ['checkout-api-tests', 'checkout-recovery-tests'] },
    { id: 'shared-total', label: 'Order total', refs: ['order-totals'] },
    { id: 'recovery-guide', label: 'Recovery guide', refs: ['checkout-guide'] }
  ],
  stories: [
    {
      id: 'safe-checkout-retries', title: 'Retry checkout without placing a second order',
      summary: 'Repeating a checkout request now returns the existing order. Editing the cart starts a new attempt, so an earlier order cannot be mistaken for the updated one.',
      groups: [{ kind: 'implementation', refs: ['checkout-route', 'order-service', 'attempt-migration'] }, { kind: 'tests', refs: ['checkout-api-tests'] }],
      decisions: [
        { summary: 'Use one attempt key until the cart changes', rationale: 'A lost response can hide an order that was already saved. Reusing the key lets a retry find that order.', inspect: 'Follow Idempotency-Key from the route into createOnce.', refs: ['checkout-route', 'order-service'] },
        { summary: 'Protect the order in storage, as well as on the button', rationale: 'Disabling the button helps with repeated clicks, but two requests can still arrive together. The transaction lock and unique key protect the saved order.', inspect: 'Compare the transaction in service.ts with the unique index in the migration.', refs: ['order-service', 'attempt-migration'] },
        { summary: 'Reject a reused key if the cart changed', rationale: 'Returning a previous order for different items would be misleading. A 409 response asks the screen to start a new attempt.', refs: ['checkout-route', 'order-service', 'checkout-api-tests'] }
      ],
      impact: [
        { from: 'checkout-request', to: 'order-storage', level: 'direct', summary: 'The request checks for an order saved under the same attempt before creating another one.', refs: ['checkout-route', 'order-service', 'attempt-migration'] },
        { from: 'order-storage', to: 'confirmation', level: 'direct', summary: 'A retry returns the original order ID, so confirmation opens the same order.', refs: ['order-service'] },
        { from: 'regression-suite', to: 'order-storage', level: 'direct', summary: 'The added cases check that repeated and concurrent attempts leave one saved order.', refs: ['checkout-api-tests'] }
      ]
    },
    {
      id: 'recover-slow-checkout', title: 'Keep your cart when checkout takes too long',
      summary: 'A slow or failed response keeps your cart on screen and offers Retry checkout. The retry reuses the current attempt instead of silently starting another order.',
      groups: [{ kind: 'implementation', refs: ['checkout-screen', 'checkout-client', 'order-service'] }],
      decisions: [
        { summary: 'Clear the cart only after confirmation', rationale: 'A request failure does not mean the order failed. Keeping the cart visible gives the person a clear recovery path.', inspect: 'clearCart stays in the success branch; the failure branch preserves the attempt.', refs: ['checkout-screen'] },
        { summary: 'Make retry an explicit choice', rationale: 'Automatic retries can leave someone unsure whether checkout is still running. The button shows progress, then lets them choose the next attempt.', refs: ['checkout-screen', 'checkout-client'] }
      ],
      impact: [
        { from: 'checkout-request', to: 'cart-screen', level: 'direct', summary: 'A timeout changes the message and button while leaving the cart available.', refs: ['checkout-client', 'checkout-screen'] },
        { from: 'cart-screen', to: 'confirmation', level: 'inferred', summary: 'A visible recovery action may help someone finish an order after a slow response.', refs: ['checkout-screen'] }
      ]
    },
    {
      id: 'checkout-timeout', title: 'Set one timeout for checkout requests',
      summary: 'Checkout now waits up to eight seconds before offering recovery. The timeout is configured in one place and can be adjusted for a slower environment.',
      groups: [{ kind: 'config', refs: ['checkout-settings', 'checkout-env'] }, { kind: 'implementation', refs: ['checkout-client'] }],
      decisions: [
        { summary: 'Use a shared setting with an eight-second default', rationale: 'A fixed value inside the request code is easy to overlook. The example configuration makes the wait visible when setting up the application.', refs: ['checkout-settings', 'checkout-env', 'checkout-client'] },
        { summary: 'Treat timeout as uncertainty, not cancellation', rationale: 'Stopping the browser request does not undo an order saved by the server. Recovery must use the same attempt key.', refs: ['checkout-client'] }
      ],
      impact: [
        { from: 'timeout-settings', to: 'checkout-request', level: 'direct', summary: 'The client reads the shared setting to decide how long it waits for a response.', refs: ['checkout-settings', 'checkout-env', 'checkout-client'] },
        { from: 'checkout-request', to: 'cart-screen', level: 'direct', summary: 'When the wait expires, the screen offers recovery instead of remaining in the placing-order state.', refs: ['checkout-client'] }
      ]
    },
    {
      id: 'checkout-regressions', title: 'Cover retries, changed carts, and slow responses',
      summary: 'New regression cases cover repeated requests, concurrent attempts, a changed cart, and retrying after a timeout. They check the order returned and whether the cart is preserved.',
      groups: [{ kind: 'tests', refs: ['checkout-api-tests', 'checkout-recovery-tests'] }],
      decisions: [
        { summary: 'Check the visible outcome and saved order', rationale: 'One response alone cannot show whether an extra order was created. The API cases count saved orders; the screen case checks the cart and retry action.', refs: ['checkout-api-tests', 'checkout-recovery-tests'] }
      ],
      impact: [
        { from: 'regression-suite', to: 'order-storage', level: 'direct', summary: 'API cases check one order for repeated requests and a conflict when the cart changes.', refs: ['checkout-api-tests'] },
        { from: 'regression-suite', to: 'cart-screen', level: 'direct', summary: 'The screen case checks that a timeout preserves the cart and retry reuses the attempt key.', refs: ['checkout-recovery-tests'] }
      ]
    },
    {
      id: 'shared-order-totals', title: 'Use the same order total on screen and server',
      summary: 'The checkout screen and API now share the integer-cent totals helper. Its calculation stays the same, keeping the displayed total and saved order aligned.',
      groups: [{ kind: 'refactor', refs: ['order-totals', 'checkout-route', 'checkout-screen'] }],
      decisions: [
        { summary: 'Move the helper without changing the calculation', rationale: 'Sharing the existing integer-cent calculation removes a duplicate implementation without mixing a pricing change into checkout recovery.', inspect: 'The helper is renamed; both callers now import it from orders/totals.', refs: ['order-totals', 'checkout-route', 'checkout-screen'] }
      ],
      impact: [
        { from: 'shared-total', to: 'cart-screen', level: 'direct', summary: 'The screen uses the shared helper for the total shown before placing the order.', refs: ['order-totals', 'checkout-screen'] },
        { from: 'shared-total', to: 'order-storage', level: 'direct', summary: 'The route passes that same calculation to the order service.', refs: ['order-totals', 'checkout-route'] }
      ]
    },
    {
      id: 'checkout-recovery-docs', title: 'Explain what to do after a checkout timeout',
      summary: 'The checkout guide now explains when to reuse an attempt key, when an edited cart needs a new one, and where to adjust the timeout.',
      groups: [{ kind: 'docs', refs: ['checkout-guide'] }], decisions: [], impact: []
    }
  ],
  exclusions: [{ refs: ['checkout-generated'], reason: 'Generated API snapshot repeats the route contract covered by the checkout story.' }]
};

export const demoState = { status: 'demo', pending: ['checkout-metrics', 'checkout-ci'], source, report };
export const demoEvidenceText: Record<string, { before?: string; after?: string }> = Object.fromEntries(files.map((file) => [file.id, {
  ...(file.before !== undefined ? { before: file.before } : {}), after: file.after
}]));
