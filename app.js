// ====== НАСТРОЙКИ GITHUB ======
const GIST_ID = 'https://gist.github.com/cursorus/de791dc4ad73963ebabdce36a3493709';
const TOKEN = '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';
const FILE_NAME = 'data.json';

// ===== Переменные =====
let pc, localStream, currentCamera='user', pollInterval;
const mainScreen = document.getElementById('main-screen');
const callScreen = document.getElementById('call-screen');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

const ringtone = document.getElementById('ringtone');
const connectSound = document.getElementById('connect-sound');
const endSound = document.getElementById('end-sound');

const peerIdInput = document.getElementById('peer-id');
const callToInput = document.getElementById('call-to');

// ===== Функции =====
async function getLocalStream(){
  if(localStream) localStream.getTracks().forEach(t=>t.stop());
  localStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:currentCamera}, audio:true});
  localVideo.srcObject = localStream;
}

async function switchCamera(){
  currentCamera = currentCamera==='user'?'environment':'user';
  await getLocalStream();
  if(pc){
    const senders = pc.getSenders().filter(s=>s.track.kind==='video');
    senders.forEach((s,i)=>s.replaceTrack(localStream.getVideoTracks()[0]));
  }
}

function toggleMic(){ localStream.getAudioTracks().forEach(t=>t.enabled=!t.enabled); }
function toggleCamera(){ localStream.getVideoTracks().forEach(t=>t.enabled=!t.enabled); }

// ===== Мини-видео перетаскивание =====
const mini = document.getElementById('mini-local'); let offsetX,offsetY;
mini.onmousedown=(e)=>{
  mini.classList.add('dragging');
  offsetX=e.offsetX; offsetY=e.offsetY;
  function move(e){ mini.style.left=(e.pageX-offsetX)+'px'; mini.style.top=(e.pageY-offsetY)+'px'; }
  function up(){ mini.classList.remove('dragging'); document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); }
  document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
};

// ===== Push уведомления =====
Notification.requestPermission();
function notify(title,body){ if(Notification.permission==='granted') new Notification(title,{body}); }

// ===== Gist API =====
async function readGist(){
  const res=await fetch(`https://api.github.com/gists/${GIST_ID}`,{headers:{'Authorization':`token ${TOKEN}`}});
  const gist=await res.json();
  return JSON.parse(gist.files[FILE_NAME].content||'{}');
}
async function updateGist(data){
  await fetch(`https://api.github.com/gists/${GIST_ID}`,{
    method:'PATCH',
    headers:{'Authorization':`token ${TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({files:{[FILE_NAME]:{content:JSON.stringify(data)}}})
  });
}

// ===== P2P соединение =====
async function startCall(){
  const peerId = peerIdInput.value.trim();
  const callTo = callToInput.value.trim();
  if(!peerId || !callTo) return alert('Введите оба ID');
  
  mainScreen.classList.add('hidden');
  callScreen.classList.remove('hidden');
  await getLocalStream();

  pc = new RTCPeerConnection();
  localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
  pc.ontrack=e=>{ remoteVideo.srcObject=e.streams[0]; notify("Входящий звонок","Телефон подключился"); connectSound.play(); ringtone.pause(); }
  pc.onconnectionstatechange=()=>{ if(pc.connectionState==='connected') connectSound.play(); if(pc.connectionState==='disconnected'||pc.connectionState==='closed') endSound.play(); }

  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  let data = await readGist(); data[callTo]={offer,from:peerId,answered:false}; await updateGist(data);
  ringtone.play();

  pollInterval = setInterval(async()=>{
    let updated = await readGist();
    if(updated[callTo] && updated[callTo].answer && !updated[callTo].connected){
      await pc.setRemoteDescription(updated[callTo].answer);
      updated[callTo].connected=true; await updateGist(updated);
      clearInterval(pollInterval); ringtone.pause();
    }
  },2000);
}

// ===== Входящие звонки =====
async function checkIncoming(){
  const data = await readGist();
  for(let id in data){
    const call = data[id];
    if(call.offer && !call.answered && call.to!==peerIdInput.value.trim()){
      mainScreen.classList.add('hidden'); callScreen.classList.remove('hidden');
      notify("Входящий звонок",`Звонок от ${call.from}`); ringtone.play();
      await getLocalStream();

      pc = new RTCPeerConnection();
      localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
      pc.ontrack=e=>{ remoteVideo.srcObject=e.streams[0]; connectSound.play(); ringtone.pause(); }

      await pc.setRemoteDescription(call.offer);
      const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
      data[id].answer=answer; data[id].answered=true; await updateGist(data);
    }
  }
}

// ===== Кнопки =====
document.getElementById('call-button').onclick=startCall;
document.getElementById('switch-camera').onclick=switchCamera;
document.getElementById('toggle-mic').onclick=toggleMic;
document.getElementById('toggle-camera').onclick=toggleCamera;
document.getElementById('end-call').onclick=()=>{
  if(pc) pc.close();
  callScreen.classList.add('hidden'); mainScreen.classList.remove('hidden');
  endSound.play(); clearInterval(pollInterval);
};

// ===== Поллинг входящих =====
setInterval(checkIncoming,3000);
