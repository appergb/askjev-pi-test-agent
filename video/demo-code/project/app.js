const get = (id) => document.getElementById(id);
function update() {
  const quantity = Number(get('quantity').value);
  const coupon = get('coupon').value.trim();
  const pickup = get('delivery').value === 'pickup';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    get('error').textContent = '数量必须为 1 至 20 的整数';
    return;
  }
  const subtotal = quantity * 20;
  const shipping = pickup || subtotal > 100 ? 0 : 5;
  const discount = coupon === 'SAVE10' ? subtotal * 0.05 : 0;
  get('error').textContent = '';
  for (const [id, value] of Object.entries({ subtotal, shipping, discount, total: subtotal - discount + shipping })) get(id).textContent = value.toFixed(2);
}
get('recalculate').addEventListener('click', update);
update();
