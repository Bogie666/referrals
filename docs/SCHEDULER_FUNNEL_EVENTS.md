# Scheduler funnel events — contract for `scheduler-mu-three`

The LEX Perks app exposes a single endpoint the scheduler should beacon to as a friend moves through the booking funnel. Combined with the friend's earlier click on `/referral?r=CODE`, this turns the click-to-book gap into a real funnel on `/admin`.

## Endpoint

```
POST https://lexperks.com/api/funnel/event
Content-Type: application/json
```

CORS is enabled for `https://scheduler-mu-three.vercel.app`.

## Payload

```json
{
  "type":       "scheduler_opened",
  "code":       "U9YBE5",                     // optional, but include when known
  "session_id": "f1cb2e88-…-de4",             // pass through unchanged from LEXSchedulerConfig.sessionId
  "metadata":   { "service": "hvac" }         // optional jsonb passthrough
}
```

`code` and `session_id` are both optional but **at least one should be present** so the event can be stitched back to a referrer or a click. The app reads `session_id` from a cookie set on `/referral?r=CODE` and passes it into `window.LEXSchedulerConfig.sessionId` when the scheduler mounts.

## Event types (use exactly these strings)

| `type` | Fire when | Notes |
|---|---|---|
| `scheduler_opened`         | The scheduler UI becomes visible to the friend | First event. Cheapest to wire up. |
| `slot_selected`            | The friend picks a time slot | `metadata.slot_ts` is useful but not required. |
| `customer_info_submitted`  | The friend submits the name/phone/address step | Don't include PII in `metadata`. |
| `booking_confirmed`        | A booking call to ST succeeds | Include `metadata.st_job_id` if available so we can join to ST jobs later. |

Three of these (everything except `customer_info_submitted`) is already enough to read drop-off. Add `customer_info_submitted` if it's cheap.

## What the app does with these

- Each event becomes one row in `tracking_events` (event_type, referral_code, referrer_id, session_id, metadata, …).
- The admin dashboard's **Tracking** pill shows 24h totals per event type.
- A future funnel widget on the Overview tab will compute conversion % between stages.

## Read the session_id like this

The scheduler bundle is loaded from `/book?r=CODE`, which sets:

```js
window.LEXSchedulerConfig = {
  apiEndpoint:    "https://scheduler-mu-three.vercel.app/api/lex-booking",
  referralSlug:   "U9YBE5",
  referralCode:   "U9YBE5",
  sessionId:      "f1cb2e88-…-de4",        // ← read this
  funnelEndpoint: "https://lexperks.com/api/funnel/event",
  ...
};
```

When the scheduler is opened directly (not from `/book`), `sessionId` will be the empty string — still fire the event, just omit `session_id`. The app will fall back to the `lex_sid` cookie if the request is same-site.

## Minimum reference implementation

```js
function beaconFunnel(type, extras = {}) {
  const cfg = window.LEXSchedulerConfig || {};
  const url = cfg.funnelEndpoint || 'https://lexperks.com/api/funnel/event';
  const payload = {
    type,
    code:       cfg.referralCode || cfg.referralSlug || undefined,
    session_id: cfg.sessionId || undefined,
    metadata:   Object.keys(extras).length ? extras : undefined,
  };
  try {
    fetch(url, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      keepalive: true,
      body:      JSON.stringify(payload),
    }).catch(() => {});
  } catch (e) {}
}

// Then, at the right moments:
beaconFunnel('scheduler_opened');
beaconFunnel('slot_selected', { slot_ts: chosenSlot.toISOString() });
beaconFunnel('customer_info_submitted');
beaconFunnel('booking_confirmed', { st_job_id: booking.jobId });
```

The endpoint always returns `200 { success: true }` (even on validation failure for unknown event types — those return `400`). Beacons are fire-and-forget; the scheduler should never block on them.
