// 無人機證照・個人刷題複習王 主邏輯
(function () {
  'use strict';

  // 1. 全域變數與儲存配置
  const STORAGE_KEYS = {
    THEME: 'uav_theme',
    CURRENT_COURSE: 'uav_current_course',
    PRACTICE_STATS: 'uav_practice_stats_v1',
    WRONG_SET: 'uav_wrong_set_v1',
    FAVORITES: 'uav_favorites_v1'
  };

  const IMAGE_BASE_PATH = './images/';

  const state = {
    allQuestions: window.UAV_QUESTIONS || [],
    currentCourse: localStorage.getItem(STORAGE_KEYS.CURRENT_COURSE) || '普通操作證學科題庫',
    theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'light',
    
    // 儲存資料
    practiceStats: JSON.parse(localStorage.getItem(STORAGE_KEYS.PRACTICE_STATS) || '{}'),
    wrongMap: JSON.parse(localStorage.getItem(STORAGE_KEYS.WRONG_SET) || '{}'),
    favorites: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) || '[]')),
    
    // 章節練習狀態
    practice: {
      topic: 'ALL',
      shuffle: false,
      list: [],
      currentIndex: 0,
      selectedOption: null,
      isRevealed: false
    },

    // 模擬考狀態
    mock: {
      isRunning: false,
      timerId: null,
      remainingSeconds: 40 * 60,
      questions: [],
      userAnswers: {}, // index -> option
      currentIndex: 0
    },

    // 錯題庫狀態
    wrong: {
      list: [],
      currentIndex: 0,
      selectedOption: null,
      isRevealed: false
    }
  };

  // 2. DOM 節點引用
  const el = {
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    resetDataBtn: document.getElementById('resetDataBtn'),
    courseSelect: document.getElementById('courseSelect'),
    navTabs: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Badge
    wrongBadge: document.getElementById('wrongBadge'),
    favBadge: document.getElementById('favBadge'),

    // Dashboard
    statTotal: document.getElementById('statTotalQuestions'),
    statPracticed: document.getElementById('statPracticedCount'),
    statAccuracy: document.getElementById('statAccuracyRate'),
    statWrong: document.getElementById('statWrongCount'),

    // Practice
    practiceTopicSelect: document.getElementById('practiceTopicSelect'),
    practiceShuffleCheck: document.getElementById('practiceShuffleCheck'),
    practiceRestartBtn: document.getElementById('practiceRestartBtn'),
    practiceCard: document.getElementById('practiceQuestionCard'),

    // Mock
    mockIntroCard: document.getElementById('mockIntroCard'),
    mockRunningArea: document.getElementById('mockExamRunningArea'),
    mockResultCard: document.getElementById('mockResultCard'),
    startMockBtn: document.getElementById('startMockBtn'),
    mockTimer: document.getElementById('mockTimer'),
    submitMockBtn: document.getElementById('submitMockExamBtn'),
    mockQuestionCard: document.getElementById('mockQuestionCard'),
    mockAnswerProgress: document.getElementById('mockAnswerProgress'),
    mockAnswerGrid: document.getElementById('mockAnswerGrid'),

    // Wrong
    wrongQuizContainer: document.getElementById('wrongQuizContainer'),
    clearWrongListBtn: document.getElementById('clearWrongListBtn'),

    // Search
    searchKeywordInput: document.getElementById('searchKeywordInput'),
    searchBtn: document.getElementById('searchBtn'),
    showOnlyFavsBtn: document.getElementById('showOnlyFavsBtn'),
    searchResultStats: document.getElementById('searchResultStats'),
    searchResultsList: document.getElementById('searchResultsList')
  };

  // 3. 輔助函式
  function saveState() {
    localStorage.setItem(STORAGE_KEYS.CURRENT_COURSE, state.currentCourse);
    localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(state.practiceStats));
    localStorage.setItem(STORAGE_KEYS.WRONG_SET, JSON.stringify(state.wrongMap));
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(Array.from(state.favorites)));
    updateBadgesAndDashboard();
  }

  function getCourseQuestions(courseName) {
    return state.allQuestions.filter(q => q.source_name === courseName);
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // 4. 主題與初始化
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      el.themeToggleBtn.textContent = '☀️ 淺色';
    } else {
      document.documentElement.removeAttribute('data-theme');
      el.themeToggleBtn.textContent = '🌙 深色';
    }
  }

  function init() {
    applyTheme(state.theme);
    el.courseSelect.value = state.currentCourse;

    // 事件監聽
    el.themeToggleBtn.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    el.courseSelect.addEventListener('change', (e) => {
      state.currentCourse = e.target.value;
      saveState();
      reloadCurrentCourseView();
    });

    el.resetDataBtn.addEventListener('click', () => {
      if (confirm(`確定要清除【${state.currentCourse}】的所有練習紀錄與錯題嗎？`)) {
        const questions = getCourseQuestions(state.currentCourse);
        questions.forEach(q => {
          delete state.practiceStats[q.question_id];
          delete state.wrongMap[q.question_id];
        });
        saveState();
        reloadCurrentCourseView();
        alert('紀錄已清除！');
      }
    });

    // 頁籤切換
    el.navTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Practice 事件
    el.practiceTopicSelect.addEventListener('change', initPracticeList);
    el.practiceShuffleCheck.addEventListener('change', initPracticeList);
    el.practiceRestartBtn.addEventListener('click', initPracticeList);

    // Mock 事件
    el.startMockBtn.addEventListener('click', startMockExam);
    el.submitMockBtn.addEventListener('click', () => submitMockExam(false));

    // Wrong 事件
    el.clearWrongListBtn.addEventListener('click', () => {
      if (confirm('確定要清空目前考科的所有錯題嗎？')) {
        const questions = getCourseQuestions(state.currentCourse);
        questions.forEach(q => delete state.wrongMap[q.question_id]);
        saveState();
        renderWrongQuiz();
      }
    });

    // Search 事件
    el.searchBtn.addEventListener('click', executeSearch);
    el.searchKeywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });
    el.showOnlyFavsBtn.addEventListener('click', () => {
      el.searchKeywordInput.value = '';
      executeSearch(true);
    });

    reloadCurrentCourseView();
  }

  function switchTab(tabId) {
    el.navTabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    el.tabContents.forEach(c => c.style.display = (c.id === `tab-${tabId}`) ? 'block' : 'none');

    if (tabId === 'dashboard') {
      updateBadgesAndDashboard();
    } else if (tabId === 'practice') {
      if (state.practice.list.length === 0) initPracticeList();
      else renderPracticeQuestion();
    } else if (tabId === 'wrong') {
      renderWrongQuiz();
    } else if (tabId === 'search') {
      executeSearch();
    }
  }

  function reloadCurrentCourseView() {
    updateBadgesAndDashboard();
    populatePracticeTopics();
    initPracticeList();
    renderWrongQuiz();
  }

  // 5. Dashboard 與 Badges 更新
  function updateBadgesAndDashboard() {
    const questions = getCourseQuestions(state.currentCourse);
    const totalQ = questions.length;
    
    let practicedCount = 0;
    let correctCount = 0;
    let wrongInThisCourse = 0;
    let favInThisCourse = 0;

    questions.forEach(q => {
      const stat = state.practiceStats[q.question_id];
      if (stat && stat.answered) {
        practicedCount++;
        if (stat.isCorrect) correctCount++;
      }
      if (state.wrongMap[q.question_id]) wrongInThisCourse++;
      if (state.favorites.has(q.question_id)) favInThisCourse++;
    });

    const accuracy = practicedCount > 0 ? Math.round((correctCount / practicedCount) * 100) : 0;

    el.statTotal.textContent = totalQ;
    el.statPracticed.textContent = practicedCount;
    el.statAccuracy.textContent = `${accuracy}%`;
    el.statWrong.textContent = wrongInThisCourse;

    el.wrongBadge.textContent = wrongInThisCourse;
    el.favBadge.textContent = favInThisCourse;
  }

  // 6. 章節練習 (Practice) 模組
  function populatePracticeTopics() {
    const questions = getCourseQuestions(state.currentCourse);
    const topics = new Set();
    questions.forEach(q => { if (q.topic) topics.add(q.topic); });

    el.practiceTopicSelect.innerHTML = '<option value="ALL">全部章節 (全部題目)</option>';
    topics.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      const count = questions.filter(q => q.topic === t).length;
      opt.textContent = `${t} (${count}題)`;
      el.practiceTopicSelect.appendChild(opt);
    });
  }

  function initPracticeList() {
    let list = getCourseQuestions(state.currentCourse);
    const selectedTopic = el.practiceTopicSelect.value;
    if (selectedTopic !== 'ALL') {
      list = list.filter(q => q.topic === selectedTopic);
    }
    if (el.practiceShuffleCheck.checked) {
      list = shuffleArray(list);
    }
    state.practice.list = list;
    state.practice.currentIndex = 0;
    state.practice.selectedOption = null;
    state.practice.isRevealed = false;
    renderPracticeQuestion();
  }

  function renderPracticeQuestion() {
    const p = state.practice;
    if (p.list.length === 0) {
      el.practiceCard.innerHTML = `
        <div class="empty-box">
          <h3>目前選擇的章節沒有題目</h3>
        </div>
      `;
      return;
    }

    const q = p.list[p.currentIndex];
    const isFav = state.favorites.has(q.question_id);

    let html = `
      <div class="question-box">
        <div class="question-header">
          <div>
            <strong>第 ${p.currentIndex + 1} / ${p.list.length} 題</strong>
            <span style="margin-left: 8px; color: var(--primary);">[${q.topic || '無人機常識'}]</span>
            <span style="margin-left: 6px; font-size: 0.8rem;">(${q.question_id})</span>
          </div>
          <div>
            <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.85rem;" onclick="app.toggleFavorite('${q.question_id}')">
              ${isFav ? '⭐ 已收藏' : '☆ 收藏'}
            </button>
          </div>
        </div>

        <div class="question-stem">${q.stem}</div>

        <div class="options-list">
          ${renderOptionItem('A', q.option_a, p.selectedOption, q.correct_option, p.isRevealed, 'app.onSelectPracticeOption')}
          ${renderOptionItem('B', q.option_b, p.selectedOption, q.correct_option, p.isRevealed, 'app.onSelectPracticeOption')}
          ${renderOptionItem('C', q.option_c, p.selectedOption, q.correct_option, p.isRevealed, 'app.onSelectPracticeOption')}
          ${renderOptionItem('D', q.option_d, p.selectedOption, q.correct_option, p.isRevealed, 'app.onSelectPracticeOption')}
        </div>

        ${p.isRevealed ? renderExplanationBox(q) : ''}

        <div class="quiz-footer">
          <div>
            <button class="btn btn-outline" ${p.currentIndex === 0 ? 'disabled' : ''} onclick="app.prevPracticeQuestion()">
              ⬅ 上一題
            </button>
            <button class="btn btn-primary" ${p.currentIndex >= p.list.length - 1 ? 'disabled' : ''} onclick="app.nextPracticeQuestion()">
              下一題 ➡
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <select class="filter-select" style="padding: 4px 8px; font-size: 0.85rem;" onchange="app.jumpPracticeQuestion(this.value)">
              ${p.list.map((item, idx) => `<option value="${idx}" ${idx === p.currentIndex ? 'selected' : ''}>跳至第 ${idx + 1} 題</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;

    el.practiceCard.innerHTML = html;
  }

  function renderOptionItem(letter, text, selected, correct, isRevealed, clickHandler) {
    if (!text) return '';
    let classes = ['option-item'];
    if (selected === letter) classes.push('selected');
    if (isRevealed) {
      if (letter === correct) classes.push('correct');
      else if (selected === letter && selected !== correct) classes.push('wrong');
    }

    return `
      <div class="${classes.join(' ')}" onclick="${clickHandler}('${letter}')">
        <span class="option-letter">${letter}</span>
        <span>${text}</span>
      </div>
    `;
  }

  function renderExplanationBox(q) {
    let imagesHtml = '';
    if (q.explanation_images) {
      const imgList = q.explanation_images.split('|').filter(Boolean);
      if (imgList.length > 0) {
        imagesHtml = `
          <div class="explanation-images">
            ${imgList.map(img => `<a href="${IMAGE_BASE_PATH}${img}" target="_blank" title="點擊放大圖片"><img src="${IMAGE_BASE_PATH}${img}" alt="解說圖片" onerror="this.style.display='none'"></a>`).join('')}
          </div>
        `;
      }
    }

    let lawHtml = '';
    if (q.law_reference || q.law_excerpt) {
      lawHtml = `
        <div style="margin-top: 8px; font-size: 0.9rem; color: var(--text-muted); background: var(--bg-card); padding: 10px; border-radius: 6px;">
          <strong>📜 法規依據：</strong> ${q.law_reference || ''}
          ${q.law_url ? `<a href="${q.law_url}" target="_blank" style="color: var(--primary); margin-left: 6px;">[全國法規資料庫]</a>` : ''}
          ${q.law_excerpt ? `<div style="margin-top: 4px; font-style: italic;">「${q.law_excerpt}」</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="explanation-box">
        <div class="explanation-title">
          <span>💡 詳解與法規出處</span>
          <span style="margin-left: auto; font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">正確答案：<strong style="color: var(--success); font-size: 1.1rem;">${q.correct_option}</strong></span>
        </div>
        <div class="explanation-text">${escapeHtml(q.answer_explanation || '暫無詳解文字')}</div>
        ${imagesHtml}
        ${lawHtml}
      </div>
    `;
  }

  function onSelectPracticeOption(letter) {
    const p = state.practice;
    if (p.isRevealed) return; // 已揭曉不重複計分

    p.selectedOption = letter;
    p.isRevealed = true;

    const q = p.list[p.currentIndex];
    const isCorrect = (letter === q.correct_option);

    // 紀錄作答
    state.practiceStats[q.question_id] = {
      answered: true,
      isCorrect: isCorrect,
      time: Date.now()
    };

    if (!isCorrect) {
      state.wrongMap[q.question_id] = (state.wrongMap[q.question_id] || 0) + 1;
    } else {
      // 若答對且曾在錯題本，不強制刪除，但降低或提供按鈕
    }

    saveState();
    renderPracticeQuestion();
  }

  function nextPracticeQuestion() {
    if (state.practice.currentIndex < state.practice.list.length - 1) {
      state.practice.currentIndex++;
      state.practice.selectedOption = null;
      state.practice.isRevealed = false;
      renderPracticeQuestion();
    }
  }

  function prevPracticeQuestion() {
    if (state.practice.currentIndex > 0) {
      state.practice.currentIndex--;
      state.practice.selectedOption = null;
      state.practice.isRevealed = false;
      renderPracticeQuestion();
    }
  }

  function jumpPracticeQuestion(idx) {
    state.practice.currentIndex = parseInt(idx, 10);
    state.practice.selectedOption = null;
    state.practice.isRevealed = false;
    renderPracticeQuestion();
  }

  // 7. 全真模擬考 (Mock) 模組
  function startMockExam() {
    const all = getCourseQuestions(state.currentCourse);
    if (all.length === 0) {
      alert('目前考科沒有題目可進行模擬測驗！');
      return;
    }

    const examQuestions = shuffleArray(all).slice(0, Math.min(40, all.length));
    state.mock.questions = examQuestions;
    state.mock.userAnswers = {};
    state.mock.currentIndex = 0;
    state.mock.remainingSeconds = 40 * 60; // 40 分鐘
    state.mock.isRunning = true;

    el.mockIntroCard.style.display = 'none';
    el.mockResultCard.style.display = 'none';
    el.mockRunningArea.style.display = 'block';

    if (state.mock.timerId) clearInterval(state.mock.timerId);
    updateMockTimerDisplay();
    state.mock.timerId = setInterval(() => {
      state.mock.remainingSeconds--;
      updateMockTimerDisplay();
      if (state.mock.remainingSeconds <= 0) {
        clearInterval(state.mock.timerId);
        alert('⏰ 時間到！系統將自動交卷！');
        submitMockExam(true);
      }
    }, 1000);

    renderMockCurrentQuestion();
    renderMockGrid();
  }

  function updateMockTimerDisplay() {
    const m = Math.floor(state.mock.remainingSeconds / 60);
    const s = state.mock.remainingSeconds % 60;
    el.mockTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (state.mock.remainingSeconds <= 300) {
      el.mockTimer.style.color = '#ef4444';
    } else {
      el.mockTimer.style.color = 'var(--text-main)';
    }
  }

  function renderMockCurrentQuestion() {
    const m = state.mock;
    const q = m.questions[m.currentIndex];
    const selected = m.userAnswers[m.currentIndex];

    el.mockQuestionCard.innerHTML = `
      <div class="question-box">
        <div class="question-header">
          <div>
            <strong>第 ${m.currentIndex + 1} / ${m.questions.length} 題</strong>
            <span style="margin-left: 8px; color: var(--primary);">[${q.topic || '無人機常識'}]</span>
          </div>
        </div>

        <div class="question-stem">${q.stem}</div>

        <div class="options-list">
          ${renderOptionItem('A', q.option_a, selected, null, false, 'app.onSelectMockOption')}
          ${renderOptionItem('B', q.option_b, selected, null, false, 'app.onSelectMockOption')}
          ${renderOptionItem('C', q.option_c, selected, null, false, 'app.onSelectMockOption')}
          ${renderOptionItem('D', q.option_d, selected, null, false, 'app.onSelectMockOption')}
        </div>

        <div class="quiz-footer">
          <div>
            <button class="btn btn-outline" ${m.currentIndex === 0 ? 'disabled' : ''} onclick="app.prevMockQuestion()">⬅ 上一題</button>
            <button class="btn btn-primary" ${m.currentIndex >= m.questions.length - 1 ? 'disabled' : ''} onclick="app.nextMockQuestion()">下一題 ➡</button>
          </div>
        </div>
      </div>
    `;

    renderMockGrid();
  }

  function renderMockGrid() {
    const m = state.mock;
    let answeredCount = 0;
    let gridHtml = '';

    m.questions.forEach((_, idx) => {
      const isAnswered = (m.userAnswers[idx] !== undefined);
      if (isAnswered) answeredCount++;
      const isCurrent = (idx === m.currentIndex);
      let cls = 'exam-grid-item';
      if (isAnswered) cls += ' answered';
      if (isCurrent) cls += ' current';

      gridHtml += `<div class="${cls}" onclick="app.jumpMockQuestion(${idx})">${idx + 1}</div>`;
    });

    el.mockAnswerGrid.innerHTML = gridHtml;
    el.mockAnswerProgress.textContent = `已答：${answeredCount} / ${m.questions.length}`;
  }

  function onSelectMockOption(letter) {
    state.mock.userAnswers[state.mock.currentIndex] = letter;
    renderMockCurrentQuestion();
  }

  function nextMockQuestion() {
    if (state.mock.currentIndex < state.mock.questions.length - 1) {
      state.mock.currentIndex++;
      renderMockCurrentQuestion();
    }
  }

  function prevMockQuestion() {
    if (state.mock.currentIndex > 0) {
      state.mock.currentIndex--;
      renderMockCurrentQuestion();
    }
  }

  function jumpMockQuestion(idx) {
    state.mock.currentIndex = idx;
    renderMockCurrentQuestion();
  }

  function submitMockExam(force = false) {
    const m = state.mock;
    const answeredCount = Object.keys(m.userAnswers).length;
    const unansweredCount = m.questions.length - answeredCount;

    if (!force && unansweredCount > 0) {
      if (!confirm(`尚有 ${unansweredCount} 題未作答，確定要現在交卷嗎？`)) {
        return;
      }
    }

    if (m.timerId) clearInterval(m.timerId);
    m.isRunning = false;

    // 計算分數
    let correctCount = 0;
    const wrongQuestions = [];

    m.questions.forEach((q, idx) => {
      const userAns = m.userAnswers[idx];
      const isCorrect = (userAns === q.correct_option);
      if (isCorrect) {
        correctCount++;
      } else {
        wrongQuestions.push({ q, userAns, qIndex: idx + 1 });
        state.wrongMap[q.question_id] = (state.wrongMap[q.question_id] || 0) + 1;
      }
    });

    saveState();

    const score = Math.round((correctCount / m.questions.length) * 100);
    const isPass = (score >= 80);

    el.mockRunningArea.style.display = 'none';
    el.mockResultCard.style.display = 'block';

    let resultHtml = `
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 3rem; margin-bottom: 8px;">${isPass ? '🎉' : '⚠️'}</div>
        <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: ${isPass ? 'var(--success)' : 'var(--danger)'};">
          ${isPass ? '測驗合格 (PASS)' : '測驗未合格 (FAIL)'}
        </h2>
        <div style="font-size: 2.8rem; font-weight: 800; color: var(--primary); margin: 12px 0;">
          ${score} <span style="font-size: 1.2rem; font-weight: normal; color: var(--text-muted);">分</span>
        </div>
        <p style="color: var(--text-muted); font-size: 1.1rem; margin-bottom: 20px;">
          答對 <strong>${correctCount}</strong> / <strong>${m.questions.length}</strong> 題（及格門檻為 80 分）
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 30px;">
          <button class="btn btn-primary" onclick="app.startMockExam()">🔄 再測驗一次</button>
          <button class="btn btn-outline" onclick="app.switchTab('wrong')">❌ 查看所有錯題本</button>
        </div>
      </div>

      <hr style="border: none; border-top: 1px solid var(--border); margin: 24px 0;">
      <h3 style="margin-bottom: 16px;">📝 本次測驗檢討分析（共 ${wrongQuestions.length} 題答錯）</h3>
    `;

    if (wrongQuestions.length === 0) {
      resultHtml += `
        <div class="empty-box" style="color: var(--success);">
          <h3>太強了！本次模擬考全部答對，零失誤！</h3>
        </div>
      `;
    } else {
      wrongQuestions.forEach(({ q, userAns, qIndex }) => {
        resultHtml += `
          <div class="card" style="margin-bottom: 16px; border-left: 4px solid var(--danger);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <strong>第 ${qIndex} 題 [${q.topic || '無人機常識'}]</strong>
              <span style="color: var(--danger); font-weight: 600;">您的選擇：${userAns || '未作答'} ｜ 正確答案：${q.correct_option}</span>
            </div>
            <div style="font-size: 1.05rem; margin-bottom: 12px;">${q.stem}</div>
            <div class="explanation-box">
              <div class="explanation-text">${escapeHtml(q.answer_explanation || '暫無詳解')}</div>
              ${q.explanation_images ? `<div class="explanation-images">${q.explanation_images.split('|').filter(Boolean).map(img => `<img src="${IMAGE_BASE_PATH}${img}">`).join('')}</div>` : ''}
            </div>
          </div>
        `;
      });
    }

    el.mockResultCard.innerHTML = resultHtml;
  }

  // 8. 錯題特訓庫 (Wrong) 模組
  function renderWrongQuiz() {
    const courseQuestions = getCourseQuestions(state.currentCourse);
    const wrongList = courseQuestions.filter(q => (state.wrongMap[q.question_id] || 0) > 0);
    state.wrong.list = wrongList;

    if (wrongList.length === 0) {
      el.wrongQuizContainer.innerHTML = `
        <div class="card empty-box">
          <div style="font-size: 3rem; margin-bottom: 10px;">🏆</div>
          <h3>太棒了！目前沒有任何待消滅的錯題！</h3>
          <p style="color: var(--text-muted); margin-top: 8px;">進行章節練習或模擬考時答錯的題目會自動彙整於此。</p>
        </div>
      `;
      return;
    }

    if (state.wrong.currentIndex >= wrongList.length) {
      state.wrong.currentIndex = 0;
    }

    const q = wrongList[state.wrong.currentIndex];
    const wrongCount = state.wrongMap[q.question_id] || 1;
    const isFav = state.favorites.has(q.question_id);
    const w = state.wrong;

    el.wrongQuizContainer.innerHTML = `
      <div class="card">
        <div class="question-box">
          <div class="question-header">
            <div>
              <strong>錯題 ${w.currentIndex + 1} / ${wrongList.length}</strong>
              <span class="badge" style="margin-left: 8px;">做錯 ${wrongCount} 次</span>
              <span style="margin-left: 8px; color: var(--primary);">[${q.topic || '無人機常識'}]</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.85rem;" onclick="app.removeWrongItem('${q.question_id}')">
                ✅ 移出租題本
              </button>
              <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.85rem;" onclick="app.toggleFavorite('${q.question_id}')">
                ${isFav ? '⭐ 已收藏' : '☆ 收藏'}
              </button>
            </div>
          </div>

          <div class="question-stem">${q.stem}</div>

          <div class="options-list">
            ${renderOptionItem('A', q.option_a, w.selectedOption, q.correct_option, w.isRevealed, 'app.onSelectWrongOption')}
            ${renderOptionItem('B', q.option_b, w.selectedOption, q.correct_option, w.isRevealed, 'app.onSelectWrongOption')}
            ${renderOptionItem('C', q.option_c, w.selectedOption, q.correct_option, w.isRevealed, 'app.onSelectWrongOption')}
            ${renderOptionItem('D', q.option_d, w.selectedOption, q.correct_option, w.isRevealed, 'app.onSelectWrongOption')}
          </div>

          ${w.isRevealed ? `
            ${renderExplanationBox(q)}
            ${w.selectedOption === q.correct_option ? `
              <div style="background: var(--success-light); color: var(--success); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>🎉 答對了！建議將此題自錯題庫消滅！</span>
                <button class="btn btn-success" style="padding: 4px 12px; font-size: 0.9rem;" onclick="app.removeWrongItem('${q.question_id}')">立即消滅此題</button>
              </div>
            ` : ''}
          ` : ''}

          <div class="quiz-footer">
            <div>
              <button class="btn btn-outline" ${w.currentIndex === 0 ? 'disabled' : ''} onclick="app.prevWrongQuestion()">⬅ 上一題</button>
              <button class="btn btn-primary" ${w.currentIndex >= wrongList.length - 1 ? 'disabled' : ''} onclick="app.nextWrongQuestion()">下一題 ➡</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function onSelectWrongOption(letter) {
    const w = state.wrong;
    if (w.isRevealed) return;
    w.selectedOption = letter;
    w.isRevealed = true;

    const q = w.list[w.currentIndex];
    if (letter !== q.correct_option) {
      state.wrongMap[q.question_id] = (state.wrongMap[q.question_id] || 0) + 1;
      saveState();
    }
    renderWrongQuiz();
  }

  function removeWrongItem(qId) {
    delete state.wrongMap[qId];
    saveState();
    renderWrongQuiz();
  }

  function nextWrongQuestion() {
    if (state.wrong.currentIndex < state.wrong.list.length - 1) {
      state.wrong.currentIndex++;
      state.wrong.selectedOption = null;
      state.wrong.isRevealed = false;
      renderWrongQuiz();
    }
  }

  function prevWrongQuestion() {
    if (state.wrong.currentIndex > 0) {
      state.wrong.currentIndex--;
      state.wrong.selectedOption = null;
      state.wrong.isRevealed = false;
      renderWrongQuiz();
    }
  }

  // 9. 收藏與題庫搜尋 (Search & Favorites)
  function executeSearch(onlyFavorites = false) {
    const questions = getCourseQuestions(state.currentCourse);
    const keyword = el.searchKeywordInput.value.trim().toLowerCase();

    let results = questions;
    if (onlyFavorites) {
      results = results.filter(q => state.favorites.has(q.question_id));
    } else if (keyword) {
      results = results.filter(q => {
        return (q.stem && q.stem.toLowerCase().includes(keyword)) ||
               (q.option_a && q.option_a.toLowerCase().includes(keyword)) ||
               (q.option_b && q.option_b.toLowerCase().includes(keyword)) ||
               (q.option_c && q.option_c.toLowerCase().includes(keyword)) ||
               (q.option_d && q.option_d.toLowerCase().includes(keyword)) ||
               (q.answer_explanation && q.answer_explanation.toLowerCase().includes(keyword)) ||
               (q.law_reference && q.law_reference.toLowerCase().includes(keyword)) ||
               (q.topic && q.topic.toLowerCase().includes(keyword));
      });
    }

    el.searchResultStats.textContent = `共 ${results.length} 筆符合題目`;

    if (results.length === 0) {
      el.searchResultsList.innerHTML = `
        <div class="card empty-box">
          <h3>查無符合的題目</h3>
          <p style="color: var(--text-muted); margin-top: 6px;">試試其他關鍵字，或切換上方考科。</p>
        </div>
      `;
      return;
    }

    el.searchResultsList.innerHTML = results.slice(0, 80).map((q, idx) => {
      const isFav = state.favorites.has(q.question_id);
      return `
        <div class="card">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: var(--text-muted); font-size: 0.9rem;">
            <span>#${idx + 1} [${q.topic || '無人機常識'}] (${q.question_id})</span>
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.8rem;" onclick="app.toggleFavorite('${q.question_id}')">
              ${isFav ? '⭐ 已收藏' : '☆ 收藏'}
            </button>
          </div>
          <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 12px;">${q.stem}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; font-size: 0.95rem;">
            <div style="${q.correct_option === 'A' ? 'color: var(--success); font-weight: bold;' : ''}">(A) ${q.option_a}</div>
            <div style="${q.correct_option === 'B' ? 'color: var(--success); font-weight: bold;' : ''}">(B) ${q.option_b}</div>
            <div style="${q.correct_option === 'C' ? 'color: var(--success); font-weight: bold;' : ''}">(C) ${q.option_c}</div>
            <div style="${q.correct_option === 'D' ? 'color: var(--success); font-weight: bold;' : ''}">(D) ${q.option_d}</div>
          </div>
          <details style="cursor: pointer; background: var(--bg-main); padding: 10px; border-radius: 8px;">
            <summary style="font-weight: 600; color: var(--primary);">點擊查看詳解與法規出處（正確答案：${q.correct_option}）</summary>
            <div style="margin-top: 8px;">
              ${renderExplanationBox(q)}
            </div>
          </details>
        </div>
      `;
    }).join('') + (results.length > 80 ? `<div style="text-align: center; color: var(--text-muted); padding: 10px;">（為維持流暢度，僅顯示前 80 筆，請縮小關鍵字範圍）</div>` : '');
  }

  function toggleFavorite(qId) {
    if (state.favorites.has(qId)) {
      state.favorites.delete(qId);
    } else {
      state.favorites.add(qId);
    }
    saveState();
    
    // 依目前頁面重新渲染按鈕
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'practice') renderPracticeQuestion();
    else if (activeTab === 'wrong') renderWrongQuiz();
    else if (activeTab === 'search') executeSearch();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 10. 對外暴露介面供 HTML 內聯事件使用
  window.app = {
    switchTab,
    toggleFavorite,
    onSelectPracticeOption,
    nextPracticeQuestion,
    prevPracticeQuestion,
    jumpPracticeQuestion,
    startMockExam,
    onSelectMockOption,
    nextMockQuestion,
    prevMockQuestion,
    jumpMockQuestion,
    submitMockExam,
    onSelectWrongOption,
    removeWrongItem,
    nextWrongQuestion,
    prevWrongQuestion
  };

  // 啟動
  document.addEventListener('DOMContentLoaded', init);
})();
