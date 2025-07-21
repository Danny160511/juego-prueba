/**
 * JUEGO ESPACIAL CON CONTROL POR GESTOS
 * Sistema completo con MediaPipe, ajustes funcionales y múltiples niveles
 */

'use strict';

// ============================================================================
// CONTROLADOR DE GESTOS
// ============================================================================
class GestureController {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.videoElement = null;
        this.isActive = false;
        this.sensitivity = 1.0;
        this.lastProcessTime = 0;
        this.frameInterval = 33; // 30 FPS por defecto
    }

    async initialize() {
        try {
            this.videoElement = document.getElementById('videoElement');
            if (!this.videoElement) return false;

            this.hands = new Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 0,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.7,
                staticImageMode: false
            });

            this.hands.onResults(this.processResults.bind(this));

            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.isActive) {
                        const now = Date.now();
                        if (now - this.lastProcessTime >= this.frameInterval) {
                            this.lastProcessTime = now;
                            await this.hands.send({ image: this.videoElement });
                        }
                    }
                },
                width: 320,
                height: 240,
                facingMode: 'user'
            });

            return true;
        } catch (error) {
            console.error('Error inicializando gestos:', error);
            return false;
        }
    }

    async start() {
        try {
            if (this.camera) {
                await this.camera.start();
                this.isActive = true;
                document.getElementById('cameraContainer').style.display = 'block';
                document.getElementById('gestureStatus').style.display = 'block';
                return true;
            }
        } catch (error) {
            console.error('Error iniciando cámara:', error);
            return false;
        }
    }

    stop() {
        if (this.camera) {
            this.camera.stop();
            this.isActive = false;
            document.getElementById('cameraContainer').style.display = 'none';
            document.getElementById('gestureStatus').style.display = 'none';
        }
    }

    processResults(results) {
        if (!window.game) return;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const gesture = this.recognizeGesture(landmarks);

            if (gesture) {
                this.updateGestureDisplay(gesture.type);

                if (gesture.type === 'pointing' && gesture.position) {
                    const targetX = gesture.position.x * window.game.width;
                    const targetY = gesture.position.y * window.game.height;

                    window.game.fingerTarget = {
                        x: window.game.width - targetX,
                        y: targetY
                    };
                } else if (gesture.type === 'open_hand') {
                    if (window.game.gameOver) {
                        window.game.restart();
                    } else {
                        window.game.paused = !window.game.paused;
                    }
                    window.game.fingerTarget = null;
                }
            }
        } else {
            this.updateGestureDisplay(null);
            if (window.game) {
                window.game.fingerTarget = null;
            }
        }
    }

    recognizeGesture(landmarks) {
        const indexTip = landmarks[8];
        const indexPip = landmarks[6];
        const middleTip = landmarks[12];
        const middlePip = landmarks[10];
        const ringTip = landmarks[16];
        const ringPip = landmarks[14];
        const pinkyTip = landmarks[20];
        const pinkyPip = landmarks[18];
        const thumbTip = landmarks[4];
        const thumbIp = landmarks[3];
        const wrist = landmarks[0];

        const indexUp = indexTip.y < indexPip.y;
        const middleUp = middleTip.y < middlePip.y;
        const ringUp = ringTip.y < ringPip.y;
        const pinkyUp = pinkyTip.y < pinkyPip.y;
        const thumbUp = Math.abs(thumbTip.x - wrist.x) > Math.abs(thumbIp.x - wrist.x);

        const fingersUpCount = [indexUp, middleUp, ringUp, pinkyUp, thumbUp].filter(Boolean).length;

        if (fingersUpCount >= 4) {
            return { type: 'open_hand' };
        } else if (indexUp && fingersUpCount <= 2) {
            return {
                type: 'pointing',
                position: { x: indexTip.x, y: indexTip.y }
            };
        }

        return null;
    }

    updateGestureDisplay(gestureType) {
        const indicators = ['upGesture', 'downGesture', 'leftGesture', 'rightGesture', 'pauseGesture'];
        indicators.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.className = 'gesture-icon inactive';
            }
        });

        if (gestureType) {
            let activeId = null;
            switch (gestureType) {
                case 'pointing':
                    activeId = 'upGesture';
                    break;
                case 'open_hand':
                    activeId = 'pauseGesture';
                    break;
            }

            if (activeId) {
                const element = document.getElementById(activeId);
                if (element) {
                    element.className = 'gesture-icon active';
                }
            }
        }
    }
}

// ============================================================================
// CLASE PRINCIPAL DEL JUEGO
// ============================================================================
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gestureController = new GestureController();
        this.gestureEnabled = false;

        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Cargar imagen del jugador
        this.tonyImage = new Image();
        this.tonyImage.src = 'img/TonyOriginal.png';
        this.imageLoaded = false;
        this.tonyImage.onload = () => { this.imageLoaded = true; };

        // Estado del juego
        this.level = 1;
        this.deaths = 0;
        this.startTime = Date.now();
        this.gameOver = false;
        this.paused = false;
        this.time = 0;

        // Sistema de niveles
        this.maxLevel = 10;
        this.unlockedLevels = this.loadProgress();
        this.levelStats = this.loadLevelStats();

        // Efectos visuales
        this.particles = [];
        this.screenShake = 0;
        this.flashEffect = 0;
        this.backgroundPattern = this.createBackgroundPattern();

        // Propiedades del jugador
        this.player = {
            x: 50,
            y: 300,
            width: 22,
            height: 22,
            speed: 7,
            trail: [],
            glowIntensity: 0,
            bounceOffset: 0
        };

        // Configuraciones de ajustes
        this.particlesEnabled = true;
        this.screenShakeEnabled = true;
        this.trailEnabled = true;
        
        // Detectar si es móvil y desactivar teclado automáticamente
        this.isMobile = this.detectMobileDevice();
        this.keyboardEnabled = !this.isMobile; // Solo teclado en desktop
        
        // Configurar interfaz según el dispositivo
        this.setupDeviceSpecificUI();
        this.livesEnabled = false;
        this.maxLives = 3;
        this.currentLives = 3;
        this.gameSpeedMultiplier = 1.0;
        this.qualityMultiplier = 1.0;
        this.shadowBlur = 5;
        this.glowEffects = true;
        this.backgroundEffects = true;
        this.difficultyMultiplier = { speed: 1.0, obstacles: 1.0, collectibles: 1.0 };

        // Control de entrada
        this.keys = {};
        this.fingerTarget = null;
        this.touchTarget = null;
        this.setupInput();

        // Objetos del juego
        this.obstacles = [];
        this.collectibles = [];
        this.goal = null;

        // Audio
        this.audioContext = null;
        this.initAudio();

        this.initLevel();
        this.gameLoop();
    }

    // Sistema de progreso
    loadProgress() {
        const saved = localStorage.getItem('spaceGameProgress');
        return saved ? parseInt(saved) : 1;
    }

    saveProgress() {
        localStorage.setItem('spaceGameProgress', this.unlockedLevels.toString());
    }

    loadLevelStats() {
        const saved = localStorage.getItem('spaceGameLevelStats');
        return saved ? JSON.parse(saved) : {};
    }

    saveLevelStats() {
        localStorage.setItem('spaceGameLevelStats', JSON.stringify(this.levelStats));
    }

    unlockNextLevel() {
        if (this.level >= this.unlockedLevels && this.level < this.maxLevel) {
            this.unlockedLevels = this.level + 1;
            this.saveProgress();
        }
    }

    recordLevelCompletion(deaths, time) {
        const levelKey = `level${this.level}`;
        if (!this.levelStats[levelKey] || this.levelStats[levelKey].deaths > deaths) {
            this.levelStats[levelKey] = {
                deaths: deaths,
                time: time,
                completed: true
            };
            this.saveLevelStats();
        }
    }

    // Audio
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio no soportado');
        }
    }

    playSound(frequency, duration, type = 'sine') {
        if (!this.audioContext || !window.gameSettings?.settings.soundEnabled) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        const volume = (window.gameSettings?.settings.soundVolume || 50) / 100 * 0.1;
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    // Patrón de fondo
    createBackgroundPattern() {
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = 40;
        patternCanvas.height = 40;
        const patternCtx = patternCanvas.getContext('2d');

        patternCtx.strokeStyle = '#222';
        patternCtx.lineWidth = 1;
        patternCtx.beginPath();
        patternCtx.moveTo(0, 20);
        patternCtx.lineTo(40, 20);
        patternCtx.moveTo(20, 0);
        patternCtx.lineTo(20, 40);
        patternCtx.stroke();

        return this.ctx.createPattern(patternCanvas, 'repeat');
    }

    // Control de entrada
    setupInput() {
        // Controles de teclado - Solo en dispositivos desktop
        if (!this.isMobile) {
            document.addEventListener('keydown', (e) => {
                if (this.keyboardEnabled) {
                    this.keys[e.key.toLowerCase()] = true;
                    if (e.key === ' ' && this.gameOver) {
                        this.restart();
                    }
                }
            });

            document.addEventListener('keyup', (e) => {
                if (this.keyboardEnabled) {
                    this.keys[e.key.toLowerCase()] = false;
                }
            });
            
            console.log('⌨️ Controles de teclado registrados para desktop');
        } else {
            console.log('📱 Controles de teclado deshabilitados en móvil');
        }

        // Controles táctiles - Siempre disponibles pero priorizados en móviles
        this.setupTouchControls();
    }

    setupTouchControls() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchCurrentX = 0;
        let touchCurrentY = 0;
        let isTouching = false;

        // Prevenir zoom en dispositivos móviles
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('gesturestart', (e) => {
            e.preventDefault();
        });

        // Control táctil en el canvas
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            
            // Calcular escala para coordenadas correctas
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            touchStartX = (touch.clientX - rect.left) * scaleX;
            touchStartY = (touch.clientY - rect.top) * scaleY;
            touchCurrentX = touchStartX;
            touchCurrentY = touchStartY;
            isTouching = true;

            // Reiniciar juego si está en game over
            if (this.gameOver) {
                this.restart();
                return;
            }

            // Pausar/despausar con toque
            if (this.paused) {
                this.paused = false;
            }

            // Establecer objetivo táctil inicial
            this.touchTarget = {
                x: touchCurrentX,
                y: touchCurrentY,
                active: true
            };
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isTouching) return;

            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            
            // Calcular escala para coordenadas correctas
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            touchCurrentX = (touch.clientX - rect.left) * scaleX;
            touchCurrentY = (touch.clientY - rect.top) * scaleY;

            // Actualizar posición objetivo para el jugador
            this.touchTarget = {
                x: touchCurrentX,
                y: touchCurrentY,
                active: true
            };
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            isTouching = false;
            this.touchTarget = null;
        }, { passive: false });

        // Controles virtuales en pantalla
        this.createVirtualControls();
    }

    createVirtualControls() {
        // Solo crear controles virtuales si no existen
        if (document.getElementById('virtualControls')) return;

        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'virtualControls';
        controlsContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: none;
            flex-direction: column;
            gap: 10px;
            z-index: 1000;
        `;

        // Botón de pausa
        const pauseBtn = document.createElement('button');
        pauseBtn.innerHTML = '⏸️';
        pauseBtn.style.cssText = `
            width: 60px;
            height: 60px;
            border: none;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 24px;
            cursor: pointer;
            touch-action: manipulation;
        `;
        pauseBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.paused = !this.paused;
        });

        // Botón de reinicio
        const restartBtn = document.createElement('button');
        restartBtn.innerHTML = '🔄';
        restartBtn.style.cssText = `
            width: 60px;
            height: 60px;
            border: none;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 24px;
            cursor: pointer;
            touch-action: manipulation;
        `;
        restartBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.mobileRestart();
        });

        controlsContainer.appendChild(pauseBtn);
        controlsContainer.appendChild(restartBtn);
        document.body.appendChild(controlsContainer);

        // Mostrar controles virtuales en dispositivos móviles
        if (this.isMobileDevice()) {
            controlsContainer.style.display = 'flex';
        }
    }

    detectMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0);
    }

    isMobileDevice() {
        return this.isMobile;
    }

    setupDeviceSpecificUI() {
        if (this.isMobile) {
            // Configurar UI específica para móviles
            console.log('📱 Dispositivo móvil detectado - Configurando controles táctiles');
            
            // Ocultar elementos innecesarios en móviles
            setTimeout(() => {
                const elementsToHide = [
                    '#cameraContainer',
                    '#gestureStatus'
                ];
                
                elementsToHide.forEach(selector => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.style.display = 'none';
                    }
                });

                // Mostrar mensaje específico para móviles
                this.showMobileWelcomeMessage();
                
                // Ocultar controles de teclado en ajustes
                this.hideMobileUnsupportedSettings();
            }, 1000);
        } else {
            console.log('🖥️ Dispositivo desktop detectado - Controles de teclado habilitados');
        }
    }

    showMobileWelcomeMessage() {
        const welcomeMessage = document.createElement('div');
        welcomeMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(15px);
            padding: 20px;
            border: 2px solid #ff8800;
            border-radius: 15px;
            color: #fff;
            text-align: center;
            z-index: 3000;
            max-width: 90vw;
            box-shadow: 0 0 30px rgba(255, 136, 0, 0.5);
        `;
        
        welcomeMessage.innerHTML = `
            <h3 style="color: #ff8800; margin-bottom: 15px;">📱 MODO MÓVIL ACTIVADO</h3>
            <p style="margin-bottom: 10px;"><strong>Controles táctiles habilitados:</strong></p>
            <p style="font-size: 14px; margin-bottom: 5px;">👆 Toca y arrastra = Mover jugador</p>
            <p style="font-size: 14px; margin-bottom: 5px;">⏸️ Botón pausa = Pausar/reanudar</p>
            <p style="font-size: 14px; margin-bottom: 15px;">🔄 Botón reinicio = Reiniciar nivel</p>
            <button onclick="this.parentElement.remove()" style="
                background: linear-gradient(45deg, #ff8800, #cc6600);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-weight: bold;
                cursor: pointer;
            ">¡ENTENDIDO!</button>
        `;
        
        document.body.appendChild(welcomeMessage);
        
        // Auto-remover después de 8 segundos
        setTimeout(() => {
            if (welcomeMessage.parentElement) {
                welcomeMessage.remove();
            }
        }, 8000);
    }

    hideMobileUnsupportedSettings() {
        // Ocultar configuraciones que no aplican en móviles
        setTimeout(() => {
            const keyboardSetting = document.querySelector('label[for="keyboardEnabled"]');
            if (keyboardSetting) {
                const settingItem = keyboardSetting.closest('.setting-item');
                if (settingItem) {
                    settingItem.style.display = 'none';
                }
            }

            // Agregar nota sobre controles móviles en ajustes
            const controlsSection = document.querySelector('.settings-section h3');
            if (controlsSection && controlsSection.textContent.includes('CONTROLES')) {
                const mobileNote = document.createElement('p');
                mobileNote.style.cssText = `
                    color: #ff8800;
                    font-size: 12px;
                    margin: 10px 0;
                    padding: 8px;
                    background: rgba(255, 136, 0, 0.1);
                    border-radius: 5px;
                    border: 1px solid rgba(255, 136, 0, 0.3);
                `;
                mobileNote.innerHTML = '📱 <strong>Modo Móvil:</strong> Solo controles táctiles disponibles';
                controlsSection.parentElement.insertBefore(mobileNote, controlsSection.nextSibling);
            }
        }, 2000);
    }

    // Habilitar gestos
    async enableGestures() {
        const initialized = await this.gestureController.initialize();
        if (initialized) {
            const started = await this.gestureController.start();
            if (started) {
                this.gestureEnabled = true;
                return true;
            }
        }
        return false;
    }

    // Inicialización de niveles
    initLevel() {
        this.obstacles = [];
        this.collectibles = [];
        this.player.x = 50;
        this.player.y = 300;

        switch (this.level) {
            case 1:
                this.createLevel1();
                break;
            case 2:
                this.createLevel2();
                break;
            case 3:
                this.createLevel3();
                break;
            case 4:
                this.createLevel4();
                break;
            case 5:
                this.createLevel5();
                break;
            default:
                this.createRandomLevel();
        }

        this.goal = {
            x: this.width - 80,
            y: this.height / 2 - 40,
            width: 60,
            height: 80,
            color: '#ffff00'
        };
    }

    createLevel1() {
        for (let i = 0; i < 5; i++) {
            this.obstacles.push({
                x: 180 + i * 120,
                y: 150 + i * 60,
                width: 18,
                height: 18,
                speedX: 3.5 + i * 0.7,
                speedY: 2 + i * 0.5,
                color: '#ff0000'
            });
        }

        this.collectibles.push(
            { x: 350, y: 250, width: 9, height: 9, collected: false, color: '#0088ff' },
            { x: 500, y: 350, width: 9, height: 9, collected: false, color: '#0088ff' }
        );
    }

    createLevel2() {
        for (let i = 0; i < 7; i++) {
            this.obstacles.push({
                x: 140 + i * 90,
                y: 120 + Math.sin(i * 0.8) * 80,
                width: 16,
                height: 16,
                speedX: 4.5 * (i % 2 === 0 ? 1 : -1),
                speedY: 3 * (i % 2 === 0 ? 1 : -1),
                color: '#ff0000'
            });
        }

        for (let i = 0; i < 2; i++) {
            this.obstacles.push({
                x: 400, y: 200, width: 14, height: 14,
                angle: i * Math.PI, radius: 60 + i * 30,
                speed: 0.08 + i * 0.02, color: '#ff0000'
            });
        }

        for (let i = 0; i < 3; i++) {
            this.collectibles.push({
                x: 280 + i * 160, y: 200 + i * 80,
                width: 8, height: 8, collected: false, color: '#0088ff'
            });
        }
    }

    createLevel3() {
        for (let i = 0; i < 6; i++) {
            this.obstacles.push({
                x: 300, y: 300, width: 17, height: 17,
                angle: i * Math.PI / 3, radius: 80 + i * 25,
                speed: 0.07 + i * 0.015, color: '#ff0000'
            });
        }

        for (let i = 0; i < 3; i++) {
            this.obstacles.push({
                x: 150 + i * 200, y: 100 + i * 150,
                width: 16, height: 16,
                speedX: 5 * (i % 2 === 0 ? 1 : -1),
                speedY: 3.5 * (i % 2 === 0 ? 1 : -1),
                color: '#ff0000'
            });
        }

        this.collectibles.push(
            { x: 295, y: 295, width: 8, height: 8, collected: false, color: '#0088ff' },
            { x: 450, y: 200, width: 8, height: 8, collected: false, color: '#0088ff' }
        );
    }

    createLevel4() {
        for (let i = 0; i < 8; i++) {
            this.obstacles.push({
                x: 400, y: 300, width: 15, height: 15,
                angle: i * Math.PI / 4, radius: 100 + i * 15,
                speed: 0.05 + i * 0.01, color: '#ff0000'
            });
        }

        for (let i = 0; i < 4; i++) {
            this.obstacles.push({
                x: 100 + i * 150, y: 100 + i * 100,
                width: 20, height: 20,
                speedX: 4 * (i % 2 === 0 ? 1 : -1),
                speedY: 3 * (i % 2 === 0 ? -1 : 1),
                color: '#ff0000'
            });
        }

        for (let i = 0; i < 3; i++) {
            this.collectibles.push({
                x: 200 + i * 200, y: 150 + i * 100,
                width: 8, height: 8, collected: false, color: '#0088ff'
            });
        }
    }

    createLevel5() {
        for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 6; i++) {
                this.obstacles.push({
                    x: 200 + j * 400, y: 300, width: 14, height: 14,
                    angle: i * Math.PI / 3 + j * Math.PI, radius: 80 + i * 20,
                    speed: (0.06 + i * 0.01) * (j === 0 ? 1 : -1), color: '#ff0000'
                });
            }
        }

        for (let i = 0; i < 3; i++) {
            this.obstacles.push({
                x: 350 + i * 50, y: 250 + i * 50,
                width: 18, height: 18,
                speedX: 3 * (i % 2 === 0 ? 1 : -1),
                speedY: 4 * (i % 2 === 0 ? -1 : 1),
                color: '#ff0000'
            });
        }

        for (let i = 0; i < 4; i++) {
            this.collectibles.push({
                x: 150 + i * 150, y: 200 + (i % 2) * 200,
                width: 7, height: 7, collected: false, color: '#0088ff'
            });
        }
    }

    createRandomLevel() {
        const difficultyMultiplier = 1 + (this.level - 6) * 0.3;
        const numObstacles = 8 + this.level * 2;

        for (let i = 0; i < Math.floor(numObstacles / 2); i++) {
            this.obstacles.push({
                x: 400, y: 300, width: 15 + Math.random() * 5, height: 15 + Math.random() * 5,
                angle: Math.random() * Math.PI * 2, radius: 80 + Math.random() * 100,
                speed: (0.05 + Math.random() * 0.05) * difficultyMultiplier, color: '#ff0000'
            });
        }

        for (let i = 0; i < Math.floor(numObstacles / 2); i++) {
            this.obstacles.push({
                x: Math.random() * (this.width - 120) + 60,
                y: Math.random() * (this.height - 120) + 60,
                width: 14 + Math.random() * 8,
                height: 14 + Math.random() * 8,
                speedX: (Math.random() - 0.5) * 8 * difficultyMultiplier,
                speedY: (Math.random() - 0.5) * 8 * difficultyMultiplier,
                color: '#ff0000'
            });
        }

        const numCollectibles = Math.min(5, Math.floor(this.level / 2) + 2);
        for (let i = 0; i < numCollectibles; i++) {
            this.collectibles.push({
                x: Math.random() * (this.width - 250) + 125,
                y: Math.random() * (this.height - 150) + 75,
                width: Math.max(6, 9 - Math.floor(this.level / 4)),
                height: Math.max(6, 9 - Math.floor(this.level / 4)),
                collected: false,
                color: '#0088ff'
            });
        }
    }

    // Actualización del juego
    update() {
        if (this.gameOver || this.paused) return;

        const deltaTime = 0.016 * this.gameSpeedMultiplier;
        this.time += deltaTime;

        this.updateEffects();
        this.updatePlayer();
        this.updateObstacles();
        this.updateParticles();
        this.checkCollisions();
        this.checkWinCondition();
        this.updateUI();
    }

    updateEffects() {
        this.screenShake *= 0.9;
        this.flashEffect *= 0.95;
        this.player.glowIntensity = Math.sin(this.time * 8) * 0.3 + 0.7;
        this.player.bounceOffset = Math.sin(this.time * 12) * 2;
    }

    updatePlayer() {
        let newX = this.player.x;
        let newY = this.player.y;

        // Controles de teclado
        if (this.keyboardEnabled) {
            if (this.keys['w'] || this.keys['arrowup']) newY -= this.player.speed;
            if (this.keys['s'] || this.keys['arrowdown']) newY += this.player.speed;
            if (this.keys['a'] || this.keys['arrowleft']) newX -= this.player.speed;
            if (this.keys['d'] || this.keys['arrowright']) newX += this.player.speed;
        }

        // Control por gestos
        if (this.fingerTarget) {
            const playerCenterX = this.player.x + this.player.width / 2;
            const playerCenterY = this.player.y + this.player.height / 2;

            const deltaX = this.fingerTarget.x - playerCenterX;
            const deltaY = this.fingerTarget.y - playerCenterY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            const sensitivity = window.gameSettings?.settings.gesturesSensitivity || 1;
            const threshold = 5 / sensitivity;

            if (distance > threshold) {
                const directionX = deltaX / distance;
                const directionY = deltaY / distance;
                const adjustedSpeed = this.player.speed * sensitivity;

                newX += directionX * adjustedSpeed;
                newY += directionY * adjustedSpeed;
            }
        }

        // Control táctil directo
        if (this.touchTarget) {
            const playerCenterX = this.player.x + this.player.width / 2;
            const playerCenterY = this.player.y + this.player.height / 2;

            const deltaX = this.touchTarget.x - playerCenterX;
            const deltaY = this.touchTarget.y - playerCenterY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            const touchSensitivity = 0.8; // Sensibilidad específica para táctil
            const threshold = 10;

            if (distance > threshold) {
                const directionX = deltaX / distance;
                const directionY = deltaY / distance;
                const adjustedSpeed = this.player.speed * touchSensitivity;

                newX += directionX * adjustedSpeed;
                newY += directionY * adjustedSpeed;
            }
        }

        // Límites de pantalla
        if (newX >= 0 && newX <= this.width - this.player.width) {
            this.player.x = newX;
        }
        if (newY >= 0 && newY <= this.height - this.player.height) {
            this.player.y = newY;
        }
    }

    updateObstacles() {
        this.obstacles.forEach(obstacle => {
            if (obstacle.angle !== undefined) {
                const speedMultiplier = this.gameSpeedMultiplier * this.difficultyMultiplier.speed;
                obstacle.angle += obstacle.speed * speedMultiplier;
                obstacle.x = (obstacle.centerX || 300) + Math.cos(obstacle.angle) * obstacle.radius - obstacle.width / 2;
                obstacle.y = (obstacle.centerY || 300) + Math.sin(obstacle.angle) * obstacle.radius - obstacle.height / 2;
            } else {
                const speedMultiplier = this.gameSpeedMultiplier * this.difficultyMultiplier.speed;
                obstacle.x += obstacle.speedX * speedMultiplier;
                obstacle.y += obstacle.speedY * speedMultiplier;

                if (obstacle.x <= 0 || obstacle.x >= this.width - obstacle.width) {
                    obstacle.speedX *= -1;
                }
                if (obstacle.y <= 0 || obstacle.y >= this.height - obstacle.height) {
                    obstacle.speedY *= -1;
                }
            }
        });
    }

    updateParticles() {
        if (!this.particlesEnabled) return;

        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 0.02;
            particle.size *= 0.98;
            return particle.life > 0 && particle.size > 0.5;
        });

        if (Math.random() < 0.3) {
            this.particles.push({
                x: this.player.x + this.player.width / 2,
                y: this.player.y + this.player.height / 2,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size: Math.random() * 4 + 2,
                life: 1,
                color: `hsl(120, 100%, ${50 + Math.random() * 50}%)`
            });
        }
    }

    checkCollisions() {
        this.obstacles.forEach(obstacle => {
            if (this.isColliding(this.player, obstacle)) {
                this.playerDied();
            }
        });

        this.collectibles.forEach(collectible => {
            if (!collectible.collected && this.isColliding(this.player, collectible)) {
                collectible.collected = true;
                this.collectItem();
            }
        });
    }

    isColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y;
    }

    checkWinCondition() {
        const allCollected = this.collectibles.every(c => c.collected);
        if (allCollected && this.isColliding(this.player, this.goal)) {
            this.nextLevel();
        }
    }

    collectItem() {
        this.playSound(800, 0.2, 'sine');

        if (this.particlesEnabled) {
            const particleCount = Math.floor(15 * this.qualityMultiplier);
            for (let i = 0; i < particleCount; i++) {
                this.particles.push({
                    x: this.player.x + this.player.width / 2,
                    y: this.player.y + this.player.height / 2,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8,
                    size: Math.random() * 6 + 3,
                    life: 1,
                    color: `hsl(200, 100%, ${70 + Math.random() * 30}%)`
                });
            }
        }
    }

    playerDied() {
        this.deaths++;
        this.playSound(200, 0.5, 'sawtooth');

        if (this.screenShakeEnabled) {
            this.screenShake = 15;
        }
        this.flashEffect = 1;

        if (this.particlesEnabled) {
            const particleCount = Math.floor(30 * this.qualityMultiplier);
            for (let i = 0; i < particleCount; i++) {
                this.particles.push({
                    x: this.player.x + this.player.width / 2,
                    y: this.player.y + this.player.height / 2,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    size: Math.random() * 8 + 4,
                    life: 1,
                    color: `hsl(${Math.random() * 60}, 100%, ${50 + Math.random() * 50}%)`
                });
            }
        }

        // Sistema de vidas limitadas
        if (this.livesEnabled) {
            this.currentLives--;
            if (this.currentLives > 0) {
                this.player.x = 50;
                this.player.y = 300;
                this.showNotification(`💔 Vidas restantes: ${this.currentLives}`);
                return;
            } else {
                this.gameOver = true;
                document.getElementById('gameOver').style.display = 'block';
                return;
            }
        }

        // Comportamiento normal
        this.player.x = 50;
        this.player.y = 300;
        this.collectibles.forEach(c => c.collected = false);
    }

    nextLevel() {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.recordLevelCompletion(this.deaths, elapsed);
        this.unlockNextLevel();

        this.playSound(1000, 0.5, 'sine');

        if (this.level >= this.maxLevel) {
            this.showVictoryScreen();
            return;
        }

        this.level++;
        this.deaths = 0;
        this.startTime = Date.now();
        this.time = 0;

        if (this.livesEnabled) {
            this.currentLives = this.maxLives;
        }

        this.initLevel();
    }

    showVictoryScreen() {
        alert('🎉 ¡Felicitaciones! Has completado todas las misiones espaciales! 🚀');
        this.renderLevelMenu();
    }

    // Renderizado
    render() {
        this.ctx.save();

        if (this.screenShakeEnabled && this.screenShake > 0) {
            this.ctx.translate(
                (Math.random() - 0.5) * this.screenShake,
                (Math.random() - 0.5) * this.screenShake
            );
        }

        // Fondo
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#0a0a0a');
        gradient.addColorStop(0.5, '#1a1a1a');
        gradient.addColorStop(1, '#0f0f0f');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.backgroundEffects) {
            this.ctx.fillStyle = this.backgroundPattern;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.renderParticles();
        this.renderPlayer();
        this.renderObstacles();
        this.renderCollectibles();
        this.renderGoal();
        this.renderFingerTarget();

        if (this.flashEffect > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashEffect * 0.3})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        if (this.paused) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '48px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PAUSADO', this.width / 2, this.height / 2);
            this.ctx.font = '16px Courier New';
            this.ctx.fillText('Mano abierta para continuar', this.width / 2, this.height / 2 + 40);
        }

        this.ctx.restore();
    }

    renderParticles() {
        if (!this.particlesEnabled) return;

        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.life;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    }

    renderPlayer() {
        const x = this.player.x;
        const y = this.player.y + this.player.bounceOffset;

        this.ctx.save();

        if (this.glowEffects) {
            this.ctx.shadowColor = '#00ff88';
            this.ctx.shadowBlur = this.shadowBlur * this.player.glowIntensity;
        }

        if (this.imageLoaded) {
            this.ctx.drawImage(this.tonyImage, x, y, this.player.width, this.player.height);
        } else {
            this.ctx.fillStyle = '#00ff88';
            this.ctx.fillRect(x, y, this.player.width, this.player.height);
        }

        if (this.trailEnabled) {
            this.player.trail.push({ x: x + this.player.width / 2, y: y + this.player.height / 2 });
            if (this.player.trail.length > 10) {
                this.player.trail.shift();
            }

            this.player.trail.forEach((point, index) => {
                const alpha = index / this.player.trail.length * 0.5;
                this.ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }

        this.ctx.restore();
    }

    renderObstacles() {
        this.obstacles.forEach(obstacle => {
            this.ctx.save();

            if (this.glowEffects) {
                this.ctx.shadowColor = obstacle.color;
                this.ctx.shadowBlur = this.shadowBlur;
            }

            this.ctx.fillStyle = obstacle.color;
            this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

            this.ctx.strokeStyle = '#ff4444';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

            this.ctx.restore();
        });
    }

    renderCollectibles() {
        this.collectibles.forEach(collectible => {
            if (!collectible.collected) {
                this.ctx.save();

                if (this.glowEffects) {
                    this.ctx.shadowColor = collectible.color;
                    this.ctx.shadowBlur = this.shadowBlur;
                }

                this.ctx.fillStyle = collectible.color;
                this.ctx.beginPath();
                this.ctx.arc(
                    collectible.x + collectible.width / 2,
                    collectible.y + collectible.height / 2,
                    collectible.width / 2,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();

                const pulse = Math.sin(this.time * 8) * 0.3 + 0.7;
                this.ctx.strokeStyle = '#44aaff';
                this.ctx.lineWidth = 2;
                this.ctx.globalAlpha = pulse;
                this.ctx.stroke();

                this.ctx.restore();
            }
        });
    }

    renderGoal() {
        this.ctx.save();

        if (this.glowEffects) {
            this.ctx.shadowColor = this.goal.color;
            this.ctx.shadowBlur = this.shadowBlur * 2;
        }

        this.ctx.fillStyle = this.goal.color;
        this.ctx.fillRect(this.goal.x, this.goal.y, this.goal.width, this.goal.height);

        const glow = Math.sin(this.time * 6) * 0.3 + 0.7;
        this.ctx.strokeStyle = '#ffff88';
        this.ctx.lineWidth = 3;
        this.ctx.globalAlpha = glow;
        this.ctx.strokeRect(this.goal.x, this.goal.y, this.goal.width, this.goal.height);

        this.ctx.restore();
    }

    renderFingerTarget() {
        // Renderizar objetivo de gestos
        if (this.fingerTarget) {
            this.ctx.save();
            this.ctx.strokeStyle = '#00ff88';
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.7;
            this.ctx.beginPath();
            this.ctx.arc(this.fingerTarget.x, this.fingerTarget.y, 20, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(this.fingerTarget.x, this.fingerTarget.y, 10, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.restore();
        }

        // Renderizar objetivo táctil
        if (this.touchTarget && this.touchTarget.active) {
            this.ctx.save();
            this.ctx.strokeStyle = '#ff8800';
            this.ctx.fillStyle = 'rgba(255, 136, 0, 0.2)';
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.8;
            
            // Círculo exterior pulsante
            const pulseSize = 15 + Math.sin(Date.now() * 0.01) * 5;
            this.ctx.beginPath();
            this.ctx.arc(this.touchTarget.x, this.touchTarget.y, pulseSize, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Círculo interior
            this.ctx.beginPath();
            this.ctx.arc(this.touchTarget.x, this.touchTarget.y, 8, 0, Math.PI * 2);
            this.ctx.stroke();

            // Línea hacia el jugador
            const playerCenterX = this.player.x + this.player.width / 2;
            const playerCenterY = this.player.y + this.player.height / 2;
            
            this.ctx.strokeStyle = 'rgba(255, 136, 0, 0.4)';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(playerCenterX, playerCenterY);
            this.ctx.lineTo(this.touchTarget.x, this.touchTarget.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.restore();
        }
    }

    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }

    // Utilidades
    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: #00ff88;
            padding: 15px 25px;
            border-radius: 8px;
            border: 2px solid #00ff88;
            z-index: 3000;
            font-weight: bold;
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
            backdrop-filter: blur(10px);
            font-family: 'Courier New', monospace;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    restart() {
        this.gameOver = false;
        this.deaths = 0;
        this.startTime = Date.now();
        this.time = 0;

        if (this.livesEnabled) {
            this.currentLives = this.maxLives;
        }

        this.initLevel();
        document.getElementById('gameOver').style.display = 'none';
    }

    mobileRestart() {
        // Función específica para reinicio móvil
        this.touchTarget = null;
        this.restart();
        
        // Mostrar feedback visual
        this.showNotification('🔄 Juego reiniciado');
    }

    updateUI() {
        document.getElementById('level').textContent = this.level;
        document.getElementById('deaths').textContent = this.deaths;
        document.getElementById('time').textContent = Math.floor(this.time);

        if (this.livesEnabled) {
            let livesDisplay = document.getElementById('lives');
            if (!livesDisplay) {
                livesDisplay = document.createElement('div');
                livesDisplay.id = 'lives';
                livesDisplay.className = 'stat';
                document.getElementById('ui').appendChild(livesDisplay);
            }
            livesDisplay.innerHTML = `❤️ Vidas: <span>${this.currentLives}</span>`;
        } else {
            const livesDisplay = document.getElementById('lives');
            if (livesDisplay) {
                livesDisplay.remove();
            }
        }
    }

    renderLevelMenu() {
        const levelGrid = document.getElementById('levelGrid');
        if (!levelGrid) return;

        levelGrid.innerHTML = '';

        for (let i = 1; i <= this.maxLevel; i++) {
            const levelButton = document.createElement('div');
            levelButton.className = 'level-button';

            const isUnlocked = i <= this.unlockedLevels;
            const isCompleted = this.levelStats[`level${i}`]?.completed;

            if (isCompleted) {
                levelButton.classList.add('completed');
            } else if (isUnlocked) {
                levelButton.classList.add('unlocked');
            } else {
                levelButton.classList.add('locked');
            }

            let icon = '🔒';
            if (isCompleted) {
                icon = '⭐';
            } else if (isUnlocked) {
                icon = '🚀';
            }

            let stats = '';
            if (isCompleted) {
                const levelStat = this.levelStats[`level${i}`];
                stats = `💀 ${levelStat.deaths} | ⏱️ ${levelStat.time}s`;
            }

            levelButton.innerHTML = `
                <div class="level-icon">${icon}</div>
                <div class="level-number">${i}</div>
                <div class="level-stats">${stats}</div>
            `;

            if (isUnlocked) {
                levelButton.onclick = () => this.selectLevel(i);
            }

            levelGrid.appendChild(levelButton);
        }
    }

    selectLevel(levelNumber) {
        if (levelNumber <= this.unlockedLevels) {
            this.level = levelNumber;
            this.deaths = 0;
            this.startTime = Date.now();
            this.initLevel();
            closeLevelMenu();
        }
    }
}

// ============================================================================
// SISTEMA DE AJUSTES
// ============================================================================
class GameSettings {
    constructor() {
        this.settings = {
            soundEnabled: true,
            soundVolume: 50,
            playerSpeed: 7,
            gameSpeed: 1,
            gesturesSensitivity: 1,
            keyboardEnabled: true,
            particlesEnabled: true,
            screenShakeEnabled: true,
            trailEnabled: true,
            difficultyLevel: 'normal',
            livesEnabled: false,
            fpsLimit: 60,
            qualityLevel: 'medium'
        };

        this.loadSettings();
        this.setupEventListeners();
    }

    loadSettings() {
        const saved = localStorage.getItem('spaceGameSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.applySettingsToUI();
    }

    saveSettings() {
        localStorage.setItem('spaceGameSettings', JSON.stringify(this.settings));
        this.applySettingsToGame();
        this.showNotification('⚙️ Ajustes guardados correctamente');
    }

    resetSettings() {
        if (confirm('¿Estás seguro de que quieres restablecer todos los ajustes?')) {
            localStorage.removeItem('spaceGameSettings');
            this.settings = {
                soundEnabled: true,
                soundVolume: 50,
                playerSpeed: 7,
                gameSpeed: 1,
                gesturesSensitivity: 1,
                keyboardEnabled: true,
                particlesEnabled: true,
                screenShakeEnabled: true,
                trailEnabled: true,
                difficultyLevel: 'normal',
                livesEnabled: false,
                fpsLimit: 60,
                qualityLevel: 'medium'
            };
            this.applySettingsToUI();
            this.showNotification('🔄 Ajustes restablecidos');
        }
    }

    applySettingsToUI() {
        document.getElementById('soundEnabled').checked = this.settings.soundEnabled;
        document.getElementById('soundVolume').value = this.settings.soundVolume;
        document.querySelector('.volume-value').textContent = this.settings.soundVolume + '%';

        document.getElementById('playerSpeed').value = this.settings.playerSpeed;
        document.querySelector('.speed-value').textContent = this.settings.playerSpeed;
        document.getElementById('gameSpeed').value = this.settings.gameSpeed;
        document.querySelector('.game-speed-value').textContent = this.settings.gameSpeed + 'x';

        document.getElementById('gesturesSensitivity').value = this.settings.gesturesSensitivity;
        document.querySelector('.sensitivity-value').textContent = this.settings.gesturesSensitivity + 'x';
        document.getElementById('keyboardEnabled').checked = this.settings.keyboardEnabled;

        document.getElementById('particlesEnabled').checked = this.settings.particlesEnabled;
        document.getElementById('screenShakeEnabled').checked = this.settings.screenShakeEnabled;
        document.getElementById('trailEnabled').checked = this.settings.trailEnabled;

        document.getElementById('difficultyLevel').value = this.settings.difficultyLevel;
        document.getElementById('livesEnabled').checked = this.settings.livesEnabled;

        document.getElementById('fpsLimit').value = this.settings.fpsLimit;
        document.getElementById('qualityLevel').value = this.settings.qualityLevel;
    }

    applySettingsToGame() {
        if (window.game) {
            game.player.speed = this.settings.playerSpeed;
            game.gameSpeedMultiplier = this.settings.gameSpeed;
            game.particlesEnabled = this.settings.particlesEnabled;
            game.screenShakeEnabled = this.settings.screenShakeEnabled;
            game.trailEnabled = this.settings.trailEnabled;
            game.keyboardEnabled = this.settings.keyboardEnabled;
            game.livesEnabled = this.settings.livesEnabled;

            if (this.settings.fpsLimit !== 'unlimited') {
                const fps = parseInt(this.settings.fpsLimit);
                if (game.gestureController) {
                    game.gestureController.frameInterval = 1000 / fps;
                }
            }

            if (game.gestureController) {
                game.gestureController.sensitivity = this.settings.gesturesSensitivity;
            }

            if (this.settings.livesEnabled) {
                game.maxLives = 3;
                game.currentLives = game.maxLives;
            }

            this.applyDifficulty();
            this.applyQualitySettings();
        }
    }

    applyDifficulty() {
        if (!window.game) return;

        const difficultyMultipliers = {
            easy: { speed: 0.7, obstacles: 0.8, collectibles: 1.2 },
            normal: { speed: 1.0, obstacles: 1.0, collectibles: 1.0 },
            hard: { speed: 1.3, obstacles: 1.2, collectibles: 0.8 },
            extreme: { speed: 1.6, obstacles: 1.5, collectibles: 0.6 }
        };

        const multiplier = difficultyMultipliers[this.settings.difficultyLevel];
        game.difficultyMultiplier = multiplier;
    }

    applyQualitySettings() {
        if (!window.game) return;

        const qualitySettings = {
            low: { particleCount: 0.3, shadowBlur: 0, glowEffects: false, backgroundEffects: false },
            medium: { particleCount: 0.7, shadowBlur: 5, glowEffects: true, backgroundEffects: true },
            high: { particleCount: 1.0, shadowBlur: 10, glowEffects: true, backgroundEffects: true }
        };

        const quality = qualitySettings[this.settings.qualityLevel];
        game.qualityMultiplier = quality.particleCount;
        game.shadowBlur = quality.shadowBlur;
        game.glowEffects = quality.glowEffects;
        game.backgroundEffects = quality.backgroundEffects;
    }

    setupEventListeners() {
        document.getElementById('soundVolume').addEventListener('input', (e) => {
            this.settings.soundVolume = parseInt(e.target.value);
            document.querySelector('.volume-value').textContent = this.settings.soundVolume + '%';
        });

        document.getElementById('playerSpeed').addEventListener('input', (e) => {
            this.settings.playerSpeed = parseInt(e.target.value);
            document.querySelector('.speed-value').textContent = this.settings.playerSpeed;
        });

        document.getElementById('gameSpeed').addEventListener('input', (e) => {
            this.settings.gameSpeed = parseFloat(e.target.value);
            document.querySelector('.game-speed-value').textContent = this.settings.gameSpeed + 'x';
        });

        document.getElementById('gesturesSensitivity').addEventListener('input', (e) => {
            this.settings.gesturesSensitivity = parseFloat(e.target.value);
            document.querySelector('.sensitivity-value').textContent = this.settings.gesturesSensitivity + 'x';
        });

        document.getElementById('soundEnabled').addEventListener('change', (e) => {
            this.settings.soundEnabled = e.target.checked;
        });

        document.getElementById('keyboardEnabled').addEventListener('change', (e) => {
            this.settings.keyboardEnabled = e.target.checked;
        });

        document.getElementById('particlesEnabled').addEventListener('change', (e) => {
            this.settings.particlesEnabled = e.target.checked;
        });

        document.getElementById('screenShakeEnabled').addEventListener('change', (e) => {
            this.settings.screenShakeEnabled = e.target.checked;
        });

        document.getElementById('trailEnabled').addEventListener('change', (e) => {
            this.settings.trailEnabled = e.target.checked;
        });

        document.getElementById('livesEnabled').addEventListener('change', (e) => {
            this.settings.livesEnabled = e.target.checked;
        });

        document.getElementById('difficultyLevel').addEventListener('change', (e) => {
            this.settings.difficultyLevel = e.target.value;
        });

        document.getElementById('fpsLimit').addEventListener('change', (e) => {
            this.settings.fpsLimit = e.target.value;
        });

        document.getElementById('qualityLevel').addEventListener('change', (e) => {
            this.settings.qualityLevel = e.target.value;
        });
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: #00ff88;
            padding: 15px 25px;
            border-radius: 8px;
            border: 2px solid #00ff88;
            z-index: 3000;
            font-weight: bold;
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
            backdrop-filter: blur(10px);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// ============================================================================
// FUNCIONES GLOBALES
// ============================================================================

// Funciones de inicialización
function startCamera() {
    document.getElementById('cameraPermission').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';

    window.game = new Game();
    window.game.enableGestures();
}

function playWithoutCamera() {
    document.getElementById('cameraPermission').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';

    window.game = new Game();
}

// Funciones de control del juego
function togglePause() {
    if (!window.game) return;

    const pauseButton = document.getElementById('pauseButton');
    const pauseIcon = document.getElementById('pauseIcon');
    const pauseText = document.getElementById('pauseText');
    const gestureToggle = document.getElementById('gestureToggle');

    window.game.paused = !window.game.paused;

    if (window.game.paused) {
        pauseButton.classList.add('paused');
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'REANUDAR';
        gestureToggle.style.display = 'flex';
        updateGestureButtonState();
    } else {
        pauseButton.classList.remove('paused');
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'PAUSAR';
        gestureToggle.style.display = 'none';
    }
}

function toggleGestures() {
    if (!window.game) return;

    const gestureButton = document.getElementById('gestureToggle');
    const gestureIcon = document.getElementById('gestureIcon');
    const gestureText = document.getElementById('gestureText');

    if (window.game.gestureEnabled) {
        window.game.gestureController.stop();
        window.game.gestureEnabled = false;

        gestureButton.classList.remove('active');
        gestureIcon.textContent = '📷';
        gestureText.textContent = 'ACTIVAR GESTOS';
    } else {
        window.game.enableGestures().then(success => {
            if (success) {
                gestureButton.classList.add('active');
                gestureIcon.textContent = '🎯';
                gestureText.textContent = 'DESACTIVAR GESTOS';
            } else {
                alert('❌ No se pudieron activar los gestos. Verifica que tu cámara esté disponible.');
            }
        });
    }
}

function updateGestureButtonState() {
    if (!window.game) return;

    const gestureButton = document.getElementById('gestureToggle');
    const gestureIcon = document.getElementById('gestureIcon');
    const gestureText = document.getElementById('gestureText');

    if (window.game.gestureEnabled) {
        gestureButton.classList.add('active');
        gestureIcon.textContent = '🎯';
        gestureText.textContent = 'DESACTIVAR GESTOS';
    } else {
        gestureButton.classList.remove('active');
        gestureIcon.textContent = '📷';
        gestureText.textContent = 'ACTIVAR GESTOS';
    }
}

// Funciones del menú de niveles
function openLevelMenu() {
    if (!window.game) return;

    const levelMenu = document.getElementById('levelMenu');
    if (levelMenu) {
        levelMenu.style.display = 'block';
        setTimeout(() => {
            levelMenu.classList.add('show');
        }, 10);
        window.game.renderLevelMenu();
    }
}

function closeLevelMenu() {
    const levelMenu = document.getElementById('levelMenu');
    if (levelMenu) {
        levelMenu.classList.remove('show');
        setTimeout(() => {
            levelMenu.style.display = 'none';
        }, 400);
    }
}

function resetProgress() {
    if (confirm('¿Estás seguro de que quieres reiniciar todo el progreso? Se perderán todos los niveles desbloqueados y estadísticas.')) {
        localStorage.removeItem('spaceGameProgress');
        localStorage.removeItem('spaceGameLevelStats');

        if (window.game) {
            window.game.level = 1;
            window.game.unlockedLevels = 1;
            window.game.levelStats = {};
            window.game.deaths = 0;
            window.game.startTime = Date.now();
            window.game.initLevel();
            window.game.renderLevelMenu();
        }
        alert('🔄 Progreso reiniciado. ¡Buena suerte en tu nueva aventura espacial!');
    }
}

// Funciones del menú de ajustes
function openSettingsMenu() {
    const settingsMenu = document.getElementById('settingsMenu');
    settingsMenu.style.display = 'block';
    settingsMenu.classList.add('show');

    if (window.game) {
        game.paused = true;
    }
}

function closeSettingsMenu() {
    const settingsMenu = document.getElementById('settingsMenu');
    settingsMenu.classList.remove('show');

    setTimeout(() => {
        settingsMenu.style.display = 'none';
    }, 400);

    if (window.game) {
        game.paused = false;
    }
}

function saveSettings() {
    if (window.gameSettings) {
        gameSettings.saveSettings();
    }
}

function resetSettings() {
    if (window.gameSettings) {
        gameSettings.resetSettings();
    }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.gameSettings = new GameSettings();

    // Aplicar ajustes cuando el juego esté listo
    const checkGameReady = setInterval(() => {
        if (window.game && window.gameSettings) {
            window.gameSettings.applySettingsToGame();
            clearInterval(checkGameReady);
        }
    }, 100);
});


// ============================================================================
// FUNCIONES GLOBALES PARA EL HTML
// ============================================================================

// Función global para reinicio móvil
function mobileRestart() {
    if (window.game) {
        window.game.mobileRestart();
    }
}

// Función global para alternar pausa
function togglePause() {
    if (window.game) {
        window.game.paused = !window.game.paused;
    }
}

// Función para inicializar el juego cuando se carga la página
function initializeGame() {
    // Esperar a que las librerías de MediaPipe se carguen
    const checkLibraries = setInterval(() => {
        if (typeof Hands !== 'undefined' && typeof Camera !== 'undefined') {
            clearInterval(checkLibraries);
            
            // Crear instancia global del juego
            window.game = new Game();
            
            // Configurar eventos adicionales para móviles
            setupMobileEvents();
            
            console.log('🚀 Juego inicializado correctamente');
        }
    }, 100);
}

// Configurar eventos específicos para móviles
function setupMobileEvents() {
    // Detectar orientación de pantalla
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (window.game) {
                // Recalcular dimensiones del canvas
                const canvas = window.game.canvas;
                const rect = canvas.getBoundingClientRect();
                console.log('Orientación cambiada, nuevas dimensiones:', rect.width, 'x', rect.height);
            }
        }, 100);
    });

    // Prevenir comportamientos por defecto en móviles
    document.addEventListener('touchmove', (e) => {
        // Solo prevenir si el toque está en el canvas del juego
        if (e.target.id === 'gameCanvas') {
            e.preventDefault();
        }
    }, { passive: false });

    // Manejar visibilidad de la página (cuando se minimiza la app)
    document.addEventListener('visibilitychange', () => {
        if (window.game) {
            if (document.hidden) {
                // Pausar automáticamente cuando se minimiza
                window.game.paused = true;
            }
        }
    });

    // Mostrar controles móviles si es necesario
    if (isMobileDevice()) {
        showMobileInstructions();
    }
}

// Función para detectar dispositivos móviles
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
}

// Mostrar instrucciones específicas para móviles
function showMobileInstructions() {
    const mobileInstructions = document.getElementById('mobileInstructions');
    if (mobileInstructions) {
        mobileInstructions.style.display = 'block';
        
        // Ocultar después de unos segundos
        setTimeout(() => {
            mobileInstructions.style.opacity = '0';
            setTimeout(() => {
                mobileInstructions.style.display = 'none';
            }, 500);
        }, 5000);
    }
}

// Funciones para controles de cámara
function startCamera() {
    document.getElementById('cameraPermission').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    
    if (window.game) {
        window.game.enableGestures();
    }
}

function playWithoutCamera() {
    document.getElementById('cameraPermission').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}

// Debug: Función para probar controles táctiles
function testTouchControls() {
    console.log('🔧 Probando controles táctiles...');
    console.log('Dispositivo móvil:', isMobileDevice());
    console.log('Soporte táctil:', 'ontouchstart' in window);
    console.log('Puntos de toque máximos:', navigator.maxTouchPoints);
    
    if (window.game) {
        console.log('Juego inicializado:', !!window.game);
        console.log('Canvas:', window.game.canvas);
        console.log('Objetivo táctil actual:', window.game.touchTarget);
    }
}

// Hacer disponible la función de debug globalmente
window.testTouchControls = testTouchControls;