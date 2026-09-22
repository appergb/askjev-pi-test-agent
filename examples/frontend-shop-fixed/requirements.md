# Storefront acceptance contract

The product unit price is 20.00 yuan. All amount fields display exactly two decimal places without a currency symbol. Change inputs then click the Update Order button (#recalculate) to render totals.

With quantity 1, delivery ship, and no coupon, subtotal is 20.00, shipping is 5.00, discount is 0.00, and total is 25.00.
With quantity 3, delivery ship, and no coupon, subtotal is 60.00, shipping is 5.00, discount is 0.00, and total is 65.00.
With quantity 5, delivery ship, and no coupon, subtotal is 100.00, shipping is 0.00, and total is 100.00: free shipping applies when the pre-discount subtotal is at least 100.00.
With quantity 6, delivery ship, and no coupon, subtotal is 120.00, shipping is 0.00, and total is 120.00.
With quantity 2, delivery ship, and coupon SAVE10, subtotal is 40.00, discount is 4.00 (10% of subtotal), shipping is 5.00, and total is 41.00. Coupon discount never applies to shipping.
With quantity 1, delivery pickup, and no coupon, subtotal is 20.00, shipping is 0.00, and total is 20.00: pickup has no shipping fee.
