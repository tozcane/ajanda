// STATE MANAGEMENT
let diaryData = {};
let currentDate = new Date();
let isFlipping = false;
let currentLayout = '2';
let leftCanvasHasDrawing = false;
let rightCanvasHasDrawing = false;
let currentLineWidth = 2;

// DOM ELEMENTS
const themeToggle = document.getElementById('theme-toggle');
const liveHeaderDate = document.getElementById('live-header-date');
const notebook = document.getElementById('notebook');
const pageLeft = document.getElementById('page-left');
const pageRight = document.getElementById('page-right');
const pageFlipping = document.getElementById('page-flipping');

const leftPageContent = document.getElementById('left-page-content');
const rightPageContent = document.getElementById('right-page-content');

const leftMiniTitle = document.getElementById('left-mini-title');
const rightMiniTitle = document.getElementById('right-mini-title');
const leftMiniCalendar = document.getElementById('left-mini-calendar');
const rightMiniCalendar = document.getElementById('right-mini-calendar');

const tabBtns = document.querySelectorAll('.tab-btn');

const prevSpreadBtn = document.getElementById('prev-spread-btn');
const todayBtn = document.getElementById('today-btn');
const nextSpreadBtn = document.getElementById('next-spread-btn');
const pageStyleSelect = document.getElementById('page-style-select');
const drawModeBtn = document.getElementById('draw-mode-btn');
const clearDrawBtn = document.getElementById('clear-draw-btn');

// MONTHS AND DAYS (TURKISH, ENGLISH, FRENCH)
const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DAYS_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

// INITIALIZE APP
function init() {
  // 1. Theme Configuration
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.addEventListener('click', toggleTheme);

  // 2. Load LocalStorage Database
  loadDatabase();

  // 3. Setup Navigation Controls
  prevSpreadBtn.addEventListener('click', () => changeSpread(-2));
  nextSpreadBtn.addEventListener('click', () => changeSpread(2));
  todayBtn.addEventListener('click', goToToday);

  // 4. Setup Tab Buttons (Month Navigation)
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const month = parseInt(btn.dataset.month);
      goToMonth(month);
    });
  });

  // 5. Setup Page Style Selector
  const savedStyle = localStorage.getItem('page-style') || 'ruled';
  pageStyleSelect.value = savedStyle;
  notebook.setAttribute('data-style', savedStyle);
  
  pageStyleSelect.addEventListener('change', (e) => {
    const style = e.target.value;
    notebook.setAttribute('data-style', style);
    localStorage.setItem('page-style', style);
  });

  // Setup Page Layout Selector
  const pageLayoutSelect = document.getElementById('page-layout-select');
  const savedLayout = localStorage.getItem('page-layout') || '2';
  currentLayout = savedLayout;
  pageLayoutSelect.value = savedLayout;
  notebook.setAttribute('data-layout', savedLayout);

  pageLayoutSelect.addEventListener('change', (e) => {
    currentLayout = e.target.value;
    localStorage.setItem('page-layout', currentLayout);
    renderSpread();
  });

  // 6. Setup Çizim Modu / iPad Stylus Drawing
  setupCanvasDrawing(document.getElementById('left-canvas'));
  setupCanvasDrawing(document.getElementById('right-canvas'));

  // Prevent stylus from focusing text inputs to bypass iPadOS Scribble text conversion
  notebook.addEventListener('pointerdown', (e) => {
    const isPen = e.pointerType === 'pen' || e.pointerType === 'eraser';
    if ((isPen || isDrawingMode) && e.target.classList.contains('line-input')) {
      e.preventDefault();
    }
  }, { passive: false });

  // Color Tools Selectors
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentTool = 'pen';
      currentInkColor = btn.dataset.color;
      
      // Update Active Classes
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('highlighter-btn').classList.remove('active');
      document.getElementById('eraser-btn').classList.remove('active');
    });
  });

  // Highlighter Tool Select
  const highlighterBtn = document.getElementById('highlighter-btn');
  highlighterBtn.addEventListener('click', () => {
    currentTool = 'highlighter';
    colorBtns.forEach(b => b.classList.remove('active'));
    highlighterBtn.classList.add('active');
    document.getElementById('eraser-btn').classList.remove('active');
  });

  // Eraser Tool Select
  const eraserBtn = document.getElementById('eraser-btn');
  eraserBtn.addEventListener('click', () => {
    currentTool = 'eraser';
    colorBtns.forEach(b => b.classList.remove('active'));
    highlighterBtn.classList.remove('active');
    eraserBtn.classList.add('active');
  });

  // Thickness Selector Actions
  const thicknessBtns = document.querySelectorAll('.thickness-btn');
  thicknessBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentLineWidth = parseFloat(btn.dataset.thickness);
      
      // Update active state class
      thicknessBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Undo (Geri Al) Action Listener
  const undoBtn = document.getElementById('undo-btn');
  undoBtn.addEventListener('click', () => {
    if (globalUndoStack.length > 0) {
      const lastSnapshot = globalUndoStack.pop();
      const canvas = document.getElementById(lastSnapshot.canvasId);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          saveDrawings();
        };
        img.src = lastSnapshot.dataUrl;
      }
    }
  });

  // Finger/Mouse Draw Mode toggle
  drawModeBtn.addEventListener('click', () => {
    isDrawingMode = !isDrawingMode;
    drawModeBtn.classList.toggle('active', isDrawingMode);
    notebook.classList.toggle('drawing-mode', isDrawingMode);
  });

  clearDrawBtn.addEventListener('click', () => {
    if (confirm('Bu sayfadaki tüm el yazısı çizimleri temizlemek istiyor musunuz?')) {
      clearPageDrawings();
    }
  });

  window.addEventListener('resize', debounce(resizeCanvases, 250));

  // 8. Setup Backup and Restore (Export/Import JSON)
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file-input');

  exportBtn.addEventListener('click', () => {
    saveCurrentInputs();
    saveDrawings();
    
    const backupObj = {
      version: '1.0',
      timestamp: Date.now(),
      data: diaryData
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ajanda_yedek_${formatDateString(new Date())}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  importBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backupObj = JSON.parse(event.target.result);
        let importedData = null;
        
        // Handle new backup version format or raw data fallback
        if (backupObj && backupObj.data && typeof backupObj.data === 'object') {
          importedData = backupObj.data;
        } else if (backupObj && typeof backupObj === 'object') {
          importedData = backupObj;
        }

        if (importedData) {
          if (confirm('Mevcut verilerinizin üzerine yedekteki veriler yazılacaktır. Onaylıyor musunuz?')) {
            diaryData = importedData;
            localStorage.setItem('classic-notebook-db', JSON.stringify(diaryData));
            renderSpread();
            alert('Veriler başarıyla yedekten geri yüklendi!');
          }
        } else {
          alert('Geçersiz yedek dosyası formatı!');
        }
      } catch (err) {
        alert('Yedek dosyası okunurken hata oluştu!');
      }
      // Reset file input to allow same file import multiple times
      importFileInput.value = '';
    };
    reader.readAsText(file);
  });

  // 9. Setup Drag/Swipe Gestures for Page Turns
  setupSwipeGestures();

  // 10. Register Service Worker for Offline PWA Support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker registered successfully'))
      .catch(err => console.log('Service Worker registration failed:', err));
  }

  // 11. Initial Render of Current Spread
  renderSpread();
}

// THEME SYSTEM
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// HEADER LIVE DATE
function updateLiveHeaderDate() {
  const now = new Date();
  const day = now.getDate();
  const monthName = MONTHS[now.getMonth()];
  const year = now.getFullYear();
  liveHeaderDate.textContent = `${day} ${monthName} ${year}`;
}

// DATABASE LAYER
function loadDatabase() {
  const data = localStorage.getItem('classic-notebook-db');
  if (data) {
    diaryData = JSON.parse(data);
  } else {
    // Generate initial dummy data for demo centered around today
    const now = new Date();
    const todayStr = formatDateString(now);
    
    // Friday / Weekend offset mock values
    const temp = new Date(now);
    const day = temp.getDay();
    let friDate = new Date(temp);
    
    if (day === 0) friDate.setDate(temp.getDate() - 2);
    else if (day === 6) friDate.setDate(temp.getDate() - 1);
    else friDate.setDate(temp.getDate() - (day - 5)); // Go to Friday of current week
    
    const friStr = formatDateString(friDate);
    const satDate = new Date(friDate); satDate.setDate(friDate.getDate() + 1);
    const satStr = formatDateString(satDate);
    const sunDate = new Date(friDate); sunDate.setDate(friDate.getDate() + 2);
    const sunStr = formatDateString(sunDate);

    diaryData[friStr] = {
      '08:00': 'Haftalık kapanış toplantısı',
      '10:00': 'Kod inceleme ve PR kabulleri',
      '12:00': 'Ekip ile cuma öğle yemeği',
      '14:00': 'Uygulama tasarım iyileştirmesi',
      '16:00': 'Sunucu test ortamı dağıtımı',
      '18:00': 'Spor & Jogging',
      '20:00': 'Kitap Okuma (Kişisel Gelişim)'
    };
    diaryData[satStr] = {
      '08:00': 'Sabah kahvesi ve gazete',
      '10:00': 'Hafta sonu doğa yürüyüşü',
      '14:00': 'Yazılım seminerine katılım',
      '18:00': 'Market ve mutfak alışverişi'
    };
    diaryData[sunStr] = {
      '10:00': 'Aile ile kahvaltı buluşması',
      '16:00': 'Yeni haftanın planlaması',
      '20:00': 'Sinema & Film gecesi'
    };
    
    // Fallback for today if it wasn't friday/weekend
    if (!diaryData[todayStr]) {
      diaryData[todayStr] = {
        '08:00': 'Güne başlangıç ve e-posta kontrolü',
        '10:00': 'Ajanda projesi kodlama seansı',
        '12:00': 'Mola & Öğle Yemeği',
        '14:00': 'Kod refaktör ve 3D animasyon testleri',
        '18:00': 'Günlük yürüyüş ve egzersiz',
        '20:00': 'Teknik makale yazımı'
      };
    }
    
    localStorage.setItem('classic-notebook-db', JSON.stringify(diaryData));
  }
}

// AUTO SAVE DATA
function saveInputData(dateStr) {
  const container = document.querySelector(`.ruled-lines-container[data-date="${dateStr}"]`);
  if (!container) return;

  const inputs = container.querySelectorAll('.line-input');
  const dayData = {};
  
  inputs.forEach(input => {
    const hour = input.dataset.hour;
    const value = input.value.trim();
    if (value) {
      dayData[hour] = value;
    }
  });

  // Preserve drawings on text save
  const existingDrawing = diaryData[dateStr] ? diaryData[dateStr].drawing : null;
  diaryData[dateStr] = dayData;
  if (existingDrawing) {
    diaryData[dateStr].drawing = existingDrawing;
  }

  localStorage.setItem('classic-notebook-db', JSON.stringify(diaryData));
}

function getDayData(dateStr) {
  return diaryData[dateStr] || {};
}

// SPREAD ALGORITHMS (CALCULATE LEFT & RIGHT DATES)
function calculateSpreadDates(date) {
  const temp = new Date(date);
  const day = temp.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  let leftDate, rightDate1, rightDate2;
  
  if (day === 1 || day === 2) {
    // Mon-Tue Spread
    leftDate = new Date(temp);
    leftDate.setDate(temp.getDate() - (day === 2 ? 1 : 0));
    
    rightDate1 = new Date(leftDate);
    rightDate1.setDate(leftDate.getDate() + 1);
  } else if (day === 3 || day === 4) {
    // Wed-Thu Spread
    leftDate = new Date(temp);
    leftDate.setDate(temp.getDate() - (day === 4 ? 1 : 0));
    
    rightDate1 = new Date(leftDate);
    rightDate1.setDate(leftDate.getDate() + 1);
  } else {
    // Fri-Sat-Sun Spread (Weekend Split layout)
    leftDate = new Date(temp);
    if (day === 0) { // Sunday
      leftDate.setDate(temp.getDate() - 2);
    } else if (day === 6) { // Saturday
      leftDate.setDate(temp.getDate() - 1);
    }
    
    rightDate1 = new Date(leftDate);
    rightDate1.setDate(leftDate.getDate() + 1); // Saturday
    
    rightDate2 = new Date(leftDate);
    rightDate2.setDate(leftDate.getDate() + 2); // Sunday
  }
  
  return { leftDate, rightDate1, rightDate2 };
}

// MAIN RENDERING ENGINE
function renderSpread(date = currentDate) {
  notebook.setAttribute('data-layout', currentLayout);

  if (currentLayout === '1') {
    // 1. Single Day View Mode
    leftPageContent.innerHTML = generatePageHTML(date, false, 14);
    rightPageContent.innerHTML = '';
  }
  else if (currentLayout === '2') {
    // 2. Classic Double Page Spread
    const { leftDate, rightDate1, rightDate2 } = calculateSpreadDates(date);
    
    leftPageContent.innerHTML = generatePageHTML(leftDate, false);
    if (rightDate2) {
      rightPageContent.innerHTML = generateWeekendSplitPageHTML(rightDate1, rightDate2);
    } else {
      rightPageContent.innerHTML = generatePageHTML(rightDate1, false);
    }
  }
  else if (currentLayout === '4') {
    // 3. 4-Day Grid View Mode
    const d1 = new Date(date);
    const d2 = new Date(date); d2.setDate(d1.getDate() + 1);
    const d3 = new Date(date); d3.setDate(d1.getDate() + 2);
    const d4 = new Date(date); d4.setDate(d1.getDate() + 3);

    leftPageContent.innerHTML = generateSplitGridPageHTML(d1, d2);
    rightPageContent.innerHTML = generateSplitGridPageHTML(d3, d4);
  }
  else if (currentLayout === 'weekly') {
    // 4. Weekly Spread (7 Days on screen)
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const mon = new Date(startOfWeek);
    const tue = new Date(startOfWeek); tue.setDate(mon.getDate() + 1);
    const wed = new Date(startOfWeek); wed.setDate(mon.getDate() + 2);
    const thu = new Date(startOfWeek); thu.setDate(mon.getDate() + 3);
    const fri = new Date(startOfWeek); fri.setDate(mon.getDate() + 4);
    const sat = new Date(startOfWeek); sat.setDate(mon.getDate() + 5);
    const sun = new Date(startOfWeek); sun.setDate(mon.getDate() + 6);

    leftPageContent.innerHTML = generateTripleSplitPageHTML(mon, tue, wed);
    rightPageContent.innerHTML = generateQuadSplitPageHTML(thu, fri, sat, sun);
  }

  // Bind Input Listeners on Left & Right inputs for saving
  bindInputListeners();

  // Get base date for mini calendars
  let miniCalBaseDate = date;
  if (currentLayout === '2') {
    const { leftDate } = calculateSpreadDates(date);
    miniCalBaseDate = leftDate;
  } else if (currentLayout === 'weekly') {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    miniCalBaseDate = startOfWeek;
  }
  renderMiniCalendars(miniCalBaseDate);

  // Highlight active month tab
  const activeMonth = date.getMonth();
  tabBtns.forEach(btn => {
    if (parseInt(btn.dataset.month) === activeMonth) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Load Stylus Drawings
  loadDrawings();
}

// PAGE HTML GENERATION (WEEKDAY SINGLE DAY)
function generatePageHTML(date, isSplitHalf = false, lineCount = null) {
  const headerHTML = generateHeaderHTML(date, isSplitHalf);
  
  let finalLineCount = lineCount;
  if (finalLineCount === null) {
    finalLineCount = isSplitHalf ? 7 : 14;
  }

  const linesHTML = generateRuledLinesHTML(date, finalLineCount);
  return headerHTML + linesHTML;
}

// PAGE HTML GENERATION (WEEKEND TWO DAYS VERTICALLY SPLIT)
function generateWeekendSplitPageHTML(satDate, sunDate) {
  const satHTML = `
    <div class="weekend-split-half">
      ${generatePageHTML(satDate, true)}
    </div>
  `;
  const sunHTML = `
    <div class="weekend-split-half">
      ${generatePageHTML(sunDate, true)}
    </div>
  `;
  return `<div class="weekend-split">${satHTML}${sunHTML}</div>`;
}

// MULTI-PAGE SPLIT GRID PAGE HTML GENERATIONS
function generateSplitGridPageHTML(date1, date2) {
  return `
    <div class="split-layout-grid-2">
      <div class="split-half">
        ${generatePageHTML(date1, true, 6)}
      </div>
      <div class="split-half">
        ${generatePageHTML(date2, true, 6)}
      </div>
    </div>
  `;
}

function generateTripleSplitPageHTML(date1, date2, date3) {
  return `
    <div class="split-layout-grid-3">
      <div class="split-third">
        ${generatePageHTML(date1, true, 4)}
      </div>
      <div class="split-third">
        ${generatePageHTML(date2, true, 4)}
      </div>
      <div class="split-third">
        ${generatePageHTML(date3, true, 4)}
      </div>
    </div>
  `;
}

function generateQuadSplitPageHTML(date1, date2, date3, date4) {
  return `
    <div class="split-layout-grid-4">
      <div class="split-fourth">
        ${generatePageHTML(date1, true, 3)}
      </div>
      <div class="split-fourth">
        ${generatePageHTML(date2, true, 3)}
      </div>
      <div class="split-fourth">
        ${generatePageHTML(date3, true, 3)}
      </div>
      <div class="split-fourth">
        ${generatePageHTML(date4, true, 3)}
      </div>
    </div>
  `;
}

// HEADER FORMATTER (MATCHES PHOTO HEADERS WITH LANGUAGES)
function generateHeaderHTML(date, isSplitHalf = false) {
  const dayNum = date.getDate();
  const dayName = DAYS[date.getDay()];
  const monthIndex = date.getMonth();
  const year = date.getFullYear();
  
  const trMonth = MONTHS[monthIndex];
  const enMonth = MONTHS_EN[monthIndex];
  
  return `
    <div class="day-date-heading" style="${isSplitHalf ? 'margin-bottom: 8px;' : ''}">
      <div class="day-num" style="${isSplitHalf ? 'font-size: 2.2rem;' : ''}">${dayNum}</div>
      <div class="day-details">
        <div class="day-name-tr" style="${isSplitHalf ? 'font-size: 0.85rem;' : ''}">${dayName}</div>
        <div class="day-langs" style="${isSplitHalf ? 'font-size: 0.65rem;' : ''}">${trMonth} / ${enMonth} ${year}</div>
      </div>
    </div>
  `;
}

// RULED LINES INPUT BOX GENERATOR
function generateRuledLinesHTML(date, count) {
  const dateStr = formatDateString(date);
  const data = getDayData(dateStr);

  // Time schedules
  const hoursWeekday = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
  ];
  
  const hoursWeekend = [
    '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'
  ];

  const hours = count === 7 ? hoursWeekend : hoursWeekday;

  let html = `<div class="ruled-lines-container" data-date="${dateStr}">`;
  
  hours.forEach(hour => {
    const val = data[hour] || '';
    html += `
      <div class="ruled-line-row">
        <input type="text" class="line-input" data-hour="${hour}" value="${escapeHtml(val)}" placeholder="..." readonly>
      </div>
    `;
  });
  
  html += `</div>`;
  return html;
}

// BIND SAVE LISTENERS
function bindInputListeners() {
  const containers = document.querySelectorAll('.ruled-lines-container');
  containers.forEach(container => {
    const dateStr = container.dataset.date;
    const inputs = container.querySelectorAll('.line-input');
    inputs.forEach(input => {
      // 1. Text input save on change
      input.addEventListener('input', debounce(() => saveInputData(dateStr), 400));

      // 2. Toggle readonly on finger/mouse touch to allow typing
      input.addEventListener('pointerdown', (e) => {
        const isPen = e.pointerType === 'pen' || e.pointerType === 'eraser';
        if (!isPen && !isDrawingMode) {
          input.removeAttribute('readonly');
          input.focus();
        } else {
          e.preventDefault();
        }
      });

      // 3. Re-enable readonly on blur to prevent stylus focus misclicks
      input.addEventListener('blur', () => {
        input.setAttribute('readonly', 'true');
      });
    });
  });
}

// MINI CALENDARS IN FOOTER
function renderMiniCalendars(leftDate) {
  // 1. Current Month mini-calendar on left footer
  const currentMonthDate = new Date(leftDate.getFullYear(), leftDate.getMonth(), 1);
  leftMiniTitle.textContent = `${MONTHS[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`;
  buildMiniCalendarGrid(leftMiniCalendar, currentMonthDate);

  // 2. Next Month mini-calendar on right footer
  const nextMonthDate = new Date(leftDate.getFullYear(), leftDate.getMonth() + 1, 1);
  rightMiniTitle.textContent = `${MONTHS[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}`;
  buildMiniCalendarGrid(rightMiniCalendar, nextMonthDate);
}

function buildMiniCalendarGrid(container, baseDate) {
  container.innerHTML = '';
  
  // Render Day headers
  DAYS_SHORT.forEach(dShort => {
    const hDiv = document.createElement('div');
    hDiv.className = 'mini-day header';
    hDiv.textContent = dShort;
    container.appendChild(hDiv);
  });

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Start offset: Monday is 0, Sunday is 6
  let offset = (firstDay.getDay() + 6) % 7;
  
  // Previous month trailing days
  const prevMonthTotal = new Date(year, month, 0).getDate();
  for (let i = offset - 1; i >= 0; i--) {
    const dayVal = prevMonthTotal - i;
    const div = document.createElement('div');
    div.className = 'mini-day other-month';
    div.textContent = dayVal;
    
    // navigation binding
    const clickDate = new Date(year, month - 1, dayVal);
    div.addEventListener('click', () => jumpToDate(clickDate));
    
    container.appendChild(div);
  }

  // Current month days
  const todayStr = formatDateString(new Date());
  for (let dayVal = 1; dayVal <= totalDays; dayVal++) {
    const div = document.createElement('div');
    div.className = 'mini-day';
    div.textContent = dayVal;
    
    const clickDate = new Date(year, month, dayVal);
    const dateStr = formatDateString(clickDate);
    
    if (dateStr === todayStr) {
      div.classList.add('today');
    }
    
    div.addEventListener('click', () => jumpToDate(clickDate));
    container.appendChild(div);
  }

  // Next month leading days to complete grid cells (always 42 cells)
  const rendered = offset + totalDays;
  const remaining = 42 - rendered;
  for (let dayVal = 1; dayVal <= remaining; dayVal++) {
    const div = document.createElement('div');
    div.className = 'mini-day other-month';
    div.textContent = dayVal;
    
    const clickDate = new Date(year, month + 1, dayVal);
    div.addEventListener('click', () => jumpToDate(clickDate));
    
    container.appendChild(div);
  }
}

function jumpToDate(targetDate) {
  if (isFlipping) return;
  saveCurrentInputs();
  
  // trigger animation
  const isForward = targetDate > currentDate;
  triggerFlipAnimation(isForward, targetDate);
}

// NAVIGATION CONTROLS (SPREAD-BASED)
function changeSpread(offset) {
  if (isFlipping) return;
  saveCurrentInputs();

  const nextDate = new Date(currentDate);
  let daysOffset = offset;
  if (currentLayout === '1') {
    daysOffset = offset > 0 ? 1 : -1;
  } else if (currentLayout === '2') {
    daysOffset = offset;
  } else if (currentLayout === '4') {
    daysOffset = offset > 0 ? 4 : -4;
  } else if (currentLayout === 'weekly') {
    daysOffset = offset > 0 ? 7 : -7;
  }

  nextDate.setDate(currentDate.getDate() + daysOffset);

  const isForward = offset > 0;
  triggerFlipAnimation(isForward, nextDate);
}

function goToToday() {
  if (isFlipping) return;
  saveCurrentInputs();
  
  const today = new Date();
  if (formatDateString(today) === formatDateString(currentDate)) return;
  
  const isForward = today > currentDate;
  triggerFlipAnimation(isForward, today);
}

function goToMonth(monthIndex) {
  if (isFlipping) return;
  saveCurrentInputs();

  const nextDate = new Date(currentDate.getFullYear(), monthIndex, 1);
  const isForward = nextDate > currentDate;
  triggerFlipAnimation(isForward, nextDate);
}

// 3D PAGE FLIP TRIGGER
function triggerFlipAnimation(isForward, nextDate) {
  // Mobile check or multi-page layouts: skip 3D flip animation to prevent visual distortion
  if (currentLayout !== '2' || window.innerWidth <= 900) {
    currentDate = nextDate;
    renderSpread();
    return;
  }

  isFlipping = true;

  // Setup flip containers
  const frontContent = document.getElementById('flip-front-content');
  const frontFooter = document.getElementById('flip-front-footer');
  const backContent = document.getElementById('flip-back-content');
  const backFooter = document.getElementById('flip-back-footer');

  // Format temporary pages inside flipping overlay (canvas elements are stripped to prevent GPU lag)
  if (isForward) {
    // Turning right page to left: Front represents current right-page, Back represents new left-page
    frontContent.innerHTML = rightPageContent.innerHTML.replace(/<canvas[^>]*><\/canvas>/g, '');
    frontFooter.innerHTML = rightPageContent.nextElementSibling.innerHTML; // mini calendar container

    // Temporarily build new left-page details
    const { leftDate } = calculateSpreadDates(nextDate);
    backContent.innerHTML = generatePageHTML(leftDate, false).replace(/<canvas[^>]*><\/canvas>/g, '');
    
    // next month mini calendar HTML
    backFooter.innerHTML = `
      <div class="mini-calendar-container">
        <span class="mini-calendar-title">${MONTHS[leftDate.getMonth()]} ${leftDate.getFullYear()}</span>
        <div class="mini-calendar-grid" id="temp-back-mini"></div>
      </div>
    `;
  } else {
    // Turning left page to right: Back represents current left-page, Front represents new right-page
    backContent.innerHTML = leftPageContent.innerHTML.replace(/<canvas[^>]*><\/canvas>/g, '');
    backFooter.innerHTML = leftPageContent.nextElementSibling.innerHTML;

    // Temporarily build new right-page details
    const { leftDate, rightDate1, rightDate2 } = calculateSpreadDates(nextDate);
    if (rightDate2) {
      frontContent.innerHTML = generateWeekendSplitPageHTML(rightDate1, rightDate2).replace(/<canvas[^>]*><\/canvas>/g, '');
    } else {
      frontContent.innerHTML = generatePageHTML(rightDate1, false).replace(/<canvas[^>]*><\/canvas>/g, '');
    }
    
    const nextMonthDate = new Date(leftDate.getFullYear(), leftDate.getMonth() + 1, 1);
    frontFooter.innerHTML = `
      <div class="mini-calendar-container">
        <span class="mini-calendar-title">${MONTHS[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}</span>
        <div class="mini-calendar-grid" id="temp-front-mini"></div>
      </div>
    `;
  }

  // Show page flip overlay
  pageFlipping.style.display = 'block';
  pageFlipping.className = `page page-flipping ${isForward ? 'flip-forward' : 'flip-backward'}`;

  // Complete page rotation swap (CSS takes 0.65s)
  setTimeout(() => {
    currentDate = nextDate;
    renderSpread();

    // Reset flipper
    pageFlipping.style.display = 'none';
    pageFlipping.className = 'page page-flipping';
    isFlipping = false;
  }, 650);
}

// UTILITIES
function saveCurrentInputs() {
  const containers = document.querySelectorAll('.ruled-lines-container');
  containers.forEach(container => {
    const dateStr = container.dataset.date;
    saveInputData(dateStr);
  });
}

function formatDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// DRAWING / STYLUS HANDLING
let isDrawingMode = false;
let currentTool = 'pen';
let currentInkColor = 'black';
let globalUndoStack = [];

function getSpreadDrawingKeys(date) {
  let leftKey, rightKey;
  
  if (currentLayout === '1') {
    leftKey = formatDateString(date);
    rightKey = 'dummy';
  }
  else if (currentLayout === '2') {
    const { leftDate, rightDate1 } = calculateSpreadDates(date);
    leftKey = formatDateString(leftDate);
    rightKey = formatDateString(rightDate1);
  }
  else if (currentLayout === '4') {
    const d1 = new Date(date);
    const d3 = new Date(date); d3.setDate(d1.getDate() + 2);
    leftKey = formatDateString(d1);
    rightKey = formatDateString(d3);
  }
  else if (currentLayout === 'weekly') {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const mon = new Date(startOfWeek);
    const thu = new Date(startOfWeek); thu.setDate(mon.getDate() + 3);
    
    leftKey = formatDateString(mon);
    rightKey = formatDateString(thu);
  }
  
  return { leftKey, rightKey };
}

function setupCanvasDrawing(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  const pageInner = canvas.closest('.page-inner');

  function start(e) {
    const isPen = e.pointerType === 'pen';
    const isEraser = e.pointerType === 'eraser';
    if (!isDrawingMode && !isPen && !isEraser) return;
    
    isDrawing = true;
    
    // Mark dirty state
    if (canvas.id === 'left-canvas') leftCanvasHasDrawing = true;
    if (canvas.id === 'right-canvas') rightCanvasHasDrawing = true;

    // Save snapshot to globalUndoStack before drawing stroke
    const snapshot = {
      canvasId: canvas.id,
      dataUrl: canvas.toDataURL()
    };
    globalUndoStack.push(snapshot);
    if (globalUndoStack.length > 30) globalUndoStack.shift();

    const rect = canvas.getBoundingClientRect();
    const pos = getEventPos(e, canvas, rect);
    lastX = pos.x;
    lastY = pos.y;
    
    if (canvas.setPointerCapture && e.pointerId !== undefined) {
      canvas.setPointerCapture(e.pointerId);
    }
  }

  function draw(e) {
    if (!isDrawing) return;
    const isPen = e.pointerType === 'pen';
    const isEraser = e.pointerType === 'eraser';
    if (!isDrawingMode && !isPen && !isEraser) return;
    
    e.preventDefault(); // Stop iPad scrolling/scuff gestures while drawing
    const rect = canvas.getBoundingClientRect();
    const pos = getEventPos(e, canvas, rect);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    
    const currentTheme = document.documentElement.getAttribute('data-theme');
    
    // Auto-detect stylus eraser hardware
    const isStylusEraser = isEraser || (isPen && (e.buttons & 32 || e.button === 5));
    const activeTool = isStylusEraser ? 'eraser' : currentTool;

    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 22;
    } else if (activeTool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = 'rgba(254, 226, 167, 0.45)'; // Semi-transparent yellow
      ctx.lineWidth = 14;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentInkColor === 'black' 
        ? (currentTheme === 'light' ? '#222' : '#3d3122')
        : (currentInkColor === 'blue' ? '#0984e3' : '#d63031');
      ctx.lineWidth = currentLineWidth;
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;
  }

  function stop(e) {
    if (isDrawing) {
      isDrawing = false;
      if (canvas.releasePointerCapture && e && e.pointerId !== undefined) {
        canvas.releasePointerCapture(e.pointerId);
      }
      saveDrawings();
    }
  }

  // Pointerdown listens on pageInner to detect Apple Pencil vs Touch
  pageInner.addEventListener('pointerdown', (e) => {
    const isPen = e.pointerType === 'pen';
    const isEraser = e.pointerType === 'eraser';
    if (isPen || isEraser || isDrawingMode) {
      // Find where pointerdown occurred relative to canvas bounds
      const rect = canvas.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        start(e);
      }
    }
  }, { passive: false });

  // Move/Up events capture strokes smoothly
  canvas.addEventListener('pointermove', draw, { passive: false });
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

function getEventPos(e, canvas, rect) {
  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function resizeCanvases() {
  const leftCanvas = document.getElementById('left-canvas');
  const rightCanvas = document.getElementById('right-canvas');
  
  [leftCanvas, rightCanvas].forEach(canvas => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    const dpr = window.devicePixelRatio || 1;
    const newWidth = rect.width * dpr;
    const newHeight = rect.height * dpr;
    
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

      canvas.width = newWidth;
      canvas.height = newHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, canvas.width, canvas.height);
    }
  });
}

function saveDrawings() {
  const { leftKey, rightKey } = getSpreadDrawingKeys(currentDate);

  const leftCanvas = document.getElementById('left-canvas');
  const rightCanvas = document.getElementById('right-canvas');

  if (!diaryData[leftKey]) diaryData[leftKey] = {};
  if (leftCanvasHasDrawing && leftCanvas) {
    diaryData[leftKey].drawing = leftCanvas.toDataURL();
  } else {
    delete diaryData[leftKey].drawing;
  }

  if (currentLayout !== '1') {
    if (!diaryData[rightKey]) diaryData[rightKey] = {};
    if (rightCanvasHasDrawing && rightCanvas) {
      diaryData[rightKey].drawing = rightCanvas.toDataURL();
    } else {
      delete diaryData[rightKey].drawing;
    }
  }

  localStorage.setItem('classic-notebook-db', JSON.stringify(diaryData));
}

function loadDrawings() {
  const { leftKey, rightKey } = getSpreadDrawingKeys(currentDate);

  const leftCanvas = document.getElementById('left-canvas');
  const rightCanvas = document.getElementById('right-canvas');
  if (!leftCanvas || !rightCanvas) return;

  const leftCtx = leftCanvas.getContext('2d');
  const rightCtx = rightCanvas.getContext('2d');

  const lRect = leftCanvas.getBoundingClientRect();
  const rRect = rightCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  leftCanvas.width = lRect.width * dpr;
  leftCanvas.height = lRect.height * dpr;
  
  if (currentLayout !== '1') {
    rightCanvas.width = rRect.width * dpr;
    rightCanvas.height = rRect.height * dpr;
  }

  leftCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
  if (currentLayout !== '1') {
    rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
  }

  // Populate dirty states from storage load
  leftCanvasHasDrawing = !!(diaryData[leftKey] && diaryData[leftKey].drawing);
  rightCanvasHasDrawing = !!(diaryData[rightKey] && diaryData[rightKey].drawing);

  if (leftCanvasHasDrawing) {
    const img = new Image();
    img.onload = () => {
      leftCtx.drawImage(img, 0, 0, leftCanvas.width, leftCanvas.height);
    };
    img.src = diaryData[leftKey].drawing;
  }

  if (currentLayout !== '1' && rightCanvasHasDrawing) {
    const img = new Image();
    img.onload = () => {
      rightCtx.drawImage(img, 0, 0, rightCanvas.width, rightCanvas.height);
    };
    img.src = diaryData[rightKey].drawing;
  }
}

function clearPageDrawings() {
  const leftCanvas = document.getElementById('left-canvas');
  const rightCanvas = document.getElementById('right-canvas');
  if (leftCanvas) leftCanvas.getContext('2d').clearRect(0, 0, leftCanvas.width, leftCanvas.height);
  if (rightCanvas) rightCanvas.getContext('2d').clearRect(0, 0, rightCanvas.width, rightCanvas.height);
  
  leftCanvasHasDrawing = false;
  rightCanvasHasDrawing = false;
  saveDrawings();
}

// SWIPE/DRAG PAGE TURN GESTURES
let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
let isSwiping = false;

function setupSwipeGestures() {
  const notebookEl = document.getElementById('notebook');
  if (!notebookEl) return;

  // Track pointerdown on notebook to identify start coordinates
  notebookEl.addEventListener('pointerdown', (e) => {
    // Disable swipe if stylus/pencil is drawing, or finger drawing is active,
    // or if the user clicked interactive elements (inputs, select boxes, calendars, buttons)
    const isPen = e.pointerType === 'pen';
    const isInteractive = ['INPUT', 'SELECT', 'OPTION', 'BUTTON', 'A', 'CANVAS'].includes(e.target.tagName) || 
                          e.target.closest('.circle-btn') || 
                          e.target.closest('.tab-btn') || 
                          e.target.closest('.mini-calendar-grid') || 
                          e.target.closest('.drawing-tools-container');

    if (isDrawingMode || isPen || isInteractive) return;

    isSwiping = true;
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swipeStartTime = Date.now();
  });

  // Handle pointerup to measure delta distance and duration
  notebookEl.addEventListener('pointerup', (e) => {
    if (!isSwiping) return;
    isSwiping = false;

    const diffX = e.clientX - swipeStartX;
    const diffY = e.clientY - swipeStartY;
    const duration = Date.now() - swipeStartTime;

    // Swipe is valid if horizontal distance > 80px, vertical drift < 80px, and duration < 500ms
    if (Math.abs(diffX) > 80 && Math.abs(diffY) < 80 && duration < 500) {
      if (diffX < 0) {
        // Swipe left -> Turn to next spread
        changeSpread(2);
      } else {
        // Swipe right -> Turn to previous spread
        changeSpread(-2);
      }
    }
  });

  notebookEl.addEventListener('pointercancel', () => {
    isSwiping = false;
  });
}

// BOOTSTRAP
document.addEventListener('DOMContentLoaded', init);
