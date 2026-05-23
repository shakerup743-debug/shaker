-- Product variants / options feature (sizes, add-ons, etc.)
-- Each product can carry a list of option-groups; each group has a list of choices.
-- Order items remember the selections plus the original base price.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS option_groups JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_options JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS base_unit_price NUMERIC(10, 2);
