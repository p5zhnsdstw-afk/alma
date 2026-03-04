-- Migrate billing columns from Stripe to Paddle (Merchant of Record)
-- For existing master DBs that had Stripe columns.

ALTER TABLE families RENAME COLUMN stripe_customer_id TO paddle_customer_id;
ALTER TABLE families RENAME COLUMN stripe_subscription_id TO paddle_subscription_id;
ALTER TABLE billing_events RENAME COLUMN stripe_event_id TO paddle_event_id;
