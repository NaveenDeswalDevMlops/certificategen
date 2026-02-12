const express = require('express');
const multer = require('multer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const TRAINING_PARTNER = 'LearningCurve';

// Multer stores uploaded image in memory so we can embed directly in the generated PDF.
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// In-memory data store for generated certificates.
// For production you would replace this with a database.
const certificateStore = new Map();

function drawCertificateLayout(doc, details) {
  const {
    learnerName,
    certificateId,
    completionDate,
    trainingPartner,
    photoBuffer,
    qrDataURL,
  } = details;

  const pageWidth = doc.page.width;
  const margin = 50;

  // Border
  doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(2).stroke('#1f3b73');

  doc
    .fillColor('#1f3b73')
    .fontSize(32)
    .font('Helvetica-Bold')
    .text('Certificate of Completion', margin, 70, { align: 'center' });

  doc
    .moveDown(1)
    .fillColor('#333')
    .fontSize(14)
    .font('Helvetica')
    .text('This certifies that', margin, 150, { align: 'center' });

  doc
    .fillColor('#111')
    .fontSize(34)
    .font('Helvetica-Bold')
    .text(learnerName, margin, 180, { align: 'center' });

  doc
    .fillColor('#333')
    .fontSize(14)
    .font('Helvetica')
    .text(
      `has completed the training and passed the exam provided by ${trainingPartner}.`,
      margin,
      240,
      { align: 'center', width: pageWidth - margin * 2 }
    );

  // Passport-style photo block
  doc
    .fontSize(11)
    .fillColor('#111')
    .text('Passport Photo', margin + 35, 300, { width: 120, align: 'center' })
    .rect(margin, 320, 130, 160)
    .lineWidth(1)
    .stroke('#888');

  if (photoBuffer) {
    doc.image(photoBuffer, margin + 5, 325, {
      fit: [120, 150],
      align: 'center',
      valign: 'center',
    });
  }

  // Certificate metadata
  doc
    .fontSize(13)
    .fillColor('#111')
    .font('Helvetica-Bold')
    .text(`Certificate ID: ${certificateId}`, 220, 330)
    .font('Helvetica')
    .text(`Training Partner: ${trainingPartner}`, 220, 360)
    .text(`Date of Completion: ${completionDate}`, 220, 390);

  // Add QR code for verification endpoint.
  const qrBuffer = Buffer.from(qrDataURL.replace(/^data:image\/png;base64,/, ''), 'base64');
  doc.image(qrBuffer, pageWidth - 180, 430, { fit: [120, 120] });
  doc
    .fontSize(10)
    .fillColor('#444')
    .text('Scan to verify', pageWidth - 190, 555, { width: 140, align: 'center' });

  // Signature placeholder
  doc.moveTo(220, 520).lineTo(420, 520).strokeColor('#444').stroke();
  doc
    .fontSize(11)
    .fillColor('#444')
    .text('Authorized Signature', 260, 525);
}

app.post('/api/certificates', upload.single('photo'), async (req, res) => {
  try {
    const learnerName = (req.body.name || '').trim();

    if (!learnerName) {
      return res.status(400).json({ error: 'Learner name is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Passport-style photo is required.' });
    }

    const certificateId = uuidv4();
    const completionDate = new Date().toLocaleDateString();
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/verify/${certificateId}`;
    const qrDataURL = await QRCode.toDataURL(verificationUrl);

    // Save metadata for verification endpoint.
    certificateStore.set(certificateId, {
      certificateId,
      learnerName,
      completionDate,
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
      completionDate,
      trainingPartner: TRAINING_PARTNER,
      photoBuffer: req.file.buffer,
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
