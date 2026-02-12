# LearningCurve Certificate Generator

A complete full-stack web app that lets a user:
- Enter their full name.
- Capture a passport-style photo using webcam.
- Generate and download a certificate PDF.
- Verify generated certificates by unique certificate ID.

## Tech Stack
- **Frontend:** HTML, CSS, Vanilla JavaScript (`frontend/`)
- **Backend:** Node.js + Express (`backend/server.js`)
- **PDF:** `pdfkit`
- **QR code:** `qrcode`
- **File upload:** `multer`
- **Certificate ID:** `uuid`

## Project Structure

```text
certificategen/
├── backend/
│   └── server.js
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── package.json
└── README.md
```

## Features
1. User fills in their name.
2. User opens webcam and captures photo.
3. App previews captured photo.
4. User submits data to backend.
5. Backend:
   - Validates input.
   - Generates unique certificate ID.
   - Creates PDF with:
     - **Title:** Certificate of Completion
     - Large centered learner name
     - Embedded passport-style photo
     - Unique certificate ID
     - Completion statement mentioning **LearningCurve**
     - Date of completion
     - Signature placeholder
     - QR code linking to verification endpoint
6. PDF is returned to frontend and downloaded automatically.
7. Verification endpoint confirms certificate validity.

## Run Locally

### 1) Install dependencies
```bash
npm install
```

### 2) Start the server
```bash
npm start
```

### 3) Open in browser
Visit:
- Main app: `http://localhost:3000`
- Verify endpoint format: `http://localhost:3000/api/verify/<certificate-id>`

## API Endpoints

### `POST /api/certificates`
Accepts multipart form data:
- `name` (string)
- `photo` (image file)

Returns:
- `application/pdf` (downloadable certificate)
- Header: `X-Certificate-Id` containing generated ID

### `GET /api/verify/:id`
Returns JSON:
- `valid: true/false`
- Certificate details if found

## Notes
- Certificate records are stored **in memory** for simplicity.
- Restarting server clears verification history.
- For production, replace in-memory store with a database.
