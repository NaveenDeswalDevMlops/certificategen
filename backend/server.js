const express = require('express');
const multer = require('multer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const TRAINING_PARTNER = 'Learning Curve';
const AUTHORIZED_SIGNATORY = 'Jody Soeiro de Faria';
const SIGNATORY_TITLE = 'AVP, Curriculum & User Success';

// Multer stores uploaded image in memory so we can embed directly in the generated PDF.
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// In-memory data store for generated certificates.
// For production you would replace this with a database.
const certificateStore = new Map();

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildRandomSignaturePath(seed) {
  const baseY = 462;
  const points = [];

  for (let i = 0; i < 7; i += 1) {
    points.push({
      x: 510 + i * 20,
      y: baseY + Math.sin(seed + i * 1.4) * 12 + (i % 2 ? -4 : 4),
    });
  }

  return points;
}

function drawLearningCurveLogo(doc, x, y) {
  doc.save();
  doc.translate(x, y);

  doc.rect(0, 0, 32, 24).lineWidth(1.2).stroke('#e11d48');
  doc
    .moveTo(4, 17)
    .lineTo(12, 11)
    .lineTo(20, 15)
    .lineTo(28, 7)
    .stroke('#e11d48');

  doc
    .fillColor('#111')
    .fontSize(30)
    .font('Helvetica-Bold')
    .text('learning curve', 44, -4);

  doc
    .fillColor('#374151')
    .fontSize(17)
    .font('Helvetica')
    .text('Certified', 48, 30);

  doc.restore();
}

function drawCertificateLayout(doc, details) {
  const {
    learnerName,
    certificateId,
    issueDate,
    expiryDate,
    trainingPartner,
    examImageBuffer,
    qrDataURL,
  } = details;

  const pageWidth = doc.page.width;
  const margin = 45;

  doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(2).stroke('#0f172a');

  drawLearningCurveLogo(doc, 75, 45);

  doc
    .fillColor('#1f2937')
    .fontSize(24)
    .font('Helvetica')
    .text(learnerName, margin, 120, { align: 'center' });

  doc
    .fillColor('#1f2937')
    .fontSize(15)
    .font('Helvetica')
    .text(
      'has successfully passed the requirements to obtain the following Learning Curve Certification:',
      margin,
      168,
      { align: 'center', width: pageWidth - margin * 2 }
    );

  doc.rect(25, 240, pageWidth - 50, 74).fill('#67a4d9');
  doc
    .fillColor('#fff')
    .font('Helvetica-Bold')
    .fontSize(33)
    .text('Learning Curve Certified Exam Passed', margin, 260, { align: 'center' });

  doc
    .fillColor('#111')
    .fontSize(17)
    .font('Helvetica-Bold')
    .text('Date of Issue:', 75, 365)
    .font('Helvetica')
    .text(issueDate, 75, 390)
    .font('Helvetica-Bold')
    .text('Date of Expiry:', 75, 430)
    .font('Helvetica')
    .text(expiryDate, 75, 455);

  doc
    .fontSize(12)
    .fillColor('#111')
    .font('Helvetica-Bold')
    .text('Exam Image', 325, 355, { width: 130, align: 'center' })
    .rect(320, 375, 140, 140)
    .lineWidth(1)
    .stroke('#64748b');

  if (examImageBuffer) {
    doc.image(examImageBuffer, 325, 380, {
      fit: [130, 130],
      align: 'center',
      valign: 'center',
    });
  }

  const signatureSeed = Math.random() * 10;
  const signaturePoints = buildRandomSignaturePath(signatureSeed);

  doc.save();
  doc.lineWidth(2).strokeColor('#334155').moveTo(500, 470);
  signaturePoints.forEach((point) => {
    doc.lineTo(point.x, point.y);
  });
  doc.stroke();
  doc.restore();

  doc.moveTo(500, 496).lineTo(735, 496).lineWidth(1).strokeColor('#111').stroke();
  doc
    .fontSize(12)
    .fillColor('#111')
    .font('Helvetica')
    .text(AUTHORIZED_SIGNATORY, 500, 502)
    .fontSize(10)
    .text(SIGNATORY_TITLE, 500, 518)
    .fontSize(10)
    .text(`Authorized Signatory • ${trainingPartner}`, 500, 532)
    .text(`Certificate ID: ${certificateId}`, 500, 546);

  const qrBuffer = Buffer.from(qrDataURL.replace(/^data:image\/png;base64,/, ''), 'base64');
  doc.image(qrBuffer, 680, 365, { fit: [80, 80] });
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text('Scan to verify', 675, 448, { width: 94, align: 'center' });
}

app.post('/api/certificates', upload.single('photo'), async (req, res) => {
  try {
    const learnerName = (req.body.name || '').trim();

    if (!learnerName) {
      return res.status(400).json({ error: 'Learner name is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Exam image is required.' });
    }

    const certificateId = uuidv4();
    const issueDateObject = new Date();
    const expiryDateObject = new Date(issueDateObject);
    expiryDateObject.setFullYear(expiryDateObject.getFullYear() + 2);

    const issueDate = formatDate(issueDateObject);
    const expiryDate = formatDate(expiryDateObject);
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/verify/${certificateId}`;
    const qrDataURL = await QRCode.toDataURL(verificationUrl);

    // Save metadata for verification endpoint.
    certificateStore.set(certificateId, {
      certificateId,
      learnerName,
      issueDate,
      expiryDate,
      trainingPartner: TRAINING_PARTNER,
      createdAt: new Date().toISOString(),
      verificationUrl,
    });

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Certificate-Id', certificateId);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="certificate-${certificateId}.pdf"`
      );
      res.send(pdfBuffer);
    });

    drawCertificateLayout(doc, {
      learnerName,
      certificateId,
      issueDate,
      expiryDate,
      trainingPartner: TRAINING_PARTNER,
      examImageBuffer: req.file.buffer,
      qrDataURL,
    });

    doc.end();
  } catch (error) {
    console.error('Certificate generation failed:', error);
    res.status(500).json({ error: 'Failed to generate certificate PDF.' });
  }
});

// Verification endpoint checks whether certificate ID exists.
app.get('/api/verify/:id', (req, res) => {
  const certificate = certificateStore.get(req.params.id);

  if (!certificate) {
    return res.status(404).json({ valid: false, message: 'Certificate not found.' });
  }

  res.json({
    valid: true,
    message: 'Certificate is valid.',
    certificate,
  });
});

app.listen(PORT, () => {
  console.log(`Certificate app running at http://localhost:${PORT}`);
});
