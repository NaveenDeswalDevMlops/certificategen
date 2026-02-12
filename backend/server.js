const express = require('express');
const multer = require('multer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const TRAINING_PARTNER = 'LearningCurve Institute';
const AUTHORIZED_SIGNATORY = 'Maya Rivera';
const SIGNATORY_TITLE = 'Director of Certification Excellence';

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

function drawHumanSignature(doc, x, y) {
  doc.save();
  doc.lineWidth(2.1).strokeColor('#1f2937');

  doc
    .moveTo(x, y)
    .bezierCurveTo(x + 16, y - 18, x + 26, y + 6, x + 42, y - 8)
    .bezierCurveTo(x + 52, y - 16, x + 64, y - 2, x + 78, y - 4)
    .bezierCurveTo(x + 88, y - 6, x + 94, y - 22, x + 104, y - 10)
    .bezierCurveTo(x + 114, y + 4, x + 132, y + 1, x + 148, y - 9)
    .bezierCurveTo(x + 164, y - 20, x + 176, y + 6, x + 190, y - 4)
    .stroke();

  doc
    .moveTo(x + 84, y - 25)
    .bezierCurveTo(x + 88, y - 42, x + 102, y - 41, x + 109, y - 25)
    .stroke();

  doc.restore();
}

function drawLearningCurveLogo(doc, x, y) {
  doc.save();
  doc.translate(x, y);

  // Logical "learning blocks" mark inspired by modular data platforms.
  doc.rect(0, 8, 18, 18).fill('#c026d3');
  doc.rect(12, 0, 18, 18).fill('#7c3aed');
  doc.rect(24, 8, 18, 18).fill('#0ea5e9');
  doc
    .polygon([0, 8], [12, 0], [30, 0], [18, 8])
    .fill('#a21caf');

  doc
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('LearnCurve Bricks', 54, 2);

  doc
    .fillColor('#475569')
    .font('Helvetica')
    .fontSize(12)
    .text('LearningCurve Certified', 55, 26);

  doc.restore();
}

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

  // Premium frame
  doc
    .roundedRect(20, 20, pageWidth - 40, doc.page.height - 40, 10)
    .lineWidth(1.2)
    .stroke('#0f172a');
  doc
    .roundedRect(28, 28, pageWidth - 56, doc.page.height - 56, 8)
    .lineWidth(0.8)
    .stroke('#cbd5e1');

  drawLearningCurveLogo(doc, 58, 52);

  doc
    .fillColor('#334155')
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('PROFESSIONAL CERTIFICATION', margin, 95, { align: 'center' });

  doc
    .fillColor('#0f172a')
    .fontSize(30)
    .font('Helvetica-Bold')
    .text('Certificate of Achievement', margin, 112, { align: 'center' });

  doc
    .fillColor('#334155')
    .fontSize(14)
    .font('Helvetica')
    .text('This certifies that', margin, 162, { align: 'center' });

  doc
    .fillColor('#0f172a')
    .fontSize(28)
    .font('Helvetica-Bold')
    .text(learnerName, margin, 186, { align: 'center' });

  doc
    .fillColor('#334155')
    .fontSize(13)
    .font('Helvetica')
    .text('has successfully completed all requirements and earned', margin, 228, {
      align: 'center',
      width: pageWidth - margin * 2,
    });

  doc.roundedRect(50, 258, pageWidth - 100, 58, 6).fill('#0f4c81');
  doc
    .fillColor('#f8fafc')
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(`LearningCurve Certified ${certificateName}`, margin, 277, { align: 'center' });

  // Left image panel
  doc
    .fontSize(11)
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .text('Verified Exam Image', 82, 350, { width: 150, align: 'center' })
    .roundedRect(76, 372, 164, 154, 6)
    .lineWidth(1)
    .stroke('#64748b');

  if (examImageBuffer) {
    doc.image(examImageBuffer, 84, 380, {
      fit: [148, 138],
      align: 'center',
      valign: 'center',
    });
  }

  // Right detail panel
  doc
    .fontSize(13)
    .fillColor('#111827')
    .font('Helvetica-Bold')
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
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('Issued By', 310, 475)
    .font('Helvetica')
    .fontSize(12)
    .text(trainingPartner, 310, 495);

  drawHumanSignature(doc, 540, 470);

  doc.moveTo(532, 498).lineTo(745, 498).lineWidth(1).strokeColor('#111').stroke();
  doc
    .fontSize(12)
    .fillColor('#111')
    .font('Helvetica-Bold')
    .text(AUTHORIZED_SIGNATORY, 532, 504)
    .font('Helvetica')
    .fontSize(10)
    .text(SIGNATORY_TITLE, 532, 520)
    .fontSize(10)
    .text(`Authorized Signatory • ${trainingPartner}`, 532, 534)
    .text(`Certificate ID: ${certificateId}`, 532, 548);

  const qrBuffer = Buffer.from(qrDataURL.replace(/^data:image\/png;base64,/, ''), 'base64');
  doc.image(qrBuffer, 692, 360, { fit: [72, 72] });
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text('Scan to verify', 686, 437, { width: 84, align: 'center' });
}

app.post('/api/certificates', upload.single('photo'), async (req, res) => {
  try {
    const learnerName = (req.body.name || '').trim();
    const certificateName = (req.body.certificateName || '').trim();

    if (!learnerName) {
      return res.status(400).json({ error: 'Learner name is required.' });
    }

    if (!certificateName) {
      return res.status(400).json({ error: 'Certificate name is required.' });
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
      certificateName,
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
      certificateName,
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
