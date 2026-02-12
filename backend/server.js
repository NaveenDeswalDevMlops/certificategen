const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- CONFIG ----------------
const TRAINING_PARTNER = 'LearningCurve Institute';
const CERTIFICATION_PREFIX = 'LearningCurve Certified';
const AUTHORIZED_SIGNATORY = 'Peter Smith';
const SIGNATORY_TITLE = 'Director of Certification Excellence';

const SIGNATURE_IMAGE_PATH = path.join(__dirname, 'assets', 'signature.png');
const SIGNATURE_IMAGE_BUFFER = fs.existsSync(SIGNATURE_IMAGE_PATH)
  ? fs.readFileSync(SIGNATURE_IMAGE_PATH)
  : null;

// Layout constants (PREVENT OVERLAP)
const SIGNATURE_X = 532;
const SIGNATURE_Y = 390;
const AUTHORITY_TEXT_Y = 470;

const QR_SIZE = 72;
const QR_X_OFFSET = 120;
const QR_Y = 500;

// ----------------------------------------

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

const certificateStore = new Map();

// ---------------- HELPERS ----------------
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function drawHumanSignature(doc, x, y) {
  doc.save();
  doc.lineWidth(2).strokeColor('#1f2937');
  doc
    .moveTo(x, y)
    .bezierCurveTo(x + 30, y - 20, x + 70, y + 10, x + 120, y - 10)
    .bezierCurveTo(x + 150, y - 20, x + 180, y + 10, x + 210, y - 5)
    .stroke();
  doc.restore();
}

function drawLearningCurveLogo(doc, x, y) {
  doc.save();
  doc.translate(x, y);
  doc.rect(0, 8, 18, 18).fill('#c026d3');
  doc.rect(12, 0, 18, 18).fill('#7c3aed');
  doc.rect(24, 8, 18, 18).fill('#0ea5e9');

  doc
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(TRAINING_PARTNER, 54, 2);

  doc
    .fillColor('#475569')
    .font('Helvetica')
    .fontSize(12)
    .text('Professional Certification Authority', 55, 26);
  doc.restore();
}

// ---------------- CERTIFICATE LAYOUT ----------------
function drawCertificateLayout(doc, details) {
  const {
    learnerName,
    certificateName,
    certificateId,
    issueDate,
    expiryDate,
    trainingPartner,
    examImageBuffer,
    qrDataURL,
  } = details;

  const pageWidth = doc.page.width;
  const margin = 45;
  const QR_X = pageWidth - QR_X_OFFSET;

  // Frame
  doc.roundedRect(20, 20, pageWidth - 40, doc.page.height - 40, 10).stroke();
  doc.roundedRect(28, 28, pageWidth - 56, doc.page.height - 56, 8).stroke('#cbd5e1');

  drawLearningCurveLogo(doc, 58, 52);

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#334155')
    .text('PROFESSIONAL CERTIFICATION', margin, 95, { align: 'center' });

  doc
    .fontSize(24)
    .fillColor('#0f172a')
    .text(certificateName, margin, 112, { align: 'center' });

  doc
    .fontSize(14)
    .fillColor('#334155')
    .font('Helvetica')
    .text('Awarded to', margin, 170, { align: 'center' });

  doc
    .fontSize(28)
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .text(learnerName, margin, 194, { align: 'center' });

  doc
    .fontSize(13)
    .fillColor('#334155')
    .font('Helvetica')
    .text(
      'has completed the prescribed training AND passed the associated assessment.',
      margin,
      240,
      { align: 'center', width: pageWidth - margin * 2 }
    );

  // Photo panel
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Candidate Assessment Photo', 82, 350, { width: 150, align: 'center' });

  doc.roundedRect(76, 372, 164, 154, 6).stroke();

  if (examImageBuffer) {
    doc.image(examImageBuffer, 84, 380, { fit: [148, 138] });
  }

  // Dates
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('Date of Issue', 310, 365)
    .font('Helvetica')
    .fontSize(12)
    .text(issueDate, 310, 385)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('Date of Expiry', 310, 420)
    .font('Helvetica')
    .fontSize(12)
    .text(expiryDate, 310, 440)
    .fontSize(9)
    .text(
      'This credential is valid until expiry unless renewed under recertification policy.',
      310,
      456,
      { width: 210 }
    );

  // ---------------- SIGNATURE ZONE ----------------
  if (SIGNATURE_IMAGE_BUFFER) {
    doc.image(SIGNATURE_IMAGE_BUFFER, SIGNATURE_X, SIGNATURE_Y, {
      fit: [210, 70],
    });
  } else {
    drawHumanSignature(doc, SIGNATURE_X, SIGNATURE_Y + 25);
  }

  doc
    .moveTo(SIGNATURE_X, SIGNATURE_Y + 80)
    .lineTo(SIGNATURE_X + 210, SIGNATURE_Y + 80)
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(AUTHORIZED_SIGNATORY, SIGNATURE_X, AUTHORITY_TEXT_Y)
    .font('Helvetica')
    .fontSize(10)
    .text(SIGNATORY_TITLE, SIGNATURE_X, AUTHORITY_TEXT_Y + 16)
    .text(`Authorized Signatory • ${trainingPartner}`, SIGNATURE_X, AUTHORITY_TEXT_Y + 30)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Issued By', SIGNATURE_X, AUTHORITY_TEXT_Y + 48)
    .font('Helvetica')
    .fontSize(10)
    .text(trainingPartner, SIGNATURE_X, AUTHORITY_TEXT_Y + 64);

  // ---------------- QR VERIFICATION ZONE ----------------
  const qrBuffer = Buffer.from(qrDataURL.split(',')[1], 'base64');
  doc.image(qrBuffer, QR_X, QR_Y, { fit: [QR_SIZE, QR_SIZE] });

  doc
    .fontSize(9)
    .fillColor('#475569')
    .text('Scan to verify', QR_X - 6, QR_Y + 78, {
      width: 84,
      align: 'center',
    });

  doc
    .fontSize(8)
    .fillColor('#1f2937')
    .text(`Certificate ID: ${certificateId}`, QR_X - 40, QR_Y + 94, {
      width: 140,
      align: 'center',
    });

  doc
    .fontSize(9)
    .fillColor('#334155')
    .text(`Issued by ${TRAINING_PARTNER}`, margin, 576, {
      width: pageWidth - margin * 2,
      align: 'center',
    });
}

// ---------------- API ----------------
app.post('/api/certificates', upload.single('photo'), async (req, res) => {
  try {
    const learnerName = (req.body.name || '').trim();
    const requestedCertificateName = (req.body.certificateName || '').trim();

    if (!learnerName || !requestedCertificateName || !req.file) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const certificateId = uuidv4();
    const issueDate = formatDate(new Date());
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 2);

    const verificationUrl = `${req.protocol}://${req.get('host')}/api/verify/${certificateId}`;
    const qrDataURL = await QRCode.toDataURL(verificationUrl);

    certificateStore.set(certificateId, {
      learnerName,
      certificateName: `${CERTIFICATION_PREFIX} ${requestedCertificateName}`,
      issueDate,
      expiryDate: formatDate(expiry),
      verificationUrl,
    });

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks = [];

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      res
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="certificate-${certificateId}.pdf"`)
        .send(Buffer.concat(chunks));
    });

    drawCertificateLayout(doc, {
      learnerName,
      certificateName: `${CERTIFICATION_PREFIX} ${requestedCertificateName}`,
      certificateId,
      issueDate,
      expiryDate: formatDate(expiry),
      trainingPartner: TRAINING_PARTNER,
      examImageBuffer: req.file.buffer,
      qrDataURL,
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Certificate generation failed.' });
  }
});

app.get('/api/verify/:id', (req, res) => {
  const cert = certificateStore.get(req.params.id);
  if (!cert) return res.status(404).json({ valid: false });
  res.json({ valid: true, cert });
});

app.listen(PORT, () => {
  console.log(`✅ Certificate server running on http://localhost:${PORT}`);
});
