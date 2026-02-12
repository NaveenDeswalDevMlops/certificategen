const form = document.getElementById('certificateForm');
const fullNameInput = document.getElementById('fullName');
const validUntilInput = document.getElementById('validUntil');
const mirrorModeInput = document.getElementById('mirrorMode');
const openCameraBtn = document.getElementById('openCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const photoPreview = document.getElementById('photoPreview');
const statusText = document.getElementById('status');

let mediaStream;
let capturedBlob;

function applyMirrorMode() {
  video.classList.toggle('mirrored', mirrorModeInput.checked);
}

mirrorModeInput.addEventListener('change', applyMirrorMode);

openCameraBtn.addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = mediaStream;
    captureBtn.disabled = false;
    applyMirrorMode();
    setStatus('Webcam is active. Capture a passport-style photo.', false);
  } catch (error) {
    setStatus('Unable to access webcam. Please check browser camera permissions.', true);
    console.error(error);
  }
});

captureBtn.addEventListener('click', () => {
  if (!mediaStream) return;

  const context = canvas.getContext('2d');

  // If preview is mirrored, draw mirrored pixels so the captured image matches what user sees.
  if (mirrorModeInput.checked) {
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.restore();
  } else {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  canvas.toBlob(
    (blob) => {
      capturedBlob = blob;
      photoPreview.src = URL.createObjectURL(blob);
      setStatus('Photo captured. You can now generate the certificate.', false);
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
    setStatus('Please capture a photo before submitting.', true);
    return;
  }

  const payload = new FormData();
  payload.append('name', fullNameInput.value.trim());
  payload.append('photo', capturedBlob, 'passport-photo.jpg');
  if (validUntilInput.value) {
    payload.append('validUntil', validUntilInput.value);
  }

  try {
    setStatus('Generating official credential PDF on server...', false);

    const response = await fetch('/api/certificates', {
      method: 'POST',
      body: payload,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Certificate generation failed');
    }

    // Trust decision: frontend only downloads backend-issued official credential PDF.
    const pdfBlob = await response.blob();
    const certId = response.headers.get('X-Certificate-Id');

    const fileURL = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = fileURL;
    link.download = `${fullNameInput.value.trim().replace(/\s+/g, '_')}_credential.pdf`;
    link.click();

    setStatus(`Credential generated successfully. Certificate ID: ${certId}`, false);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
});

function setStatus(message, isError) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#dc2626' : '#166534';
}
