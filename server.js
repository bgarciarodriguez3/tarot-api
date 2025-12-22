const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

const SHOP = process.env.SHOP;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

app.use(cors());

app.get('/api/validate-order', async (req, res) => {
  const orderId = req.query.order;
  if (!orderId) return res.status(400).json({ error: 'order missing' });

  try {
    const orderResp = await fetch(
      `https://${SHOP}/admin/api/2024-10/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!orderResp.ok) {
      const txt = await orderResp.text();
      return res.status(orderResp.status).send(txt);
    }

    const { order } = await orderResp.json();
    const paid = order.financial_status === 'paid';

    const products = [];

    for (const li of order.line_items) {
      const mfResp = await fetch(
        `https://${SHOP}/admin/api/2024-10/products/${li.product_id}/metafields.json`,
        {
          headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN }
        }
      );

      let deck = null;

      if (mfResp.ok) {
        const mfJson = await mfResp.json();
        const mf = (mfJson.metafields || []).find(
          m => m.namespace === 'tarot' && m.key === 'deck'
        );
        if (mf) {
          try {
            deck = JSON.parse(mf.value);
          } catch {
            deck = mf.value;
          }
        }
      }

      products.push({
        id: li.product_id,
        title: li.name,
        deck
      });
    }

    res.json({ valid: true, paid, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API running on', port));
