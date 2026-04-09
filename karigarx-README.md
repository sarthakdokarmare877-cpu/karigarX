# KarigarX — Real-Time Multi-Vendor Quote System

## Folder Structure

```
karigarx-backend/
├── server.js              ← Entry point
├── .env                   ← Config (port, mongo url, timeout)
├── seed.js                ← Creates test vendors
├── karigarx-realtime.js   ← DROP THIS INTO your frontend HTML
│
├── models/
│   ├── User.js            ← User schema
│   ├── Vendor.js          ← Vendor schema (isOnline, socketId)
│   ├── Order.js           ← Order with config + target vendors
│   └── Quote.js           ← Per-vendor quote (pending→submitted→accepted)
│
├── routes/
│   ├── orders.js          ← POST /api/orders, GET quotes, POST accept
│   └── vendors.js         ← GET orders, POST quote, POST reject
│
└── socket/
    └── index.js           ← Socket.IO event handlers
```

---

## 1. Setup & Run Backend

```bash
# Install
cd karigarx-backend
npm install

# Start MongoDB (make sure it's running)
mongod

# Seed test vendors
node seed.js

# Run dev server
npm run dev
```

Server starts at: **http://localhost:4000**

---

## 2. Frontend Integration (3 steps)

### Step A — Add these 2 scripts to your HTML `<head>`:
```html
<script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
<script src="karigarx-realtime.js"></script>
```

### Step B — Update "Add to Quote" button in step6-page:
```html
<!-- Replace the existing "Add to Quote" button with: -->
<button class="btn btn-gold" onclick="KarigarX.submitQuote()">
  Add to Quote 🎉
</button>
```

### Step C — Add vendor incoming orders container in vendor-page:
```html
<!-- Add this inside your #vendor-page div, after the stats grid -->
<div style="margin-bottom:24px">
  <div style="font-weight:600;font-size:18px;color:var(--bark);margin-bottom:16px">
    📦 Incoming Requests
  </div>
  <div id="vendor-incoming">
    <p data-placeholder style="color:var(--text3);text-align:center;padding:20px">
      Go online to receive orders
    </p>
  </div>
</div>
```

Then replace your vendor cards' onclick with:
```html
<div class="role-card" onclick="goVendor(); vendorGoOnline()">
```

Add this function to your script:
```js
function vendorGoOnline() {
  // For demo: use a seeded vendor ID from seed.js output
  const VENDOR_ID = 'PASTE_VENDOR_ID_FROM_SEED_HERE';
  KarigarX.vendorLogin(VENDOR_ID);
}
```

---

## 3. How the Real-Time Flow Works

```
USER clicks "Add to Quote"
        │
        ▼
POST /api/orders
  → Creates Order in MongoDB
  → Creates pending Quote for each vendor
  → Emits 'new_order' via Socket.IO to each vendor room
        │
        ├── Socket joins order_{orderId} room (user watches live)
        │
        ▼
VENDOR dashboard receives 'new_order' event
  → Card appears with price input + "Submit" button
        │
        ▼
VENDOR submits price:
POST /api/vendors/:vendorId/quote
  → Updates Quote in DB (status: submitted)
  → Emits 'quote_received' to order room
  → Emits 'best_price_updated' if new best
        │
        ▼
USER sees price appear in real-time
  → Quote board updates live
  → Best price highlighted in green
  → Accept button appears per vendor
        │
        ▼
USER clicks Accept:
POST /api/orders/:orderId/accept
  → Order status = accepted
  → Winning vendor gets 'quote_accepted' socket event
  → Other vendors' quotes = rejected
```

---

## 4. API Reference

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/orders` | Create order + ping vendors |
| GET  | `/api/orders/:id/quotes` | Get current quotes for order |
| POST | `/api/orders/:id/accept` | User accepts a quote |
| GET  | `/api/vendors` | List all vendors |
| POST | `/api/vendors` | Register vendor |
| GET  | `/api/vendors/:id/orders` | Vendor's incoming orders |
| POST | `/api/vendors/:id/quote` | Vendor submits price |
| POST | `/api/vendors/:id/reject` | Vendor rejects order |

---

## 5. Socket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `join_order` | Client→Server | `{ orderId }` |
| `vendor_online` | Client→Server | `{ vendorId }` |
| `new_order` | Server→Vendor | Full order config |
| `quote_received` | Server→User | Quote with price |
| `best_price_updated` | Server→User | `{ bestPrice, bestVendorName }` |
| `vendor_rejected` | Server→User | `{ vendorId, vendorName }` |
| `quote_accepted` | Server→Vendor | `{ orderId, price, userName }` |
| `order_expired` | Server→User | `{ orderId }` |

---

## 6. Timeout Logic

- Order expires after `QUOTE_TIMEOUT_MS` (default: 120000ms = 2 min)
- Set in `.env`: `QUOTE_TIMEOUT_MS=300000` for 5 min
- After expiry: order status → "expired", user sees message

---

## 7. Quick Test (without frontend)

```bash
# Create a test vendor via API
curl -X POST http://localhost:4000/api/vendors \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Vendor","email":"v@test.com","city":"Mumbai"}'

# Create an order
curl -X POST http://localhost:4000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo_user",
    "userName": "Ravi",
    "config": {"material":"Teak","finish":"Matte"},
    "estimatedPrice": 6500
  }'

# Submit a quote (use orderId + vendorId from above)
curl -X POST http://localhost:4000/api/vendors/VENDOR_ID/quote \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORDER_ID","price":5800,"note":"Best quality guaranteed","deliveryDays":5}'
```
