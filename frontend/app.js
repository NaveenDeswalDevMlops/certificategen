const form = document.getElementById('certificateForm');
const fullNameInput = document.getElementById('fullName');
const openCameraBtn = document.getElementById('openCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const examImagePreview = document.getElementById('examImagePreview');
const statusText = document.getElementById('status');

let mediaStream;
let capturedBlob;

openCameraBtn.addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = mediaStream;
    captureBtn.disabled = false;
    setStatus('Webcam is active. Capture an exam image.', false);
  } catch (error) {
    setStatus('Unable to access webcam. Please check browser camera permissions.', true);
    console.error(error);
  }
});

captureBtn.addEventListener('click', () => {
  if (!mediaStream) return;

  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(
    (blob) => {
      capturedBlob = blob;
      examImagePreview.src = URL.createObjectURL(blob);
      setStatus('Exam image captured. You can now generate the certificate.', false);
    },
    'image/jpeg',
    0.95
  );
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!fullNameInput.value.trim()) {
    setStatus('Please enter a full name.', true);
    return;
  }

  if (!capturedBlob) {
    setStatus('Please capture an exam image before submitting.', true);
    return;
  }

  const payload = new FormData();
  payload.append('name', fullNameInput.value.trim());
  payload.append('photo', capturedBlob, 'exam-image.jpg');

  try {
    setStatus('Generating PDF certificate...', false);

    const response = await fetch('/api/certificates', {
      method: 'POST',
      body: payload,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Certificate generation failed');
    }

    const pdfBlob = await response.blob();
    const certId = response.headers.get('X-Certificate-Id');

    const fileURL = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = fileURL;
    link.download = `${fullNameInput.value.trim().replace(/\s+/g, '_')}_certificate.pdf`;
    link.click();

    setStatus(`Certificate generated successfully. Certificate ID: ${certId}`, false);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
});

function setStatus(message, isError) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#dc2626' : '#166534';
}
