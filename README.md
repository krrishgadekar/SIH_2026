# Explainable AI for Diabetic Retinopathy Screening in Rural India (DR✦AI)

A dual-tier AI-powered clinical screening and diagnostic platform designed to detect Diabetic Retinopathy (DR) in low-resource rural Primary Health Centres (PHCs) and seamlessly triage patients to tertiary hospitals.

Inspired by cyber-brutalist and high-density telemetry dashboards, the platform prioritizes real-time explainability (Grad-CAM), offline-first resilience, and actionable clinical decision support.

---

## 🏗 System Architecture

The project consists of two core applications:

```
Explainable-AI-for-Diabetic-Retinopathy-in-Rural-India/
├── phc-local-app/             # Rural Clinic Edge Node
│   └── frontend/              # Offline-first React + Vite local screening client
├── central-system/            # Tertiary Hospital / Specialist Hub
│   └── frontend/              # Central review, explainability, & district administration
├── datasets/                  # Retinal fundus training & validation sets
├── simulink-model/            # Optical simulation & edge hardware models
└── docs/                      # Clinical protocols and architecture blueprints
```

---

## 🌟 Key Capabilities

### 1. PHC Local Screening Station (`phc-local-app`)
* **Offline-First Patient Registration**: Full demographic intake, vitals (BP, HbA1c, glucose), and diabetic history.
* **Retinal Fundus Image Acquisition**: Guided capture protocol with image quality assurance.
* **Edge Inference Engine**: Immediate classification across standard clinical stages (Normal, Mild NPDR, Moderate NPDR, Severe NPDR, PDR).
* **Local Sync Queue**: Encrypted offline store with store-and-forward sync when connectivity resumes.

### 2. Central Diagnostics & Triage Hub (`central-system`)
* **Dual-Role Access**: Dedicated portals for Ophthalmologists and District Health Administrators.
* **Explainable AI (Grad-CAM)**: Real-time visual heatmaps pinpointing microaneurysms, hemorrhages, and exudates.
* **Dual-Branch Comparison**: Multi-stage model cross-validation with feature attribution confidence scores.
* **Clinical Decision Support**: Specialist confirmation, severity override, referral dispatch, and longitudinal patient audit trail.
* **District Admin Analytics**: Bento-grid surveillance with screening rates, disease prevalence, and PHC node health.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm or yarn

### 1. Running PHC Local Station
```bash
cd phc-local-app/frontend
npm install
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

### 2. Running Central Diagnostics System
```bash
cd central-system/frontend
npm install
npm run dev
```
Open **[http://localhost:5174](http://localhost:5174)** in your browser.

*Note: Both applications come pre-configured with interactive clinical mock datasets (`USE_MOCK_DATA = true`), enabling full offline testing without external database dependencies.*

---

## 🎨 Design Philosophy

* High-contrast brutalist aesthetics with dark-room clinical palette (`#E63B2E` / `#0A0A0A`).
* Interactive canvas waves depicting retinal pulse frequencies.
* Monospace telemetry logs and tactile cyber-clinical controls.
