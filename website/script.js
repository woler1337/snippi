'use strict';

// ── Nav scroll effect ──────────────────────────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ── Mobile menu ───────────────────────────────────────────────────────────
function toggleMobile() {
  document.getElementById('navMobile').classList.toggle('open');
}

// ── FAQ accordion ─────────────────────────────────────────────────────────
function toggleFaq(btn) {
  const item = btn.closest('.faq__item');
  const isOpen = item.classList.contains('open');
  // Закрываем все
  document.querySelectorAll('.faq__item.open').forEach(el => el.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

// ── Typing demo animation ─────────────────────────────────────────────────
const DEMOS = [
  { trigger: 'sig',   result: 'Best regards, James Miller' },
  { trigger: 'ty',    result: 'Thanks for reaching out! 🙏' },
  { trigger: 'addr',  result: '221B Baker Street, London, NW1 6XE' },
  { trigger: 'meet',  result: "Let's hop on a Zoom call at 2:00 PM" },
  { trigger: 'phone', result: '+1 (415) 555-0142' },
];

let demoIdx = 0;
const typingEl  = document.getElementById('typingText');
const resultEl  = document.getElementById('typingResult');

function runTypingDemo() {
  const { trigger, result } = DEMOS[demoIdx];
  demoIdx = (demoIdx + 1) % DEMOS.length;

  resultEl.textContent = '';
  resultEl.style.opacity = '0';

  let i = 0;
  typingEl.innerHTML = '<span class="cursor">|</span>';

  // Печатаем триггер по буквам
  function typeChar() {
    if (i < trigger.length) {
      typingEl.innerHTML = trigger.slice(0, i + 1) + '<span class="cursor">|</span>';
      i++;
      setTimeout(typeChar, 120 + Math.random() * 60);
    } else {
      // Пауза, потом "нажимаем" клавишу
      setTimeout(() => {
        typingEl.innerHTML = '<span style="color:var(--text3);font-size:.75rem">⇥ Tab...</span>';
        setTimeout(showResult, 400);
      }, 500);
    }
  }

  function showResult() {
    typingEl.innerHTML = '<span class="cursor">|</span>';
    resultEl.style.opacity = '1';
    resultEl.textContent = '';
    let j = 0;
    function typeResult() {
      if (j < result.length) {
        resultEl.textContent = result.slice(0, j + 1);
        j++;
        setTimeout(typeResult, 18);
      } else {
        // Ждём и запускаем следующее демо
        setTimeout(runTypingDemo, 2800);
      }
    }
    typeResult();
  }

  typeChar();
}

// Стартуем демо с задержкой (дать странице загрузиться)
setTimeout(runTypingDemo, 1200);

// ── Scroll reveal анимация ────────────────────────────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feat-card, .testi-card, .step, .price-card, .faq__item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity .5s ease, transform .5s ease';
  revealObserver.observe(el);
});

document.addEventListener('animationend', () => {}, { once: true });

// Добавляем класс revealed через CSS (чтобы не конфликтовать с hover)
const style = document.createElement('style');
style.textContent = '.revealed { opacity: 1 !important; transform: none !important; }';
document.head.appendChild(style);

// ── Modals ────────────────────────────────────────────────────────────────
function openPayModal() {
  document.getElementById('payModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function openFreeModal() {
  document.getElementById('freeModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function openTeamModal() {
  document.getElementById('teamModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
  // Сброс шагов платёжного модала
  if (id === 'payModal') resetPayModal();
}
function closeModalCheck(event, id) {
  if (event.target === document.getElementById(id)) closeModal(id);
}

// Закрытие по Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(el => {
      el.classList.remove('open');
      document.body.style.overflow = '';
    });
    resetPayModal();
  }
});

// ── Payment flow ──────────────────────────────────────────────────────────
function submitPay(e) {
  e.preventDefault();

  const email = document.getElementById('payEmail').value;
  const cardNum = document.getElementById('cardNum').value.replace(/\s/g, '');

  // Простая валидация карты
  if (cardNum.length < 16) {
    shakeInput(document.getElementById('cardNum'));
    return;
  }

  // Шаг 2 — processing
  document.getElementById('payStep1').style.display = 'none';
  document.getElementById('payStep2').style.display = 'block';

  // Имитируем обработку платежа 2.5 секунды
  setTimeout(() => {
    document.getElementById('payStep2').style.display = 'none';
    document.getElementById('payStep3').style.display = 'block';
    document.getElementById('confirmedEmail').textContent = email;
  }, 2500);
}

function submitTeam(e) {
  e.preventDefault();
  closeModal('teamModal');
  showToast('✅ Team license confirmed! Check your email.');
}

function resetPayModal() {
  setTimeout(() => {
    document.getElementById('payStep1').style.display = 'block';
    document.getElementById('payStep2').style.display = 'none';
    document.getElementById('payStep3').style.display = 'none';
  }, 300);
}

// ── Input formatters ──────────────────────────────────────────────────────
function formatCard(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 16);
  input.value = val.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 4);
  if (val.length >= 3) val = val.slice(0, 2) + '/' + val.slice(2);
  input.value = val;
}

function shakeInput(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake .4s ease';
  el.style.borderColor = 'var(--red)';
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 800);
}

// Добавляем shake-анимацию
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}
  60%{transform:translateX(-4px)}
  80%{transform:translateX(4px)}
}`;
document.head.appendChild(shakeStyle);

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg = '⬇ Download started...') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Simulate download ─────────────────────────────────────────────────────
function simulateDownload(e, filename) {
  e.preventDefault();
  showToast(`⬇ Downloading ${filename}...`);

  // In a real project this would be the actual file URL:
  // window.location.href = `/download/${filename}?token=...`;
  setTimeout(() => {
    showToast('✅ File saved to Downloads folder');
  }, 2000);
}

// ── Floating particles (декоративные точки в hero) ────────────────────────
function createParticles() {
  const hero = document.querySelector('.hero__bg');
  if (!hero) return;
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position: absolute;
      width: ${1 + Math.random() * 2}px;
      height: ${1 + Math.random() * 2}px;
      background: rgba(${Math.random() > .5 ? '124,92,191' : '59,130,246'},.6);
      border-radius: 50%;
      top: ${Math.random() * 100}%;
      left: ${Math.random() * 100}%;
      animation: particleFloat ${8 + Math.random() * 12}s ease-in-out ${Math.random() * 5}s infinite;
      pointer-events: none;
    `;
    hero.appendChild(p);
  }
}

const particleStyle = document.createElement('style');
particleStyle.textContent = `
@keyframes particleFloat {
  0%,100%{transform:translateY(0) translateX(0); opacity:.6}
  33%{transform:translateY(-${20 + Math.random()*30}px) translateX(${10}px); opacity:1}
  66%{transform:translateY(${10}px) translateX(-${15}px); opacity:.4}
}`;
document.head.appendChild(particleStyle);
createParticles();

// ── Smooth anchor scroll ──────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
