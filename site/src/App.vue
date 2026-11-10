<!-- The whole landing page. The 9k design system draws the chrome (navigation, buttons, glow, Nino, FAQ,
     footer); the editor demo, the style tiles and the page timeline are this page's own. -->
<script setup>
import { onMounted, ref, useTemplateRef } from 'vue'
import { I9kBrandWordmark, I9kButton, I9kCluster, I9kFaqList, I9kFooter, I9kGithubEmbed, I9kGlow, I9kNavigation, I9kNino } from '@9klabs/design'

const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const links = [
  { id: 'styles', label: 'Styles', href: '#styles' },
  { id: 'files', label: 'Files', href: '#files' },
  { id: 'effects', label: 'Effects', href: '#effects' },
  { id: 'cli', label: 'CLI', href: '#cli' },
  { id: 'install', label: 'Install', href: '#install' },
]
const MODES = ['dark', 'light', 'green']
const STYLES = [['flat', '9k Flat'], ['chalk', 'Chalkboard'], ['blue', 'Blueprint'], ['pixel', 'Pixel Art'], ['sticker', 'Sticker'], ['term', 'Terminal'], ['edit', 'Editorial'], ['comic', 'Comic']]
const STEPS = [
  ['Install ffmpeg, and whisper.cpp for transcripts.', 'brew install ffmpeg whisper-cpp'],
  ['Get the source.', 'git clone https://github.com/ismail9k/vibe-editing.git && cd vibe-editing'],
  ['Install it and put vibe on your path.', 'npm install && npm link'],
  ['Open the demo film.', 'vibe open demo'],
]
const FAQ = [
  { question: 'Does it work without Claude Code?', answer: 'The editor works on its own: you can cut, place graphics and export by hand. The Claude panel needs Claude Code installed and signed in, because it runs your own copy.' },
  { question: 'Is my footage uploaded anywhere?', answer: 'The app does not upload it. Decoding, cutouts, transcripts and export all run on your Mac. Claude Code reads the text files it edits, such as vibe.json and the transcript.' },
  { question: 'Can I make my own styles and components?', answer: 'Yes. They are plain JavaScript files in your workspace. Duplicate one in the Studio, or ask Claude to write a new one, and it shows up as soon as the file is saved.' },
  { question: 'Does it run on Windows or Linux?', answer: 'It is made for macOS. Cutout effects use Apple Vision, so they only work there.' },
]
const SOCIAL = [{ name: 'GitHub', url: 'https://github.com/ismail9k/vibe-editing', icon: 'github' }]

const mode = ref('dark')
const copied = ref(-1)
async function copy(text, i) {
  try { await navigator.clipboard.writeText(text); copied.value = i; setTimeout(() => (copied.value = -1), 1600) } catch { /* the command is on the page to select */ }
}

// Nino watches the demo: he thinks while Claude works, and talks when it answers.
const nino = useTemplateRef('nino')
const mood = ref('idle')
const talking = ref(false)
function speak() { mood.value = 'happy'; talking.value = true; setTimeout(() => (talking.value = false), 1100) }

onMounted(() => {
  const $ = (id) => document.getElementById(id)

  // Waits, but holds while the demo is off screen or the tab is hidden, so it never plays to nobody.
  let watching = true
  new IntersectionObserver(([e]) => { watching = e.isIntersecting }).observe($('demo'))
  const sleep = (ms) => new Promise((done) => {
    const tick = () => (watching && !document.hidden ? done() : setTimeout(tick, 300))
    setTimeout(tick, ms)
  })
  async function type(el, text, cps = 30) {
    for (const ch of text) { el.textContent += ch; await sleep(1000 / cps) }
  }

  /* The headline is typed, as every 9k film types its key line. The letters are already laid out, so nothing moves. */
  {
    const h1 = $('h1'), text = h1.textContent
    h1.textContent = ''
    const caret = Object.assign(document.createElement('span'), { className: 'caret' })
    const chars = []
    for (const word of text.split(' ')) {
      const w = document.createElement('span')
      w.style.whiteSpace = 'nowrap'
      for (const c of word) { const s = Object.assign(document.createElement('span'), { className: 'ch', textContent: c }); w.append(s); chars.push(s) }
      h1.append(w, ' ')
    }
    h1.prepend(caret)
    if (!still) (async () => {
      await new Promise((r) => setTimeout(r, 350))
      for (const s of chars) { s.classList.add('on'); s.after(caret); await new Promise((r) => setTimeout(r, 34)) }
      h1.classList.add('done')
    })()
  }

  /* The editor playing itself: each message to Claude changes the film. */
  const log = $('log'), input = $('input'), screen = $('screen'), status = $('status')
  const say = (kind, text) => { if (kind === 'claude') speak(); const m = Object.assign(document.createElement('div'), { className: 'msg ' + kind, textContent: text }); log.append(m); while (log.children.length > 7) log.firstChild.remove() }
  const clip = (track, kind, left, width, name) => {
    const c = Object.assign(document.createElement('span'), { className: `clip ${kind} new`, textContent: name })
    c.style.cssText = `left:${left}%;width:${width}%`
    $(track).append(c)
  }
  async function ask(text, tool) {
    mood.value = 'thinking'
    input.classList.add('typing')
    await type(input, text, 34)
    await sleep(380)
    input.classList.remove('typing'); input.textContent = ''
    say('you', text)
    await sleep(650)
    say('tool', tool)
    await sleep(500)
  }
  const checks = [...$('checks').children]
  function reset() {
    log.textContent = ''; $('hook').textContent = ''; $('hookCaret').hidden = true
    checks.forEach((li) => (li.className = ''))
    $('tGraphics').textContent = ''; $('tSound').textContent = ''
    screen.dataset.style = 'flat9k'; status.textContent = 'demo.vibe'; status.className = 'status'
  }
  async function demo() {
    for (;;) {
      reset(); screen.classList.remove('wipe'); mood.value = 'idle'
      await sleep(900)
      nino.value?.play('wave')

      await ask('Open on the hook, typed out', 'Edit vibe.json')
      clip('tGraphics', 'g', 0, 29, 'hook'); clip('tSound', 'a', 0, 7, 'whoosh')
      $('hookCaret').hidden = false
      await type($('hook'), 'Three cuts that keep people watching', 22)
      say('claude', 'Added the hook at 0:00, with a whoosh under it.')
      await sleep(1500)

      await ask('List the three steps at 0:04', 'Edit vibe.json')
      clip('tGraphics', 'g', 33, 42, 'checklist'); clip('tSound', 'a', 33, 5, 'tick')
      $('hookCaret').hidden = true
      for (const li of checks) { li.classList.add('in'); await sleep(420) }
      for (const li of checks) { li.classList.add('done'); await sleep(520) }
      say('claude', 'A checklist runs from 0:04 to 0:09.')
      await sleep(1500)

      await ask('Try it in chalkboard', 'Edit vibe.json')
      screen.dataset.style = 'chalkboard'
      say('claude', 'The film now uses the chalkboard style.')
      await sleep(2400)

      await ask('Good. Export it', 'vibe render demo')
      for (let p = 0; p <= 100; p += 4) { status.textContent = `Exporting ${p}%`; await sleep(70) }
      status.textContent = 'Exported demo.mp4'; status.className = 'status ok'
      say('claude', 'Exported to out/demo.mp4.')
      nino.value?.play('jump')
      await sleep(3600)
      screen.classList.add('wipe')
      await sleep(600)
    }
  }
  if (still) {
    // No motion: show the finished film instead.
    $('hook').textContent = 'Three cuts that keep people watching'
    checks.forEach((li) => (li.className = 'in done'))
    clip('tGraphics', 'g', 0, 29, 'hook'); clip('tGraphics', 'g', 33, 42, 'checklist')
    say('you', 'List the three steps at 0:04'); say('tool', 'Edit vibe.json'); say('claude', 'A checklist runs from 0:04 to 0:09.')
  } else demo()

  /* vibe.json: when it scrolls into view, Claude adds a line and changes the style, and the app notices. */
  {
    const line = '    { "component": "checklist", "at": 4, "dur": 5 }'
    const paint = (s) => s.replace(/"(\w+)":/g, '<span class="k">"$1"</span>:').replace(/: "(\w+)"/g, ': <span class="s">"$1"</span>').replace(/: ([\d.]+)/g, ': <span class="n">$1</span>')
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const blip = async (row) => { row.classList.add('hot'); $('saved').classList.add('on'); $('saved').lastChild.textContent = 'Saved. The app reloaded it'; await wait(700); row.classList.remove('hot'); $('saved').classList.remove('on') }
    const run = async () => {
      if (still) { $('jNew').innerHTML = paint(line); return }
      await wait(500)
      for (let i = 1; i <= line.length; i++) { $('jNew').innerHTML = paint(line.slice(0, i)); await wait(22) }
      await blip($('jNew'))
      await wait(900)
      const v = $('jStyleV')
      while (v.textContent) { v.textContent = v.textContent.slice(0, -1); await wait(45) }
      for (const c of 'chalkboard') { v.textContent += c; await wait(60) }
      await blip($('jStyle'))
    }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); run() } }, { threshold: .6 })
    io.observe($('json'))
  }

  /* The page as a timeline. A point p (0..1) of the document sits under the playhead: the top of the
     page at the top of the scroll, the bottom at the end, so every section passes under it. */
  {
    const rail = $('rail'), head = $('head'), tc = $('tc'), LENGTH = 48, FPS = 30
    const secs = [...document.querySelectorAll('[data-clip]')]
    const clips = secs.map((s) => { const a = Object.assign(document.createElement('a'), { href: '#' + s.id, textContent: s.dataset.clip }); a.draggable = false; rail.append(a); return a })
    let docH = 1, max = 1
    const two = (n) => String(Math.floor(n)).padStart(2, '0')
    const place = () => {
      const p = max > 0 ? (scrollY + innerHeight * (scrollY / max)) / docH : 0
      head.style.transform = `translateX(${p * rail.clientWidth}px)`
      const t = Math.min(p, .9999) * LENGTH
      tc.textContent = `${two(t / 60)}:${two(t % 60)}:${two((t % 1) * FPS)}`
      secs.forEach((s, i) => clips[i].classList.toggle('on', p * docH >= s.offsetTop && p * docH < s.offsetTop + s.offsetHeight))
    }
    const layout = () => {
      docH = document.documentElement.scrollHeight; max = docH - innerHeight
      secs.forEach((s, i) => { clips[i].style.left = (s.offsetTop / docH) * 100 + '%'; clips[i].style.width = `calc(${(s.offsetHeight / docH) * 100}% - 2px)` })
      place()
    }
    const seek = (x) => {
      const r = rail.getBoundingClientRect(), p = Math.min(1, Math.max(0, (x - r.left) / r.width))
      scrollTo(0, (p * docH) / (1 + innerHeight / max))
    }
    let dragging = false, moved = false
    rail.addEventListener('pointerdown', (e) => { dragging = true; moved = false; rail.setPointerCapture(e.pointerId) })
    rail.addEventListener('pointermove', (e) => { if (dragging && (moved || Math.abs(e.movementX) > 0)) { moved = true; seek(e.clientX) } })
    rail.addEventListener('pointerup', (e) => { dragging = false; seek(e.clientX) })
    rail.addEventListener('click', (e) => e.preventDefault()) // the pointer already took us there
    addEventListener('scroll', place, { passive: true })
    addEventListener('resize', layout)
    new ResizeObserver(layout).observe(document.body)
    document.fonts?.ready.then(layout)
    layout()
  }
})
</script>

<template>
<I9kGlow position="top-end" />
<I9kNavigation :links="links" brand-href="#top" brand-label="Vibe Editing">
  <template #brand="{ compact }"><I9kBrandWordmark :compact="compact" full="Vibe Editing" short="vibe" /></template>
  <template #actions><I9kButton size="sm" href="https://github.com/ismail9k/vibe-editing">GitHub</I9kButton></template>
</I9kNavigation>

<section class="hero" id="top" data-clip="intro">
  <div class="wrap">
    <div class="hero-copy">
      <h1 id="h1" v-once aria-label="The video editor Claude Code drives.">The video editor Claude Code drives.</h1>
      <p class="lede">Say what you want changed. Claude edits your film's files, and the app shows every change live while you watch, nudge and approve.</p>
      <I9kCluster class="cta">
        <I9kButton variant="primary" size="lg" href="#install">Run it on your Mac</I9kButton>
        <I9kButton size="lg" href="https://github.com/ismail9k/vibe-editing">Read the source</I9kButton>
      </I9kCluster>
    </div>

    <div class="demo-wrap">
    <I9kNino ref="nino" class="nino" size="lg" shadow :expression="mood" :talking="talking" :animated="!still" />
    <div class="win" id="demo" v-once role="img" aria-label="The app at work: a message to Claude adds a typed title, a checklist, a new style, and exports the film.">
      <div class="win-bar">
        <div class="lights"><i></i><i></i><i></i></div>
        <span class="mark">vibe<b>_</b></span>
        <div class="rooms"><span>Studio</span><span class="on">Edit</span></div>
        <span class="status" id="status">demo.vibe</span>
      </div>
      <div class="win-body">
        <div class="stage">
          <div class="screen" id="screen" data-style="flat9k">
            <div class="scene">
              <p class="hook"><span id="hook"></span><i class="caret" id="hookCaret" hidden></i></p>
              <ul class="checks" id="checks">
                <li>Cut the pauses</li>
                <li>Caption every word</li>
                <li>Punch in on the point</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="chat">
          <div class="chat-head">Claude</div>
          <div class="chat-log" id="log"></div>
          <div class="chat-in" id="input"></div>
        </div>
      </div>
      <div class="tl">
        <div class="track" data-name="footage">
          <span class="clip f" style="left:0;width:37.6%">take-1</span>
          <span class="clip f" style="left:38%;width:32.6%">take-1</span>
          <span class="clip f" style="left:71%;width:29%">take-2</span>
        </div>
        <div class="track" data-name="graphics" id="tGraphics"></div>
        <div class="track" data-name="captions">
          <span class="clip c" style="left:1%;width:13%"></span><span class="clip c" style="left:15%;width:18%"></span>
          <span class="clip c" style="left:39%;width:11%"></span><span class="clip c" style="left:51%;width:17%"></span>
          <span class="clip c" style="left:72%;width:14%"></span><span class="clip c" style="left:87%;width:11%"></span>
        </div>
        <div class="track" data-name="sound" id="tSound"></div>
        <div class="tl-area"><div class="tl-head"></div></div>
      </div>
    </div>
    </div>
  </div>
</section>

<section id="styles" data-clip="styles">
  <div class="wrap">
    <div class="split">
      <div>
        <h2>One component, eighteen styles.</h2>
        <p class="lede">A style redraws every component its own way. Colours stay with your brand, so changing the mode recolours all of them at once.</p>
      </div>
      <div class="modes" role="group" aria-label="Brand mode">
        <I9kButton v-for="m in MODES" :key="m" variant="filter" :active="mode === m" :aria-pressed="mode === m" @click="mode = m">{{ m[0].toUpperCase() + m.slice(1) }}</I9kButton>
      </div>
    </div>
    <div class="tiles" :data-mode="mode">
      <figure v-for="[id, name] in STYLES" :key="id" class="tile" :class="'s-' + id">
        <div class="art"><b>Watch time</b><small>chart-grow</small>
          <div class="bars"><i v-for="(h, i) in [34, 52, 68, 92]" :key="i" :style="{ '--h': h + '%', '--i': i }"></i></div>
        </div>
        <figcaption>{{ name }}</figcaption>
      </figure>
    </div>
    <p class="note" style="margin-top:22px">Eight of the eighteen styles that ship, each drawing the same growing chart. Duplicate one to make your own, or ask Claude to write a new one.</p>
  </div>
</section>

<section id="files" data-clip="files">
  <div class="wrap files">
    <div>
      <h2>Your film is a folder of plain files.</h2>
      <p class="lede">Claude edits them on disk. The app watches the folder and redraws within a second. If a file breaks, the app keeps showing the last good version and tells you what's wrong.</p>
      <ul class="tree">
        <li><b>~/Vibe/library/brand.json</b><span>colours, modes and fonts</span></li>
        <li><b>library/styles/</b><span>18 styles</span></li>
        <li><b>library/components/</b><span>41 components</span></li>
        <li><b>library/sounds/</b><span>9 sound effects, made in code</span></li>
        <li><b>projects/demo.vibe/vibe.json</b><span>the film</span></li>
      </ul>
    </div>
    <div>
      <pre v-once class="pane" id="json" aria-label="vibe.json, with a line being added"><span class="row"><span class="d">// projects/demo.vibe/vibe.json</span></span><span class="row">{</span><span class="row">  <span class="k">"format"</span>: <span class="s">"9:16"</span>,</span><span class="row" id="jStyle">  <span class="k">"style"</span>: <span class="s">"<span id="jStyleV">flat9k</span>"</span>,</span><span class="row">  <span class="k">"mode"</span>: <span class="s">"dark"</span>,</span><span class="row">  <span class="k">"graphics"</span>: [</span><span class="row">    { <span class="k">"component"</span>: <span class="s">"hook"</span>, <span class="k">"at"</span>: <span class="n">0</span>, <span class="k">"dur"</span>: <span class="n">3.5</span> },</span><span class="row" id="jNew"></span><span class="row">  ]</span><span class="row">}</span></pre>
      <div class="saved" id="saved" v-once><i></i><span>The app is watching this file</span></div>
    </div>
  </div>
</section>

<section id="effects" data-clip="effects">
  <div class="wrap">
    <h2>The effects short-form editors reach for.</h2>
    <p class="fx-text">
      <span class="fx fx-punch" tabindex="0">Punch-in zooms</span>,
      <span class="fx fx-through" tabindex="0">zoom-through cuts</span>,
      <span class="fx fx-check" tabindex="0">checklists</span> and
      <span class="fx fx-chart" tabindex="0">growing charts</span>.
      Then the ones that cut you out of the shot: a
      <span class="fx fx-paper" tabindex="0">paper cut-out</span>,
      <span class="fx fx-doodle" tabindex="0">doodles</span>,
      <span class="fx fx-break" tabindex="0">breaking out of the frame</span>,
      <span class="fx fx-orbit" tabindex="0">words orbiting you</span>, a
      <span class="fx fx-dolly" tabindex="0">dolly zoom</span> and
      <span class="fx fx-glass" tabindex="0">frosted-glass type</span>.
    </p>
    <p class="note">Point at one. Cutouts are made on your Mac with Apple Vision; nothing is uploaded.</p>
  </div>
</section>

<section id="cli" data-clip="cli">
  <div class="wrap">
    <h2>Claude checks its own work.</h2>
    <p class="lede">One renderer draws the preview, the snapshots and the export, so the frame Claude looks at is the frame you get.</p>
    <div class="cli">
      <div><code>vibe check demo</code><span>Check the film against the library</span></div>
      <div><code>vibe snapshot demo --at 1,4.5,8</code><span>Save stills at those seconds</span></div>
      <div><code>vibe transcribe demo</code><span>Put what you say on the timeline, word by word</span></div>
      <div><code>vibe matte demo</code><span>Cut you out of every clip</span></div>
      <div><code>vibe component snap hook</code><span>Draw one component alone at six moments</span></div>
      <div><code>vibe render demo</code><span>Export the MP4, levelled to -14 LUFS</span></div>
    </div>
  </div>
</section>

<section id="install" data-clip="install">
  <div class="wrap">
    <h2>Run it on your Mac.</h2>
    <ol class="steps">
      <li v-for="(step, i) in STEPS" :key="i"><div>
        <p>{{ step[0] }}</p>
        <div class="cmd"><code>{{ step[1] }}</code><I9kButton size="sm" @click="copy(step[1], i)">{{ copied === i ? 'Copied' : 'Copy' }}</I9kButton></div>
      </div></li>
    </ol>
    <p class="note needs">You need Node 22 or newer, and Claude Code installed and signed in: the panel runs your own copy. Cutouts need macOS and the Xcode command line tools.</p>
    <div class="repo"><I9kGithubEmbed repo="ismail9k/vibe-editing" /></div>
    <div class="faq">
      <h3>Before you install</h3>
      <I9kFaqList :items="FAQ" />
    </div>
  </div>
  <I9kFooter tagline="Vibe Editing is made by ismail9k." :social-links="SOCIAL" social-labels />
</section>

<div class="scrub" id="scrub">
  <div class="tc"><span id="tc" v-once>00:00:00</span><small>drag to scrub</small></div>
  <div class="rail" id="rail" v-once><div class="ruler"></div><div class="head" id="head"></div></div>
</div>
</template>
