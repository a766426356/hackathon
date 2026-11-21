// intro.js — 开场标题屏 + 3D 翻转转场。
//
// 这一层只有 DOM 和动画，不碰 state / rules / battle 里的任何东西：
// main.js 在 boot() 里等 showTitleScreen() resolve，之后才去弹欢迎卡。
// 所以不管开场怎么改，游戏逻辑都不会被牵连。
//
// 时序（一次 START 点击，约 1.05s）：
//   0ms      标题卡从正面开始翻
//   0→48%    绕 X 轴上仰到 94°：视线从正面变成「从上往下俯视」这张卡；
//            同时绕 Z 顺时针拧 26°，像被一只手斜着掀过去
//   48%      卡正好边朝屏幕。backface-visibility:hidden 让它彻底消失，
//            底下的背景层在这一拍淡完、光闸在这一拍最亮 —— 翻过去就是校园
//   48→100%  继续翻到 180°，Z 轴逆时针拧回 0：这就是那下反向的转
//   之后     整层淡出并移出 DOM
// prefers-reduced-motion 打开时跳过整段翻转，只留一次 320ms 淡出。

const FLIP_MS = 980;
const OUT_MS = 320;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function prefersReduced() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// 返回 Promise，resolve 时标题屏已经从 DOM 里移除，可以安全地往上叠弹窗。
export function showTitleScreen() {
  const root = document.createElement('div');
  root.id = 'title-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '张江学园 · 开场');
  root.innerHTML = `
    <div class="ts-bg"></div>
    <div class="ts-grid"></div>
    <div class="ts-stage">
      <div class="ts-flipper">
        <div class="ts-front">
          <div class="ts-kicker">A Seven-Day Campus Story</div>
          <h1 class="ts-title">
            <span class="ts-en">THE HKU</span>
            <span class="ts-en2">ZHANGJIANG CAMP</span>
          </h1>
          <div class="ts-seal"><i></i><span>张江学园 · 七天</span><i></i></div>
          <button class="ts-start" type="button">START</button>
          <div class="ts-hint">ENTER / 空格</div>
        </div>
      </div>
    </div>
    <div class="ts-gate"></div>`;
  document.body.appendChild(root);

  return new Promise((resolve) => {
    const btn = root.querySelector('.ts-start');
    const reduce = prefersReduced();
    let fired = false;

    function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        fire();
      }
    }

    async function fire() {
      if (fired) return;
      fired = true;
      document.removeEventListener('keydown', onKey);
      if (document.activeElement === btn) btn.blur();

      root.classList.add('ts-go');
      // 卡翻过 90° 之后就已经看不见了，这时候才开始撤整层，不会看到「半张卡」
      if (!reduce) await wait(Math.round(FLIP_MS * 0.68));
      root.classList.add('ts-leaving');
      await wait(OUT_MS);

      root.remove();
      resolve('start');
    }

    btn.addEventListener('click', fire);
    document.addEventListener('keydown', onKey);
  });
}
