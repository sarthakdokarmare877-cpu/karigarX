# ⚙️ MetalCraft AI — Custom Metal Furniture Design Platform

> A full-stack hackathon project: AI-powered digital platform for designing, customizing, and costing custom metal furniture.

---

## 🖥️ Preview

Open `client/index.html` directly in your browser for a **zero-install** frontend experience.  
The backend provides API endpoints for production integration.

---

## 🗂️ Project Structure

```
metalcraft/
├── client/
│   └── index.html          ← Complete frontend (React + Tailwind CDN, standalone)
│
├── server/
│   ├── server.js           ← Express app entry point
│   ├── package.json
│   ├── routes/
│   │   ├── designs.js      ← POST /api/generate-designs
│   │   ├── costs.js        ← POST /api/calculate-cost
│   │   └── optimize.js     ← POST /api/optimize
│   └── controllers/
│       ├── designController.js
│       ├── costController.js
│       └── optimizeController.js
│
└── README.md
```

---

## 🚀 Quick Start

### Frontend (Standalone — No install needed)
```bash
# Just open in browser:
open client/index.html
```
The entire frontend runs from a single HTML file using CDN-loaded React & Babel.

### Backend (Node.js API)
```bash
cd server
npm install
npm run dev       # Development with nodemon
# OR
npm start         # Production
```
Server runs at: `http://localhost:5000`

---

## 🌐 API Endpoints

### `POST /api/generate-designs`
Generate AI design options based on user preferences.

**Request body:**
```json
{
  "category": "table",
  "subtype": "Modern",
  "theme": "Industrial",
  "material": "Steel",
  "color": "Matte Black",
  "dimensions": { "length": 120, "width": 60, "height": 75 }
}
```

**Response:**
```json
{
  "success": true,
  "designs": [
    {
      "id": 1,
      "name": "Apex Industrial",
      "style": "Industrial",
      "description": "...",
      "rating": 4.8,
      "complexity": "Medium"
    }
  ]
}
```

---

### `POST /api/calculate-cost`
Calculate detailed cost breakdown.

**Request body:**
```json
{
  "dimensions": { "length": 120, "width": 60, "height": 75 },
  "material": "Steel",
  "color": "Matte Black",
  "features": { "storage": true, "drawers": false },
  "hasOwnMaterial": false
}
```

**Response:**
```json
{
  "success": true,
  "breakdown": {
    "materialCost": 3200,
    "cuttingCost": 1150,
    "fabricationCost": 640,
    "wasteCost": 280,
    "featureCost": 1200
  },
  "totalCost": 6470,
  "currency": "INR"
}
```

---

### `POST /api/optimize`
Run sheet nesting optimization.

**Request body:**
```json
{
  "dimensions": { "length": 120, "width": 60, "height": 75 },
  "material": "Steel",
  "breakdown": { "wasteCost": 280 }
}
```

**Response:**
```json
{
  "success": true,
  "optimization": {
    "sheetsRequired": 2,
    "wasteBeforePercent": 22,
    "wasteAfterPercent": 13,
    "wasteSavedPercent": 9,
    "savedCost": 115,
    "summary": "Waste reduced by 9% — saving ₹115 in material costs."
  }
}
```

---

## 🎨 User Flow (7 Steps)

| Step | Page | Description |
|------|------|-------------|
| 1 | **Landing** | Hero + 12 furniture categories |
| 2 | **Category Select** | Choose category + subtype/style |
| 3 | **Customization** | Dimensions, material, color, features |
| 4 | **AI Generation** | 4 AI-designed options with loading animation |
| 5 | **Design Refine** | Fine-tune with live preview |
| 6 | **Cost Estimate** | Itemized breakdown + own-material toggle |
| 7 | **Optimization** | Sheet nesting simulation + savings |
| 8 | **Final Output** | Summary + downloadable text report |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Babel (CDN), Custom CSS |
| Styling | CSS Variables, Animations, Grid/Flex |
| Backend | Node.js, Express 4 |
| CORS | cors package |
| Fonts | Google Fonts (Outfit + Playfair Display) |

---

## 💎 Features

- ✅ **12 furniture categories** with icons
- ✅ **7-step guided wizard** with progress tracking
- ✅ **AI design generation** (simulated with loading animation)
- ✅ **Live preview** updates with dimension sliders
- ✅ **Detailed cost breakdown** (material, cutting, fabrication, waste)
- ✅ **"I have my own material"** toggle
- ✅ **Sheet nesting optimization** with visual grid
- ✅ **Download summary** as .txt file
- ✅ **Toast notifications** on each step
- ✅ **Fully responsive** mobile design
- ✅ **Dark premium theme** (purple/blue gradient)

---

## 🎯 Hackathon Notes

- The frontend is **fully self-contained** — just open `index.html`
- Backend is optional (frontend uses client-side calculations as fallback)
- All cost logic mirrors the backend formulas for consistency
- Designed to feel like a **real production product**

---

*Built with ❤️ for Hackathon 2024 | MetalCraft AI*
