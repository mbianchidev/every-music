# Monetization: plans, points, promotions, and sponsored content

[Documentation index](README.md) | [Configuration](configuration.md#payments-points-and-sponsored-content) | [API reference](api.md#monetization-billing-points-and-sponsored-content)

Every.music keeps artists and music lovers free. Optional paid features are:

- **Premium** (default EUR 3.99 per month): every freemium limit raised or
  removed, as configured in [plans and limits](configuration.md#plans-and-limits),
  plus the option to hide sponsored cards.
- **Partner**: Premium plus business pages, for booking agencies, organizers,
  and venues when `PARTNER_PLAN_REQUIRED=true`.
- **Points**: an in-app currency bought in packs or earned by inviting friends,
  rating the app, watching sponsored videos, and at special events. Points buy
  Premium days, profile boosts, call boosts, and call pins in an area.
- **Sponsored cards**: first-party, music-related offers chosen by
  administrators and shown in the feed and musician search. There are no
  third-party ad networks, no tracking identifiers, and only daily totals of
  views, clicks, and rewarded views are stored.

## How payments work

Payments use [Stripe Checkout](https://docs.stripe.com/payments/checkout) and
the official `stripe` Node.js SDK. The browser is redirected to a Stripe-hosted
page; card details never reach Every.music. Plans and points are granted only
from **signed webhook events**, never from the browser returning to the success
page, so closing the tab after paying is safe and forging a return URL grants
nothing.

1. `POST /realm/billing/checkout` creates (once per account, with an
   idempotency key) a Stripe customer and a Checkout Session for a plan or a
   points pack, and records the session.
2. Stripe calls `POST /realm/billing/webhook`. The API verifies the
   `Stripe-Signature` header against the **raw request bytes** with
   `STRIPE_WEBHOOK_SECRET`, stores the event ID, and applies the event in the
   same transaction. A repeated event ID is acknowledged without effects; a
   failure rolls back and Stripe retries.
3. Subscription events (`customer.subscription.created`, `updated`, `deleted`,
   `paused`, `resumed`) map to one entitlement row with source `stripe` and the
   subscription ID as reference. `active`, `trialing`, and `past_due` keep the
   plan until two days after the paid period ends; other statuses revoke it.
   Older events never override newer ones. `invoice.payment_failed` notifies
   the member. Completed or asynchronously paid Checkout Sessions for points
   packs credit the ledger once.
4. **Manage billing** opens the Stripe customer portal, where members change
   plans, update cards, see invoices, and cancel.

When an account is deleted its Stripe customer is detached; the monetization
job then deletes the customer in Stripe, which also cancels its subscriptions.
Stripe keeps its own payment records as required by law.

Refunds and disputes are handled in the Stripe Dashboard. A refund does not
remove points already credited; administrators can compensate manually.

## Set up Stripe in test mode

1. Create a Stripe account and stay in **test mode**. Copy the secret key
   (`sk_test_...`) into `STRIPE_SECRET_KEY` in `backend/.env` (or the root
   `.env` for Compose). Never commit it.
2. Create products and recurring monthly prices for Premium (for example
   EUR 3.99) and, optionally, Partner. Put the price IDs (`price_...`) in
   `STRIPE_PREMIUM_PRICE_ID` and `STRIPE_PARTNER_PRICE_ID`. Set
   `PREMIUM_MONTHLY_PRICE_MINOR` and `PARTNER_MONTHLY_PRICE_MINOR` to the same
   amounts in minor units; they are only displayed, Stripe charges its price.
3. For points packs, create one-time prices and list them in
   `STRIPE_POINTS_PACKS` as `id:points:price_id:amount_minor`, for example
   `starter:500:price_123:499,fan:1200:price_456:999`.
4. Enable the [customer portal](https://dashboard.stripe.com/test/settings/billing/portal)
   and allow plan switching between your prices if you offer both plans.
5. Forward webhooks locally with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

   ```bash
   stripe login
   stripe listen --forward-to localhost:8080/realm/billing/webhook \
     --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.payment_failed
   ```

   Copy the printed signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`
   and restart the API. Pay with a [test card](https://docs.stripe.com/testing)
   such as `4242 4242 4242 4242`.
6. In production, add a webhook endpoint in the Stripe Dashboard pointing at
   `https://<your API origin>/realm/billing/webhook` with the same events and
   use its signing secret. Checkout returns to the first `PORTAL_ORIGINS`
   entry (`/#store?checkout=success`).

Both secrets must be set together; with neither, the store shows "Payments are
not available on this server", payment routes return `503 PAYMENTS_DISABLED`,
and everything earned or spent with points keeps working.

## Points

The ledger is append-only: every change is an entry with a unique reference
(for example `stripe:<checkout session>`, `video:<view>`, `promotion:<id>`), so
replays never double-credit. Each change locks the member's balance row, so
concurrent purchases serialize and a balance can never become negative.

| Earn | Default | Rules |
|---|---|---|
| Points pack | per pack | Credited from the signed Stripe event |
| Invite a friend | 200 for you, 100 for them | When the invited account verifies its email; at most `REFERRAL_MONTHLY_CAP` rewarded invites per inviter per month (later ones are recorded as capped, the friend still gets points); no self or reciprocal invites; codes can be claimed only in the first `REFERRAL_CLAIM_DAYS` days of an account |
| Rate the app | 50, once per account | Granted by the monetization job for ratings that are not rewarded yet |
| Sponsored video | 10 per video, 10 a day | The server issues a single-use view token and credits points only after the minimum watch time measured on the server; starting another video abandons the previous token |
| Special events | chosen by an administrator | Audited `points_granted` entries with a note |

| Spend | Default cost | Notes |
|---|---|---|
| Premium days | 20 per day, 7 or 30 days | Queued after any Premium days already bought with points |
| Profile boost | 60 per day, 1, 3, or 7 days | Higher in musician search |
| Call boost | 60 per day | Higher in feed searches that match the call |
| Call pin | (80 + 10 per started 10 km of radius) per day | First in the feed for searches in the pinned area; radius 5 to 200 km |

## Discovery, promotions, and sponsored cards

On every results page, up to `PROMOTED_RESULTS_PER_PAGE` promoted results come
first, labelled **Promoted** in text with an icon: pins whose area contains the
searched place (or, without a location filter, the viewer's profile city),
then boosts. Promoted candidates are re-checked against the same filters,
visibility, and block rules as organic results, rotate daily, and appear only
once per page; organic results still fill the page. Boosts and pins expire on
their own.

Up to `SPONSORED_CARDS_PER_PAGE` sponsored cards are placed between results,
labelled **Sponsored** with the sponsor name. Cards target genres, instruments,
and an area, matching the search filters or, when the search has none, the
viewer's own profile. Links open in a new tab with
`rel="sponsored noopener noreferrer"`. The server counts impressions when it
places a card and clicks when the link is opened, as anonymous daily totals.

Members on a paid plan can hide sponsored cards in Settings. This is a perk,
not the default: sponsored cards are music offers that many members find
useful, and keeping them visible by default keeps the free plan sustainable.

Rewarded videos are either a linked `https` MP4/WebM file or a video uploaded
by an administrator (stored like other media, served with byte ranges).
YouTube and other embedded players are not used because they set their own
tracking identifiers.

## Platform fees and app stores

- **Stripe fees**: Stripe charges a fee per successful payment (a percentage
  plus a fixed amount, depending on the card and country) and may charge for
  the billing portal, invoices, and tax features. Price plans and packs so the
  net amount covers your costs, and check current pricing on stripe.com.
- **App store in-app purchases**: Apple's App Store and Google Play require
  their own billing for digital goods and subscriptions sold inside native
  apps in most regions, and take a commission (commonly 15 to 30 percent).
  Every.music's native shells reuse the web client, which opens Stripe
  Checkout. Before publishing native store builds you may need to hide
  purchases in those builds, link out where store rules allow it, or add
  StoreKit and Google Play Billing integrations that grant the same
  entitlements. That integration is **not implemented**; treat it as a release
  blocker for store distribution with payments enabled.
- **Pay to download**: a one-time price for the iOS or Android app (for
  example EUR 0.99) is set in App Store Connect or the Play Console listing,
  not in code. The stores take their commission from that price too. The web
  app stays free.
