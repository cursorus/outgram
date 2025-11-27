// ====== НАСТРОЙКИ GITHUB ======
const GIST_ID = 'https://gist.github.com/cursorus/de791dc4ad73963ebabdce36a3493709';
const TOKEN = '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';
const FILE_NAME = 'data.json';

// ====== ПЕРЕМЕННЫЕ ======
let pc, localStream, currentCamera = 'user', pollInterval;
const mainScreen = document.getElementById('main-screen');
const callScreen = document.getElementById('call-screen');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

const ringtone = document.getElementById('ringtone');
const connectSound = document.getElementById('connect-sound');
const endSound = document.getElementById('end-sound');

const peerInput = document.getElementById('peer-id');

// ====== ФУНКЦИИ ======

// Получаем локальное видео и аудио
async function getLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  localStream = await navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: currentCamera },
    audio: true 
  });
  localVideo.srcObject = localStream;
}

// Переключение камеры
async function switchCamera() {
  currentCamera = currentCamera === 'user' ? 'environment' : 'user';
  await getLocalStream();
  if (pc) {
    const senders = pc.getSenders().filter(s => s.track.kind === 'video');
    senders.forEach((sender, i) => sender.replaceTrack(localStream.getVideoTracks()[0]));
  }
}

// Переключение микрофона
function toggleMic() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
}

// Переключение камеры (вкл/выкл)
function toggleCamera() {
  if (!localStream) return;
  localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
}

// ====== ПЕРЕТАСКИВАНИЕ МИНИ-ВИДЕО ======
const mini = document.getElementById('mini-local');
let offsetX, offsetY;
mini.onmousedown = (e) => {
  mini.classList.add('dragging');
  offsetX = e.offsetX;
  offsetY = e.offsetY;

  function move(e) {
    mini.style.left = (e.pageX - offsetX) + 'px';
    mini.style.top = (e.pageY - offsetY) + 'px';
  }

  function up() {
    mini.classList.remove('dragging');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
};

// ====== PUSH УВЕДОМЛЕНИЯ ======
Notification.requestPermission();
function notify(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

// ====== GIST API ======
async function readGist() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { 'Authorization': `token ${TOKEN}` }
  });
  const gist = await res.json();
  return JSON.parse(gist.files[FILE_NAME].content || '{}');
}

async function updateGist(data) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(data) } } })
  });
}

// ====== СОЗДАНИЕ P2P СОЕДИНЕНИЯ ======
async function startCall() {
  const peerId = peerInput.value.trim();
  if (!peerId) return alert('Введите ID собеседника');

  mainScreen.classList.add('hidden');
  callScreen.classList.remove('hidden');

  await getLocalStream();

  pc = new RTCPeerConnection();

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
    notify("Входящий звонок", "Телефон подключился");
    connectSound.play();
    ringtone.pause();
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') connectSound.play();
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') endSound.play();
  }

  // создаём offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // пишем в Gist
  let data = await readGist();
  data[peerId] = { offer };
  await updateGist(data);

  ringtone.play();

  // ждем answer
  pollInterval = setInterval(async () => {
    let updated = await readGist();
    if (updated[peerId] && updated[peerId].answer) {
      await pc.setRemoteDescription(updated[peerId].answer);
      clearInterval(pollInterval);
      ringtone.pause();
    }
  }, 2000);
}

// ====== ПОЛУЧЕНИЕ ВХОДЯЩЕГО ЗВОНКА ======
async function checkIncoming() {
  const data = await readGist();
  for (let peerId in data) {
    if (data[peerId].offer && !data[peerId].answered) {
      mainScreen.classList.add('hidden');
      callScreen.classList.remove('hidden');
      notify("Входящий звонок", `Звонок от ${peerId}`);
      ringtone.play();

      await getLocalStream();
      pc = new RTCPeerConnection();
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      pc.ontrack = e => {
        remoteVideo.srcObject = e.streams[0];
        connectSound.play();
        ringtone.pause();
      };

      await pc.setRemoteDescription(data[peerId].offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      data[peerId].answer = answer;
      data[peerId].answered = true;
      await updateGist(data);
    }
  }
}

// ====== КНОПКИ ======
document.getElementById('call-button').onclick = startCall;
document.getElementById('switch-camera').onclick = switchCamera;
document.getElementById('toggle-mic').onclick = toggleMic;
document.getElementById('toggle-camera').onclick = toggleCamera;
document.getElementById('end-call').onclick = () => {
  if (pc) pc.close();
  callScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  endSound.play();
  clearInterval(pollInterval);
};

// ====== ПУЛЛИНГ ВХОДЯЩИХ ======
setInterval(checkIncoming, 3000);
