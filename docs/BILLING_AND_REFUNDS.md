# Billing and Refunds

This document describes how billing, subscriptions, plans, invoices, and refunds currently work in the platform.

## 1. Billing Overview

The platform uses Stripe for subscription billing.

Core billing capabilities:

- subscription checkout
- plan management
- billing portal handoff
- invoice PDF generation
- admin revenue reporting
- admin refund handling

## 2. Plans

Plans are platform-managed from admin settings.

Each plan can define:

- plan ID
- display name
- description
- badge
- price
- currency
- interval
- storage limit
- link allowance
- active / inactive state
- public visibility on the pricing page
- sort order
- feature list

Important:

- plans can exist without being publicly visible
- hidden plans can still be targeted by direct plan links or internal flows

## 3. Subscription Lifecycle

At a high level:

1. customer selects a plan
2. checkout is initiated
3. Stripe returns a session / subscription state
4. the platform records billing artifacts and updates subscription state
5. billing portal can be used for payment-method management

## 4. Plan Visibility and Pricing Page Behavior

The pricing page supports:

- public / hidden plan toggles
- direct plan links
- admin-managed presentation order

Use hidden plans for:

- private offers
- migration plans
- enterprise-only plans
- support-issued plan links

## 5. Revenue Reporting

The admin dashboard includes revenue reporting such as:

- gross revenue
- refunded amount
- net revenue
- payment counts
- payment success rate
- plan performance
- recent refunds
- range filters:
  - 7 days
  - 30 days
  - 90 days
  - 365 days
  - all time
  - custom date range

## 6. Invoices

The platform supports invoice PDF generation.

Invoice-related controls include:

- invoice template settings
- admin invoice edits
- customer billing details used for invoice identity
- downloadable invoice PDFs for completed payments

Customer-entered tax/billing data affects future invoices, but invoice control is still an admin-governed surface.

## 7. Refund Model

Admins can issue:

- full refunds
- partial refunds

Refund input supports:

- amount
- reason
- internal note

Refunds are reflected in:

- billing records
- admin reporting
- refund-related audit visibility

## 8. Important Refund Behavior

A refund does **not automatically cancel** access or subscription unless additional business logic explicitly does that.

That separation is intentional because:

- refund and cancellation are not always the same business action
- some operators may refund as goodwill while preserving access

Operators should decide whether a refund should also trigger:

- subscription cancellation
- subscription pause
- manual access removal

## 9. Admin Refund Procedure

Recommended process:

1. open the user in admin billing details
2. locate the relevant paid transaction
3. choose full or partial refund
4. add a reason and internal note
5. confirm the refund
6. verify the updated reporting and audit trail

After a refund, also review whether the account should remain active.

## 10. Failed Payment Handling

The platform tracks failed payments and exposes related visibility in reporting.

Operationally, failed-payment handling should include:

- review of the customer billing state
- review of subscription status
- decision on grace period or access restriction

If dunning is expanded further, this doc should be updated with:

- retry schedule
- reminder timing
- downgrade rules
- cancellation thresholds

## 11. Stripe Configuration Notes

Sensitive billing configuration includes:

- Stripe secret key
- Stripe webhook secret
- plan configuration
- checkout behavior

Recommended practice:

- use sandbox/test mode for validation
- verify mode changes carefully
- review reporting after changes

## 12. Common Billing Support Cases

### A. User says they paid but have no access

Check:

- Stripe transaction status
- stored transaction record
- user subscription status
- period end / active state

### B. User says invoice info is wrong

Check:

- billing profile fields
- invoice snapshot for that payment
- whether the invoice should be corrected admin-side

### C. User wants refund

Check:

- payment state
- amount
- plan/access implications
- whether access should remain active after refund

## 13. Recommended Operator Controls

For finance-sensitive operations:

- keep refunds limited to admins or super admins
- review refund notes regularly
- monitor refunded totals against net revenue
- keep billing changes visible in audit flows

## 14. Future Billing Enhancements

Likely next-level finance features:

1. MRR and churn reporting
2. dunning analytics
3. tax summary reporting
4. CSV export for finance reports
5. Stripe-dashboard-side refund sync verification

