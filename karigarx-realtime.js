// ─── karigarx-realtime.js ─────────────────────────────────────────────────────
// Drop this <script> into your HTML AFTER socket.io CDN script.
// CDN: <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
//
// USAGE SUMMARY:
//   KarigarX.init()          → call once on page load
//   KarigarX.submitQuote()   → called when user clicks "Add to Quote"
//   KarigarX.vendorLogin()   → called when vendor opens dashboard
//   KarigarX.submitPrice()   → called when vendor sets their price
// ─────────────────────────────────────────────────────────────────────────────

const API = 'http://localhost:4000/api';   // ← change to your server URL in prod

const KarigarX = (() => {

  let socket = null;
  let currentOrderId   = null;
  let currentVendorId  = null;
  const quoteMap = {};   // vendorId → { name, price, status, isBest }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    socket = io('http://localhost:4000');   // ← same as API host

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('⚡ Socket disconnected');
    });

    // ── Events the USER receives ───────────────────────────────────────────
    socket.on('quote_received', (data) => {
      console.log('💬 Quote from', data.vendorName, '₹' + data.price);
      quoteMap[data.vendorId] = data;
      renderQuoteBoard();
    });

    socket.on('best_price_updated', (data) => {
      console.log('🏆 Best price updated:', data.bestPrice, 'by', data.bestVendorName);
      renderQuoteBoard();
    });

    socket.on('vendor_rejected', (data) => {
      console.log('❌ Vendor passed:', data.vendorName);
      if (quoteMap[data.vendorId]) {
        quoteMap[data.vendorId].status = 'rejected';
      }
      renderQuoteBoard();
    });

    socket.on('order_expired', () => {
      showToast('⏰ Quote window has expired.');
      const el = document.getElementById('quote-board');
      if (el) el.innerHTML += '<p style="color:#C04A3A;text-align:center;margin-top:12px">Order expired — no more quotes accepted.</p>';
    });

    // ── Events the VENDOR receives ─────────────────────────────────────────
    socket.on('new_order', (order) => {
      console.log('📦 New order received:', order.orderId);
      renderVendorIncomingOrder(order);
    });

    socket.on('quote_accepted', (data) => {
      showToast(`🎉 Your quote of ₹${data.price} was accepted by ${data.userName}!`);
    });

    socket.on('vendor_ready', (data) => {
      console.log('🏭 Vendor ready:', data.message);
    });
  }

  // ── USER: Submit quote request ("Add to Quote" button) ───────────────────
  async function submitQuote() {
    // Clear old state
    Object.keys(quoteMap).forEach(k => delete quoteMap[k]);

    // Gather config from existing ST (your app's state object)
    const userId = getOrCreateUserId();
    const config = ST.config;
    const estimatedPrice = parseEstimatedPrice();

    showQuoteModal('loading');

    try {
      const res = await fetch(`${API}/orders`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userName:  'Guest User',    // Replace with actual user input
          userPhone: '',
          userCity:  config.city || '',
          config: {
            category:     ST.selectedCategory,
            chairType:    ST.selectedChairType?.id,
            designName:   ST.selectedDesign?.name,
            material:     config.material,
            finish:       config.finish,
            frameColor:   config.frameColor,
            cushionColor: config.cushionColor,
            dimensions: {
              width:      config.w,
              depth:      config.d,
              height:     config.h,
              seatHeight: config.sh,
            },
            accessories: Object.keys(config.accessories || {}).filter(k => config.accessories[k]),
            addons:      Object.keys(config.addons || {}).filter(k => config.addons[k]),
            fabricMode:  config.fabricMode,
          },
          estimatedPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');

      currentOrderId = data.orderId;

      // Initialize quoteMap with waiting state for each vendor
      data.vendors.forEach(v => {
        quoteMap[v.vendorId] = {
          vendorId:   v.vendorId,
          vendorName: v.vendorName,
          status:     'pending',
          price:      null,
          isBest:     false,
        };
      });

      // Join the socket room for live updates
      socket.emit('join_order', { orderId: currentOrderId });

      showQuoteModal('waiting');
      renderQuoteBoard();

    } catch (err) {
      console.error('submitQuote error:', err);
      showToast('❌ ' + err.message);
      closeQuoteModal();
    }
  }

  // ── USER: Accept a specific vendor's quote ────────────────────────────────
  async function acceptQuote(quoteId) {
    if (!currentOrderId || !quoteId) return;

    try {
      const res = await fetch(`${API}/orders/${currentOrderId}/accept`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('🎉 Quote accepted! Vendor will contact you shortly.');
      closeQuoteModal();

    } catch (err) {
      showToast('❌ ' + err.message);
    }
  }

  // ── VENDOR: Go online ─────────────────────────────────────────────────────
  async function vendorLogin(vendorId) {
    currentVendorId = vendorId;
    socket.emit('vendor_online', { vendorId });

    // Load existing pending orders
    try {
      const res = await fetch(`${API}/vendors/${vendorId}/orders?status=pending`);
      const data = await res.json();

      const container = document.getElementById('vendor-incoming');
      if (!container) return;

      if (!data.quotes?.length) {
        container.innerHTML = '<p style="color:var(--text3);text-align:center;padding:20px">No pending orders yet. Stay online!</p>';
        return;
      }

      data.quotes.forEach(q => renderVendorIncomingOrder({ ...q.order, quoteId: q.quoteId }));
    } catch (err) {
      console.error('vendorLogin error:', err);
    }
  }

  // ── VENDOR: Submit price ──────────────────────────────────────────────────
  async function submitPrice(orderId, price, note, deliveryDays) {
    if (!currentVendorId) return;

    try {
      const res = await fetch(`${API}/vendors/${currentVendorId}/quote`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, price, note, deliveryDays }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('✅ Price submitted successfully!');

      // Update card to show submitted state
      const card = document.getElementById(`vendor-order-${orderId}`);
      if (card) {
        card.querySelector('.vendor-submit-area').innerHTML =
          `<div style="background:rgba(74,103,65,0.12);border-radius:10px;padding:12px;text-align:center;color:#4A6741;font-weight:600">
            ✓ Quoted: ₹${parseFloat(price).toLocaleString('en-IN')}
           </div>`;
      }

    } catch (err) {
      showToast('❌ ' + err.message);
    }
  }

  // ── VENDOR: Reject an order ───────────────────────────────────────────────
  async function rejectOrder(orderId) {
    if (!currentVendorId) return;

    try {
      await fetch(`${API}/vendors/${currentVendorId}/reject`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const card = document.getElementById(`vendor-order-${orderId}`);
      if (card) card.remove();

      showToast('Order passed.');
    } catch (err) {
      showToast('❌ ' + err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI RENDERERS
  // ─────────────────────────────────────────────────────────────────────────

  // Renders the live quote board on the user side
  function renderQuoteBoard() {
    const board = document.getElementById('quote-board');
    if (!board) return;

    const vendors = Object.values(quoteMap);
    const submitted = vendors.filter(v => v.status === 'submitted');
    const bestPrice = submitted.length ? Math.min(...submitted.map(v => v.price)) : null;

    board.innerHTML = vendors.map(v => {
      const isBest = v.price !== null && v.price === bestPrice;

      let statusBadge = '';
      let priceDisplay = '';
      let actionBtn = '';

      if (v.status === 'pending') {
        statusBadge = `<span style="background:#FFF3CD;color:#856404;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700">⏳ Waiting</span>`;
        priceDisplay = `<span style="color:var(--text3);font-size:14px">—</span>`;
      } else if (v.status === 'submitted') {
        statusBadge = isBest
          ? `<span style="background:#D4EDDA;color:#155724;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700">🏆 Best Price</span>`
          : `<span style="background:#E8E0D2;color:var(--text2);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700">✓ Quoted</span>`;
        priceDisplay = `<span style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:${isBest ? 'var(--green)' : 'var(--bark)'}">₹${v.price.toLocaleString('en-IN')}</span>`;
        actionBtn = `<button onclick="KarigarX.acceptQuote('${v.quoteId}')" style="background:${isBest ? 'var(--green)' : 'var(--bark)'};color:white;border:none;border-radius:10px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;width:100%">
          ${isBest ? '🏆 Accept Best' : 'Accept Quote'}
        </button>`;
      } else if (v.status === 'rejected') {
        statusBadge = `<span style="background:#F8D7DA;color:#721C24;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700">✗ Passed</span>`;
        priceDisplay = `<span style="color:var(--text3);font-size:14px">Unavailable</span>`;
      }

      return `
        <div style="background:${isBest ? 'rgba(74,103,65,0.06)' : 'var(--cream2)'};border:1.5px solid ${isBest ? 'rgba(74,103,65,0.35)' : 'var(--border)'};border-radius:16px;padding:16px;transition:all 0.3s">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-weight:600;font-size:15px;color:var(--bark)">${v.vendorName}</div>
            ${statusBadge}
          </div>
          <div style="margin:10px 0">${priceDisplay}</div>
          ${v.note ? `<div style="font-size:12px;color:var(--text3);font-style:italic;margin-bottom:8px">"${v.note}"</div>` : ''}
          ${v.deliveryDays && v.status === 'submitted' ? `<div style="font-size:12px;color:var(--text3)">🚚 ${v.deliveryDays} days delivery</div>` : ''}
          ${actionBtn}
        </div>`;
    }).join('');
  }

  // Renders an incoming order card in the vendor dashboard
  function renderVendorIncomingOrder(order) {
    const container = document.getElementById('vendor-incoming');
    if (!container) return;

    // Remove "no orders" placeholder
    const placeholder = container.querySelector('[data-placeholder]');
    if (placeholder) placeholder.remove();

    const orderId = order.orderId;
    if (document.getElementById(`vendor-order-${orderId}`)) return; // already rendered

    const cfg = order.config || {};
    const timeLeft = order.expiresAt
      ? Math.max(0, Math.round((new Date(order.expiresAt) - Date.now()) / 1000 / 60))
      : '?';

    const card = document.createElement('div');
    card.id = `vendor-order-${orderId}`;
    card.style.cssText = 'background:var(--white);border:1.5px solid var(--border);border-radius:20px;padding:24px;margin-bottom:16px;animation:fadeUp 0.4s ease';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--bark)">${order.userName || 'Customer'} • ${order.userCity || ''}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">Est. ₹${order.estimatedPrice?.toLocaleString('en-IN') || '—'} &nbsp;|&nbsp; ⏰ ${timeLeft} min left</div>
        </div>
        <span style="background:#FFF3CD;color:#856404;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;white-space:nowrap">New Request</span>
      </div>

      <div style="background:var(--cream2);border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;color:var(--text2);line-height:1.8">
        <strong style="color:var(--bark)">${cfg.designName || 'Custom Chair'}</strong><br/>
        Material: ${cfg.material || '—'} &nbsp;·&nbsp; Finish: ${cfg.finish || '—'}<br/>
        Dimensions: ${cfg.dimensions?.width}W × ${cfg.dimensions?.depth}D × ${cfg.dimensions?.height}H cm
        ${cfg.accessories?.length ? `<br/>Accessories: ${cfg.accessories.join(', ')}` : ''}
      </div>

      <div class="vendor-submit-area">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em">Your Price (₹)</label>
            <input type="number" id="price-${orderId}" placeholder="e.g. 5500" style="width:100%;border:1.5px solid var(--border2);border-radius:10px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:14px;background:var(--cream2);color:var(--text);outline:none"/>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em">Delivery Days</label>
            <input type="number" id="days-${orderId}" value="7" style="width:100%;border:1.5px solid var(--border2);border-radius:10px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:14px;background:var(--cream2);color:var(--text);outline:none"/>
          </div>
        </div>
        <input type="text" id="note-${orderId}" placeholder="Message to customer (optional)" style="width:100%;border:1.5px solid var(--border2);border-radius:10px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:13px;background:var(--cream2);color:var(--text);outline:none;margin-bottom:10px"/>
        <div style="display:flex;gap:10px">
          <button onclick="KarigarX._submitPrice('${orderId}')" style="flex:1;background:var(--bark);color:white;border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer">
            Submit Price →
          </button>
          <button onclick="KarigarX._rejectOrder('${orderId}')" style="background:var(--cream3);color:var(--text3);border:none;border-radius:12px;padding:12px 16px;font-size:14px;cursor:pointer">
            Pass
          </button>
        </div>
      </div>`;

    container.prepend(card);
  }

  // ── QUOTE MODAL ───────────────────────────────────────────────────────────
  function showQuoteModal(state) {
    let modal = document.getElementById('karigarx-quote-modal');

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'karigarx-quote-modal';
      modal.style.cssText = `
        position:fixed;inset:0;z-index:9000;background:rgba(28,14,5,0.5);
        display:flex;align-items:center;justify-content:center;padding:20px;
        backdrop-filter:blur(4px);animation:fadeIn 0.3s ease`;
      modal.innerHTML = `
        <div style="background:var(--cream);border-radius:28px;width:100%;max-width:520px;padding:32px;box-shadow:0 30px 80px rgba(61,43,31,0.35);max-height:90vh;overflow-y:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
            <div>
              <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:var(--bark)">Live Quote Board</div>
              <div style="font-size:13px;color:var(--text3);margin-top:2px">Vendors are pricing your order in real-time</div>
            </div>
            <button onclick="KarigarX._closeModal()" style="background:var(--cream3);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:18px;color:var(--text2)">×</button>
          </div>

          <div id="quote-modal-loading" style="text-align:center;padding:40px 0">
            <div class="spinner" style="margin:0 auto 16px"></div>
            <p style="color:var(--text2)">Sending to vendors…</p>
          </div>

          <div id="quote-modal-board" style="display:none">
            <div style="background:var(--cream2);border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;color:var(--text2)">Your Estimate</span>
              <span style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--bark)">₹${parseEstimatedPrice().toLocaleString('en-IN')}</span>
            </div>
            <div id="quote-board" style="display:flex;flex-direction:column;gap:12px"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    if (state === 'loading') {
      document.getElementById('quote-modal-loading').style.display = 'block';
      document.getElementById('quote-modal-board').style.display  = 'none';
    } else if (state === 'waiting') {
      document.getElementById('quote-modal-loading').style.display = 'none';
      document.getElementById('quote-modal-board').style.display  = 'block';
    }

    modal.style.display = 'flex';
  }

  function closeQuoteModal() {
    const modal = document.getElementById('karigarx-quote-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function getOrCreateUserId() {
    let id = localStorage.getItem('karigarx_uid');
    if (!id) {
      id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('karigarx_uid', id);
    }
    return id;
  }

  function parseEstimatedPrice() {
    const el = document.getElementById('price-display');
    if (!el) return 0;
    return parseInt(el.textContent.replace(/[^\d]/g, '')) || 0;
  }

  function showToast(msg) {
    const t = document.getElementById('toast') || document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.textContent = msg;
    t.style.display = 'flex';
    document.body.appendChild(t);
    setTimeout(() => { t.style.display = 'none'; }, 3500);
  }

  // Internal wrappers used by onclick in vendor card HTML
  function _submitPrice(orderId) {
    const price = document.getElementById(`price-${orderId}`)?.value;
    const note  = document.getElementById(`note-${orderId}`)?.value;
    const days  = document.getElementById(`days-${orderId}`)?.value;
    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      showToast('Please enter a valid price');
      return;
    }
    submitPrice(orderId, parseFloat(price), note, parseInt(days) || 7);
  }

  function _rejectOrder(orderId) { rejectOrder(orderId); }
  function _closeModal()         { closeQuoteModal(); }

  return {
    init,
    submitQuote,
    acceptQuote,
    vendorLogin,
    submitPrice,
    rejectOrder,
    renderQuoteBoard,
    // Internal
    _submitPrice,
    _rejectOrder,
    _closeModal,
  };

})();

// Auto-init on load
window.addEventListener('DOMContentLoaded', () => KarigarX.init());
