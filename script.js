// --- 0. ゲームのデータ（ステート）管理 ---
const gameState = {
  currentX: 0, // プレイヤーの初期X座標（Aの部屋）
  currentZ: 0, // プレイヤーの初期Z座標（Aの部屋）
  toggleCount: 0,
  rooms: []    // 25部屋のデータを格納する配列
};

const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXY";

// 5×5の基本グリッド（外周のみ壁がある状態）を生成
for (let i = 0; i < 25; i++) {
  let x = i % 5;
  let z = Math.floor(i / 5);
  gameState.rooms.push({
    id: i,
    letter: alphabets[i],
    x: x,
    z: z,
    isSwitchOn: false,
    isVisited: false, // 追加：その部屋に入ったか
    isSeen: false,    // 追加：隣からドア越しに見たか（「？」表示用）
    walls: {
      n: z === 0, // 1番上の行は北に壁
      s: z === 4, // 1番下の行は南に壁
      e: x === 4, // 1番右の列は東に壁
      w: x === 0  // 1番左の列は西に壁
    }
  });
}

// ★Zの部屋を外側（x:5, z:4）に追加
gameState.rooms.push({
  id: 25,
  letter: 'Z',
  x: 5,
  z: 4,
  isSwitchOn: false,
  isVisited: false,
  isSeen: false,
  walls: {
    n: true, // 北は壁
    s: true, // 南は壁
    e: true, // 東（奥）は壁
    w: false // ★西側を開けて、Yの部屋と繋げる
  }
});

// Yの部屋（x:4, z:4）の東側（右）の壁を壊してZに繋げる
const roomY = gameState.rooms.find(r => r.x === 4 && r.z === 4);
if (roomY) roomY.walls.e = false;

// 内部に壁（柱）を追加して、行き止まりのないループ迷路を作る関数
function addInnerWall(x, z, direction) {
  const r1 = gameState.rooms.find(r => r.x === x && r.z === z);
  if (direction === 'e') {
    const r2 = gameState.rooms.find(r => r.x === x + 1 && r.z === z);
    if(r1 && r2) { r1.walls.e = true; r2.walls.w = true; }
  }
  if (direction === 's') {
    const r2 = gameState.rooms.find(r => r.x === x && r.z === z + 1);
    if(r1 && r2) { r1.walls.s = true; r2.walls.n = true; }
  }
}

// 密度を高めたループ迷路の壁配置
addInnerWall(1, 0, 's'); // Bの南
addInnerWall(3, 0, 's'); // Dの南
addInnerWall(1, 1, 'e'); // Gの東
addInnerWall(2, 1, 'e'); // Hの東
addInnerWall(0, 2, 'e'); // Kの東
addInnerWall(3, 2, 'e'); // Nの東
addInnerWall(1, 2, 's'); // Lの南
addInnerWall(3, 2, 's'); // Nの南
addInnerWall(1, 3, 'e'); // Qの東
addInnerWall(2, 3, 's'); // Rの南


// --- 1. 初期設定 ---
const canvas = document.querySelector('#webgl-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 0); // プレイヤーの目線の高さ

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);


// --- 2. 照明（ライト） ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// --- 3. 壁紙（テクスチャ）を生成する関数 ---
function createWallTexture(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (letter !== '') {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '900 300px "Montserrat", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// --- 4. 巨大トグルスイッチを作る関数 ---
function createToggleSwitch(roomData) {
  const switchGroup = new THREE.Group();

  // 台座
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  base.position.y = 0.1;
  switchGroup.add(base);

  const leverPivot = new THREE.Group();
  leverPivot.position.set(0, 0.2, 0);
  
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  lever.position.y = 0.3;
  leverPivot.add(lever);

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.08), lightMat);
  light.position.set(0, 0.65, 0);
  leverPivot.add(light);
  leverPivot.rotation.x = -Math.PI / 6;
  switchGroup.add(leverPivot);

  // ★追加：部屋を照らすスイッチ連動の光源
  const switchGlow = new THREE.PointLight(0xff0000, 1.5, 6); // 赤色、強さ1.5、届く距離6
  switchGlow.position.set(0, 1.0, 0);
  switchGroup.add(switchGlow);

  // ★追加：空中に浮かぶホログラムのアルファベット（常にカメラを向く Sprite）
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 256; textCanvas.height = 256;
  const ctx = textCanvas.getContext('2d');
  ctx.fillStyle = '#00ffcc'; // UIと同じシアン色
  ctx.font = '900 160px "Montserrat", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(roomData.letter, 128, 128);
  
  const textTex = new THREE.CanvasTexture(textCanvas);
  const textMat = new THREE.SpriteMaterial({ map: textTex, transparent: true, opacity: 0.9 });
  const textSprite = new THREE.Sprite(textMat);
  textSprite.position.set(0, 2.0, 0); // スイッチの真上（目線より少し上）に配置
  textSprite.scale.set(1.5, 1.5, 1);
  switchGroup.add(textSprite);

  roomData.leverPivot = leverPivot;
  roomData.lightMat = lightMat;
  roomData.switchGlow = switchGlow; // 光源もデータに保存

  return switchGroup;
}

// --- 5. 1つの壁面（ソリッド壁 or アーチ壁）を組み立てるヘルパー ---
function buildWallFace(isSolid, letter, plainMat, letterMat) {
  if (isSolid) {
    // 通れない壁：全面一枚の板（文字入り）
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), letterMat);
    mesh.position.y = 2;
    return mesh;
  } else {
    // 通れる壁：柱を細くして、開口部を広く（ドアのような形に）
    const archGroup = new THREE.Group();
    
    // 左の柱（幅1.5）
    const leftPillar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4), plainMat);
    leftPillar.position.set(-4.25, 2, 0);
    archGroup.add(leftPillar);

    // 右の柱（幅1.5）
    const rightPillar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4), plainMat);
    rightPillar.position.set(4.25, 2, 0);
    archGroup.add(rightPillar);

    // 上の梁（幅7, 高さ0.8）
    const topBeam = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.8), plainMat);
    topBeam.position.set(0, 3.6, 0);
    archGroup.add(topBeam);

    return archGroup;
  }
}


// --- 6. 部屋全体を組み立てる関数 ---
function createRoom(roomData) {
  const roomGroup = new THREE.Group();
  roomGroup.position.set(roomData.x * 10, 0, roomData.z * 10);
  
  // ★部屋全体を照らすライトを各部屋の天井付近に設置
  const roomLight = new THREE.PointLight(0xffffff, 0.5, 15);
  roomLight.position.set(0, 3, 0);
  roomGroup.add(roomLight);

  // 床と天井
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  floor.rotation.x = -Math.PI / 2;
  roomGroup.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  roomGroup.add(ceiling);

  // ★Zの部屋か、通常の部屋かで中央のオブジェクトを変える
  if (roomData.letter === 'Z') {
    // Zの部屋：コンパクトでスタイリッシュな端末を設置
    const terminalGroup = new THREE.Group();
    
    // デスク天板（薄く小さく）
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    desk.position.set(0, 0.8, 0); 
    terminalGroup.add(desk);

    // デスクの脚（1本のスタンド）
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    leg.position.set(0, 0.4, 0);
    terminalGroup.add(leg);

    // モニター画面（PCサイズに小型化）
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: 0x003300 }));
    screen.position.set(0, 1.1, 0);
    screen.rotation.x = -Math.PI / 12; // 少しだけ上を向かせる
    terminalGroup.add(screen);
    
    roomGroup.add(terminalGroup);
  } else {
    // 通常の部屋：トグルスイッチを設置
    const toggleSwitch = createToggleSwitch(roomData);
    roomGroup.add(toggleSwitch);
  }

  // （createRoom 関数内の中盤）
  // マテリアル準備（すべて無地の壁にします）
  const plainMat = new THREE.MeshStandardMaterial({ map: createWallTexture('') });

  const offset = 4.95;

  // 全て plainMat を渡して、ソリッド壁もアーチ壁も無地に統一
  const northWall = buildWallFace(roomData.walls.n, roomData.letter, plainMat, plainMat);
  northWall.position.z = -offset;
  roomGroup.add(northWall);

  const southWall = buildWallFace(roomData.walls.s, roomData.letter, plainMat, plainMat);
  southWall.rotation.y = Math.PI;
  southWall.position.z = offset;
  roomGroup.add(southWall);

  const westWall = buildWallFace(roomData.walls.w, roomData.letter, plainMat, plainMat);
  westWall.rotation.y = Math.PI / 2;
  westWall.position.x = -offset;
  roomGroup.add(westWall);

  const eastWall = buildWallFace(roomData.walls.e, roomData.letter, plainMat, plainMat);
  eastWall.rotation.y = -Math.PI / 2;
  eastWall.position.x = offset;
  roomGroup.add(eastWall);

  return roomGroup;
}

// 25部屋をシーンに追加
gameState.rooms.forEach(room => {
  scene.add(createRoom(room));
});

// --- 2Dマップを更新する関数 ---
function updateMap() {
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = ''; 

  const cx = gameState.currentX;
  const cz = gameState.currentZ;
  const currentRoom = gameState.rooms.find(r => r.x === cx && r.z === cz);

  if (currentRoom) {
    currentRoom.isVisited = true;
    currentRoom.isSeen = true;
    // 周囲1マスの部屋を「Seen（見た）」状態にする
    gameState.rooms.forEach(r => {
      if (Math.abs(r.x - cx) <= 1 && Math.abs(r.z - cz) <= 1) {
        r.isSeen = true;
      }
    });
  }

  // ★常にプレイヤーを中心に 3x3 (dz: -1〜1, dx: -1〜1) の範囲だけを描画
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const targetX = cx + dx;
      const targetZ = cz + dz;
      const room = gameState.rooms.find(r => r.x === targetX && r.z === targetZ);

      const cell = document.createElement('div');
      cell.className = 'map-cell';

      if (room) {
        if (room.isVisited) {
          cell.classList.add('visited');
          cell.style.borderTop = room.walls.n ? '2px solid #00ffcc' : '1px dashed #333';
          cell.style.borderBottom = room.walls.s ? '2px solid #00ffcc' : '1px dashed #333';
          cell.style.borderLeft = room.walls.w ? '2px solid #00ffcc' : '1px dashed #333';
          cell.style.borderRight = room.walls.e ? '2px solid #00ffcc' : '1px dashed #333';

          if (room.isSwitchOn && room.id < 25) {
            if (room.id < 20) cell.classList.add('switch-on-slash');
            else cell.classList.add('switch-on-circle');
          }
        } else if (room.isSeen) {
          cell.classList.add('seen');
          cell.textContent = '?';
        }

        // ★中央のセル（現在地）にはプレイヤーの矢印マーカーを置く
        if (dx === 0 && dz === 0) {
          cell.classList.add('current');
          const marker = document.createElement('div');
          marker.className = 'player-marker';
          // カメラのY軸回転量(ラジアン)をそのままCSSの回転(rad)に適用して向きを同期
          marker.style.transform = `rotate(${-camera.rotation.y}rad)`;
          cell.appendChild(marker);
        }
      }
      
      // 部屋が存在しない座標（マップ外）は、ただの透明な空セルになる
      mapContainer.appendChild(cell);
    }
  }
}

// 初回起動時にマップを描画
updateMap();

// --- 7. 描画ループ ---
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();


// --- 8. カメラの移動・旋回＆スイッチ操作ロジック ---
let isMoving = false;

document.addEventListener('keydown', (event) => {
  if (isMoving) return;

  // 【スペースキー】スイッチのON/OFF ＆ 端末の操作
  if (event.code === 'Space') {
    const currentRoom = gameState.rooms.find(r => r.x === gameState.currentX && r.z === gameState.currentZ);
    if (!currentRoom) return;

    // ★Zの部屋にいる場合は、モニターUIを開閉する
    if (currentRoom.letter === 'Z') {
      const monitorUi = document.getElementById('monitor-ui');
      if (monitorUi.style.display === 'none' || monitorUi.style.display === '') {
        monitorUi.style.display = 'flex'; // 開く
        document.getElementById('monitor-message').textContent = ''; // メッセージリセット
      } else {
        monitorUi.style.display = 'none'; // 閉じる
      }
      return;
    }

    // ★Z以外の部屋の場合は、通常のトグルスイッチ処理
    currentRoom.isSwitchOn = !currentRoom.isSwitchOn;
    gameState.toggleCount++; // 操作回数をカウントアップ！
    
    const targetAngle = currentRoom.isSwitchOn ? Math.PI / 6 : -Math.PI / 6;
    const targetColorHex = currentRoom.isSwitchOn ? 0x00ff00 : 0xff0000;
    
    gsap.to(currentRoom.leverPivot.rotation, { x: targetAngle, duration: 0.2, ease: "power3.inOut" });
    currentRoom.lightMat.color.setHex(targetColorHex);
    currentRoom.switchGlow.color.setHex(targetColorHex);
    
    updateMap();
    return;
  }

  // 【移動・旋回】
  const duration = 0.4;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  const dx = Math.round(direction.x);
  const dz = Math.round(direction.z);

  let moveX = 0;
  let moveZ = 0;

  if (event.key === 'ArrowUp' || event.key === 'w') {
    moveX = dx; moveZ = dz;
  } else if (event.key === 'ArrowDown' || event.key === 's') {
    moveX = -dx; moveZ = -dz;
  } else if (event.key === 'ArrowLeft' || event.key === 'a') {
    isMoving = true;
    gsap.to(camera.rotation, { y: camera.rotation.y + Math.PI / 2, duration: duration, ease: "power2.inOut", onComplete: () => { isMoving = false; updateMap(); }});
    return;
  } else if (event.key === 'ArrowRight' || event.key === 'd') {
    isMoving = true;
    gsap.to(camera.rotation, { y: camera.rotation.y - Math.PI / 2, duration: duration, ease: "power2.inOut", onComplete: () => { isMoving = false; updateMap(); }});
    return;
  }

  if (moveX !== 0 || moveZ !== 0) {
    const currentRoom = gameState.rooms.find(r => r.x === gameState.currentX && r.z === gameState.currentZ);
    if (!currentRoom) return;

    let canMove = true;
    if (moveZ === -1 && currentRoom.walls.n) canMove = false;
    if (moveZ === 1 && currentRoom.walls.s) canMove = false;
    if (moveX === 1 && currentRoom.walls.e) canMove = false;
    if (moveX === -1 && currentRoom.walls.w) canMove = false;

    if (canMove) {
      gameState.currentX += moveX;
      gameState.currentZ += moveZ;
      isMoving = true;
      gsap.to(camera.position, {
        x: gameState.currentX * 10,
        z: gameState.currentZ * 10,
        duration: duration,
        ease: "power2.inOut",
        onComplete: () => { isMoving = false; }
      });
      updateMap()
    }
  }
});

// 画面リサイズ対応
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- 9. パスワード判定とクリア処理 ---
document.getElementById('send-button').addEventListener('click', () => {
  const correctIds = [3, 5, 14]; 
  const onRoomIds = gameState.rooms.filter(r => r.isSwitchOn).map(r => r.id);
  const isCorrect = (correctIds.length === onRoomIds.length) && correctIds.every(id => onRoomIds.includes(id));

  const msgElement = document.getElementById('monitor-message');

  if (isCorrect) {
    msgElement.style.color = '#00ffcc';
    msgElement.textContent = 'ACCESS GRANTED.';
    
    setTimeout(() => {
      document.getElementById('monitor-ui').style.display = 'none';
      document.getElementById('clear-ui').style.display = 'flex';
      
      // スコアの表示（踏破率を削除し、回数のみに）
      document.getElementById('result-stats').innerHTML = `
        🕹️ トグル操作回数：${gameState.toggleCount} 回
      `;
    }, 1000);
  } else {
    msgElement.style.color = '#ff0000';
    msgElement.textContent = 'ERROR: INVALID INPUT.';
  }
});

// シェアボタンの処理（自動URL取得とハッシュタグ増量）
document.getElementById('share-button').addEventListener('click', () => {
  // 現在開いているページのURLを自動で取得
  const currentUrl = encodeURIComponent(window.location.href);
  
  // %0a は改行コードです
  const text = encodeURIComponent(`『MarkS』をクリアしました！\n🕹️ トグル操作回数：${gameState.toggleCount} 回\n`);
  
  // ハッシュタグをカンマ区切りで設定
  const hashtags = "Web謎,謎解き,MarkS謎";
  
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${currentUrl}&hashtags=${hashtags}`, '_blank');
});