const express = require('express');
const multer = require('multer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const TRAINING_PARTNER = 'Its Fake';
const SIGNATORY = {
  name: 'Avery Nolan',
  role: 'Director, Assessment & Certification',
  organization: 'Its Fake',
};

// Security note: the secret is server-only and used to sign human-readable IDs.
// Keep this value in environment variables in real deployments.
const CERTIFICATE_SECRET = process.env.CERTIFICATE_SECRET || 'replace-this-in-production';

// Multer stores uploaded image in memory so we can embed directly in the generated PDF.
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// In-memory data store for generated certificates.
// For production you would replace this with a database.
const certificateStore = new Map();

function createCertificateId() {
  const timestampPart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  const raw = `${timestampPart}-${randomPart}-${uuidv4()}`;
  const signature = crypto
    .createHmac('sha256', CERTIFICATE_SECRET)
    .update(raw)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();

  return `IFC-${timestampPart}-${randomPart}-${signature}`;
}

function drawCertificateLayout(doc, details) {
  const {
    learnerName,
    certificateId,
    issueDate,
    validUntil,
    trainingPartner,
    photoBuffer,
    qrDataURL,
    competencies,
  } = details;

  const pageWidth = doc.page.width;
  const margin = 50;

  // Border
  doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(2).stroke('#1f3b73');

  doc
    .fillColor('#1f3b73')
    .fontSize(27)
    .font('Helvetica-Bold')
    .text('Professional Credential Certificate', margin, 60, { align: 'center' });

  doc
    .fillColor('#334155')
    .fontSize(11)
    .font('Helvetica')
    .text('Issued by Its Fake Credentialing Council', margin, 94, { align: 'center' });

  doc
    .moveDown(1)
    .fillColor('#333')
    .fontSize(14)
    .font('Helvetica')
    .text('This certifies that', margin, 140, { align: 'center' });

  doc
    .fillColor('#111')
    .fontSize(34)
    .font('Helvetica-Bold')
    .text(learnerName, margin, 167, { align: 'center' });

  doc
    .fillColor('#333')
    .fontSize(14)
    .font('Helvetica')
    .text(
      `has COMPLETED TRAINING AND PASSED AN ASSESSMENT delivered by ${trainingPartner}.`,
      margin,
      223,
      { align: 'center', width: pageWidth - margin * 2 }
    );

  // Passport-style photo block
  // Trust decision: photo is always rendered in a fixed frame position for a consistent official layout.
  doc
    .fontSize(11)
    .fillColor('#111')
    .text('Passport Photo', margin + 35, 270, { width: 120, align: 'center' })
    .rect(margin, 290, 130, 160)
    .lineWidth(1)
    .stroke('#888');

  if (photoBuffer) {
    doc.image(photoBuffer, margin + 5, 295, {
      fit: [120, 150],
      align: 'center',
      valign: 'center',
    });
  }

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor('#0f172a')
    .text('Skills / Competencies Covered', 220, 285);

  const listStartX = 230;
  let listY = 310;
  competencies.forEach((item) => {
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#1e293b')
      .text(`• ${item}`, listStartX, listY, { width: 340 });
    listY += 21;
  });

  // Certificate metadata
  doc
    .fontSize(13)
    .fillColor('#111')
    .font('Helvetica-Bold')
    .text(`Certificate ID: ${certificateId}`, 220, 425)
    .font('Helvetica')
    .text(`Training Partner: ${trainingPartner}`, 220, 447)
    .text(`Issue Date: ${issueDate}`, 220, 469)
    .text(`Credential Validity: ${validUntil || 'No Expiry'}`, 220, 491);

  // Add QR code for verification endpoint.
  const qrBuffer = Buffer.from(qrDataURL.replace(/^data:image\/png;base64,/, ''), 'base64');
  doc.image(qrBuffer, pageWidth - 180, 400, { fit: [120, 120] });
  doc
    .fontSize(10)
    .fillColor('#444')
    .text('Scan to verify credential', pageWidth - 190, 525, { width: 140, align: 'center' });

  // Subtle emblem placeholder for professional presentation.
  doc.circle(pageWidth - 115, 175, 45).lineWidth(1).stroke('#94a3b8');
  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text('OFFICIAL\nSEAL', pageWidth - 140, 165, { width: 50, align: 'center' });

  // Signature block
  doc.moveTo(220, 545).lineTo(450, 545).strokeColor('#444').stroke();
  doc
    .fontSize(10)
    .fillColor('#334155')
    .text('Authorized Signatory', 220, 548)
    .font('Helvetica-Bold')
    .text(SIGNATORY.name, 220, 563)
    .font('Helvetica')
    .text(`${SIGNATORY.role}`, 220, 578)
    .text(`${SIGNATORY.organization}`, 220, 592);
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

    // Security note: certificate ID is generated exclusively on the backend.
    const certificateId = createCertificateId();
    const issueDate = new Date().toLocaleDateString();
    const validUntil = req.body.validUntil?.trim() || '';
    const competencies = [
      'Domain Fundamentals',
      'Assessment Readiness',
      'Professional Compliance & Ethics',
      'Applied Practical Demonstration',
    ];
    const verificationUrl = `${req.protocol}://${req.get('host')}/verify/${certificateId}`;
    const qrDataURL = await QRCode.toDataURL(verificationUrl);

    // Save metadata for verification endpoint.
    certificateStore.set(certificateId, {
      certificateId,
      learnerName,
      issueDate,
      validUntil: validUntil || null,
      competencies,
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
      validUntil,
      trainingPartner: TRAINING_PARTNER,
      photoBuffer: req.file.buffer,
      qrDataURL,
      competencies,
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

// Public verification endpoint requested for credential checks.
app.get('/verify/:id', (req, res) => {
  const certificate = certificateStore.get(req.params.id);

  if (!certificate) {
    return res.status(404).send(`
      <h1>Credential Not Found</h1>
      <p>The certificate ID <strong>${req.params.id}</strong> is not valid.</p>
    `);
  }

  return res.send(`
    <h1>Credential Verified ✅</h1>
    <p><strong>Name:</strong> ${certificate.learnerName}</p>
    <p><strong>Certificate ID:</strong> ${certificate.certificateId}</p>
    <p><strong>Issue Date:</strong> ${certificate.issueDate}</p>
    <p><strong>Training Partner:</strong> ${certificate.trainingPartner}</p>
  `);
});

app.listen(PORT, () => {
  console.log(`Certificate app running at http://localhost:${PORT}`);
});
