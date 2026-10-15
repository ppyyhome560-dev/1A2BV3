// 全局狀態
let gameMode = 'pve'; // 'pve', 'single', 'daily'
let diffPreset = 'normal';
let digitsCount = 4;
let maxAttempts = 10;
let attemptsLeft = 10;
let turnTimeLimit = 0;
let roundTimerLeft = 0;
let roundTimerInterval = null;

let secretCode = "";
let playerSecret = "";
let timerInterval = null;
let secondsElapsed = 0;
let isGameOver = false;
let soundEnabled = true;

// 道具數量
let skills = { mine: 2, peek: 1, add: 1 };

// AI 可用範疇列表 (用於地獄 AI 演算法)
let aiPossiblePool = [];

// 音效發聲器 (Web Audio API)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (!soundEnabled) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'click') { osc.frequency.setValueAtTime(400, now); gain.gain.setValueAtTime(0.08, now); osc.start(now); osc.stop(now + 0.05); }
    else if (type === 'guess') { osc.frequency.setValueAtTime(600, now); gain.gain.setValueAtTime(0.08, now); osc.start(now); osc.stop(now + 0.08); }
    else if (type === 'error') { osc.frequency.setValueAtTime(200, now); gain.gain.setValueAtTime(0.15, now); osc.start(now); osc.stop(now + 0.2); }
    else if (type === 'win') { osc.frequency.setValueAtTime(523, now); osc.frequency.setValueAtTime(659, now + 0.1); osc.frequency.setValueAtTime(783, now + 0.2); gain.gain.setValueAtTime(0.15, now); osc.start(now); osc.stop(now + 0.4); }
}

function toggleTheme() {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('btn-theme').innerText = isDark ? '🌙 深色模式' : '☀️ 淺色模式';
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('btn-sound').innerText = soundEnabled ? '🔊 音效: 開' : '🔇 音效: 關';
}

// 難度分類設定
function setDifficulty(diff) {
    playSound('click');
    diffPreset = diff;
    document.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
    document.getElementById(`diff-${diff}`).classList.add('active');

    const descEl = document.getElementById('diff-desc');
    if (diff === 'easy') {
        digitsCount = 3; maxAttempts = 15; turnTimeLimit = 0;
        descEl.innerText = '3 位數 | 15 次機會 | 簡單盲猜 AI';
    } else if (diff === 'normal') {
        digitsCount = 4; maxAttempts = 10; turnTimeLimit = 0;
        descEl.innerText = '4 位數 | 10 次機會 | 標準思考時間';
    } else if (diff === 'hard') {
        digitsCount = 4; maxAttempts = 7; turnTimeLimit = 15;
        descEl.innerText = '4 位數 | 7 次機會 | 限時 15 秒/回合 | 精確 AI';
    } else if (diff === 'hell') {
        digitsCount = 5; maxAttempts = 5; turnTimeLimit = 10;
        descEl.innerText = '5 位數 | 5 次機會 | 限時 10 秒/回合 | 演算法地獄 AI';
    }
    resetGame();
}

function generateSecret(digits) {
    const nums = ['0','1','2','3','4','5','6','7','8','9'];
    let res = '';
    for (let i = 0; i < digits; i++) {
        const idx = Math.floor(Math.random() * nums.length);
        res += nums[idx];
        nums.splice(idx, 1);
    }
    return res;
}

// 每日挑戰種子密碼 (全平台統一)
function generateDailySecret(digits) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let hash = 0;
    for (let i = 0; i < today.length; i++) hash = (hash << 5) - hash + today.charCodeAt(i);
    const nums = ['0','1','2','3','4','5','6','7','8','9'];
    let res = '';
    for (let i = 0; i < digits; i++) {
        const idx = Math.abs(hash + i * 13) % nums.length;
        res += nums[idx];
        nums.splice(idx, 1);
    }
    return res;
}

function calculateAB(secret, guess) {
    let a = 0, b = 0;
    for (let i = 0; i < guess.length; i++) {
        if (guess[i] === secret[i]) a++;
        else if (secret.includes(guess[i])) b++;
    }
    return `${a}A${b}B`;
}

// 重置與開始遊戲
function resetGame() {
    playSound('click');
    clearInterval(timerInterval);
    clearInterval(roundTimerInterval);
    secondsElapsed = 0;
    document.getElementById('timer').innerText = '0';
    
    attemptsLeft = maxAttempts;
    document.getElementById('attempts-left').innerText = attemptsLeft;
    skills = { mine: 2, peek: 1, add: 1 };
    updateSkillUI();

    if (gameMode === 'daily') {
        secretCode = generateDailySecret(4);
        digitsCount = 4;
    } else {
        secretCode = generateSecret(digitsCount);
    }

    isGameOver = false;
    document.getElementById('user-history').innerHTML = '';
    document.getElementById('ai-history').innerHTML = '';
    document.getElementById('user-guess-input').value = '';
    document.getElementById('player-secret-input').value = '';
    document.getElementById('msg-box').innerText = '';
    document.getElementById('share-box').classList.add('hidden');

    document.querySelectorAll('.num-tag').forEach(tag => tag.className = 'num-tag');

    // 生成全對組合用於地獄 AI 演算法
    initAIPool();

    if (gameMode === 'pve') {
        document.getElementById('pve-setup').classList.remove('hidden');
        document.getElementById('play-area').classList.add('hidden');
        document.getElementById('ai-history-col').classList.remove('hidden');
        document.getElementById('difficulty-card').classList.remove('hidden');
    } else {
        document.getElementById('pve-setup').classList.add('hidden');
        document.getElementById('play-area').classList.remove('hidden');
        document.getElementById('ai-history-col').classList.add('hidden');
        if (gameMode === 'daily') document.getElementById('difficulty-card').classList.add('hidden');
        else document.getElementById('difficulty-card').classList.remove('hidden');
        startTimer();
        resetRoundTimer();
    }
    updateUserXPUI();
    renderAchievements();
}

function startTimer() {
    timerInterval = setInterval(() => {
        secondsElapsed++;
        document.getElementById('timer').innerText = secondsElapsed;
    }, 1000);
}

function resetRoundTimer() {
    clearInterval(roundTimerInterval);
    if (turnTimeLimit <= 0) {
        document.getElementById('round-timer-box').classList.add('hidden');
        return;
    }
    document.getElementById('round-timer-box').classList.remove('hidden');
    roundTimerLeft = turnTimeLimit;
    document.getElementById('round-timer').innerText = roundTimerLeft;

    roundTimerInterval = setInterval(() => {
        roundTimerLeft--;
        document.getElementById('round-timer').innerText = roundTimerLeft;
        if (roundTimerLeft <= 0) {
            playSound('error');
            showError("⏳ 回合思考逾時！扣除 1 次機會！", "user-guess-input");
            attemptsLeft--;
            document.getElementById('attempts-left').innerText = attemptsLeft;
            if (attemptsLeft <= 0) handleGameOver(false);
            else resetRoundTimer();
        }
    }, 1000);
}

function switchMode(mode) {
    gameMode = mode;
    document.getElementById('btn-pve').className = mode === 'pve' ? 'active' : '';
    document.getElementById('btn-single').className = mode === 'single' ? 'active' : '';
    document.getElementById('btn-daily').className = mode === 'daily' ? 'active' : '';
    resetGame();
}

function confirmPlayerSecret() {
    const val = document.getElementById('player-secret-input').value.trim();
    if (val.length !== digitsCount || new Set(val).size !== digitsCount) {
        showError(`請輸入 ${digitsCount} 位不重複數字！`, 'player-secret-input');
        return;
    }
    playerSecret = val;
    playSound('click');
    document.getElementById('pve-setup').classList.add('hidden');
    document.getElementById('play-area').classList.remove('hidden');
    startTimer();
    resetRoundTimer();
}

function handleUserGuess() {
    if (isGameOver) return;
    const inputEl = document.getElementById('user-guess-input');
    const guess = inputEl.value.trim();

    if (guess.length !== digitsCount || new Set(guess).size !== digitsCount) {
        showError(`請輸入 ${digitsCount} 位不重複數字！`, 'user-guess-input');
        return;
    }

    playSound('guess');
    const result = calculateAB(secretCode, guess);
    appendHistory('user-history', guess, result);
    inputEl.value = '';

    if (result === `${digitsCount}A0B`) {
        handleWin();
        return;
    }

    attemptsLeft--;
    document.getElementById('attempts-left').innerText = attemptsLeft;

    if (attemptsLeft <= 0) {
        handleGameOver(false);
        return;
    }

    resetRoundTimer();

    if (gameMode === 'pve') {
        setTimeout(aiTurn, 500);
    }
}

// 聰明 AI 演算法（地獄/困難難度）
function initAIPool() {
    aiPossiblePool = [];
    const generateAll = (prefix) => {
        if (prefix.length === digitsCount) {
            aiPossiblePool.push(prefix);
            return;
        }
        for (let i = 0; i <= 9; i++) {
            const str = i.toString();
            if (!prefix.includes(str)) generateAll(prefix + str);
        }
    };
    generateAll("");
}

function aiTurn() {
    if (isGameOver) return;
    let aiGuess = "";

    if (diffPreset === 'easy') {
        aiGuess = generateSecret(digitsCount);
    } else {
        // 從合法的可能性中挑選一組
        aiGuess = aiPossiblePool[Math.floor(Math.random() * aiPossiblePool.length)];
    }

    const result = calculateAB(playerSecret, aiGuess);
    appendHistory('ai-history', aiGuess, result);

    // 根據結果過濾掉不可能的組合 (Knuth 排除法)
    aiPossiblePool = aiPossiblePool.filter(candidate => calculateAB(candidate, aiGuess) === result);

    if (result === `${digitsCount}A0B`) {
        handleGameOver(true, "🤖 AI 精準猜中了你的數字！你輸了！");
    }
}

// 道具技能功能
function updateSkillUI() {
    document.getElementById('skill-mine-count').innerText = skills.mine;
    document.getElementById('skill-peek-count').innerText = skills.peek;
    document.getElementById('skill-add-count').innerText = skills.add;
}

function useSkill(type) {
    if (isGameOver || skills[type] <= 0) return;
    playSound('click');
    skills[type]--;
    updateSkillUI();

    if (type === 'mine') {
        // 劃掉一個不存在於秘密數字中的數字
        for (let i = 0; i <= 9; i++) {
            const str = i.toString();
            if (!secretCode.includes(str)) {
                const tag = document.getElementById(`tag-${str}`);
                if (!tag.classList.contains('disabled')) {
                    tag.classList.add('disabled');
                    alert(`🧹 掃雷成功！數字 [ ${str} ] 絕對不存在！`);
                    break;
                }
            }
        }
    } else if (type === 'peek') {
        const randIdx = Math.floor(Math.random() * digitsCount);
        alert(`👁️ 透視成功！第 ${randIdx + 1} 位數字是 [ ${secretCode[randIdx]} ]`);
    } else if (type === 'add') {
        attemptsLeft += 2;
        document.getElementById('attempts-left').innerText = attemptsLeft;
        alert("➕ 救命卡生效！增加 2 次猜測機會！");
    }
}

function appendHistory(elementId, guess, result) {
    const ul = document.getElementById(elementId);
    const li = document.createElement('li');
    li.innerHTML = `<span>${guess}</span> <strong>${result}</strong>`;
    if (result.includes(`${digitsCount - 1}A`) || result === '2A2B') li.classList.add('high-score');
    ul.prepend(li);
}

function handleWin() {
    isGameOver = true;
    clearInterval(timerInterval);
    clearInterval(roundTimerInterval);
    playSound('win');
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    document.getElementById('msg-box').innerText = `🎉 恭喜獲勝！答案是 ${secretCode}！`;
    document.getElementById('share-box').classList.remove('hidden');
    addXP(100);
    checkAchievements(true);
}

function handleGameOver(aiWon = false, msg = "") {
    isGameOver = true;
    clearInterval(timerInterval);
    clearInterval(roundTimerInterval);
    playSound('error');
    document.getElementById('msg-box').innerText = aiWon ? msg : `💥 次數用盡！正確答案是 ${secretCode}`;
}

function showError(msg, elementId) {
    playSound('error');
    document.getElementById('msg-box').innerText = msg;
    const el = document.getElementById(elementId);
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
}

function pressKey(key) {
    if (isGameOver) return;
    const input = document.getElementById('user-guess-input');
    if (key === 'clear') input.value = '';
    else if (key === 'back') input.value = input.value.slice(0, -1);
    else if (input.value.length < digitsCount) input.value += key;
}

function toggleNumTag(el) {
    playSound('click');
    if (!el.classList.contains('disabled') && !el.classList.contains('highlight')) el.classList.add('disabled');
    else if (el.classList.contains('disabled')) { el.classList.remove('disabled'); el.classList.add('highlight'); }
    else el.classList.remove('highlight');
}

// Wordle 風格戰績圖卡分享
function copyShareCode() {
    const text = `🎯 1A2B Plus 大師版\n⏱️ 時間: ${secondsElapsed}秒\n🎯 模式: ${gameMode.toUpperCase()} (${diffPreset})\n🏆 答案: ${secretCode}\n挑戰你的數字智商：https://ppyyhome560-dev.github.io/1A2Bplus/`;
    navigator.clipboard.writeText(text);
    alert("📋 戰績圖卡已複製到剪貼簿，快去分享給朋友！");
}

// XP 與等級系統
function addXP(amount) {
    let xpData = JSON.parse(localStorage.getItem('1a2b_xp')) || { xp: 0, level: 1 };
    xpData.xp += amount;
    if (xpData.xp >= xpData.level * 100) {
        xpData.xp -= xpData.level * 100;
        xpData.level++;
        alert(`🌟 升級了！恭喜成為 Lv.${xpData.level} 猜心大師！`);
    }
    localStorage.setItem('1a2b_xp', JSON.stringify(xpData));
    updateUserXPUI();
}

function updateUserXPUI() {
    let xpData = JSON.parse(localStorage.getItem('1a2b_xp')) || { xp: 0, level: 1 };
    document.getElementById('user-level').innerText = xpData.level;
    const titles = ["新手猜心師", "數字愛好者", "邏輯鬼才", "心智特工", "神算大師"];
    document.getElementById('user-title').innerText = titles[Math.min(xpData.level - 1, 4)];
    document.getElementById('xp-progress').style.width = `${(xpData.xp / (xpData.level * 100)) * 100}%`;
}

// 成就系統
const ALL_ACHIEVEMENTS = [
    { id: 'first_win', title: '🌱 初露鋒芒', desc: '完成首次獲勝' },
    { id: 'fast_win', title: '⚡ 極速傳說', desc: '60 秒內猜中' },
    { id: 'hell_win', title: '💀 地獄征服者', desc: '通關地獄難度' }
];

function checkAchievements(isWin) {
    let ach = JSON.parse(localStorage.getItem('1a2b_ach')) || [];
    if (isWin && !ach.includes('first_win')) ach.push('first_win');
    if (isWin && secondsElapsed <= 60 && !ach.includes('fast_win')) ach.push('fast_win');
    if (isWin && diffPreset === 'hell' && !ach.includes('hell_win')) ach.push('hell_win');
    localStorage.setItem('1a2b_ach', JSON.stringify(ach));
    renderAchievements();
}

function renderAchievements() {
    let ach = JSON.parse(localStorage.getItem('1a2b_ach')) || [];
    const grid = document.getElementById('achieve-grid');
    grid.innerHTML = '';
    ALL_ACHIEVEMENTS.forEach(item => {
        const isUnlocked = ach.includes(item.id);
        const div = document.createElement('div');
        div.className = `badge-item ${isUnlocked ? 'unlocked' : ''}`;
        div.innerText = `${item.title}`;
        grid.appendChild(div);
    });
}

window.onload = resetGame;