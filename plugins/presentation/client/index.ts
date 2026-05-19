import type { ClientPluginAPI } from '../../../types/client';


// Split markdown content into slides on --- (horizontal rules)
function splitSlides(content: string): string[] {
  return content
    .split(/\n---+\n/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Minimal inline markdown renderer (returns HTML string)
function renderInline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;font-family:monospace">$1</code>');
}

// Render a slide's markdown content as HTML
function renderSlideContent(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);

    if (h1) {
      out.push(`<h1 style="font-size:2.4em;margin:0 0 0.3em;font-weight:700;letter-spacing:-0.02em">${renderInline(h1[1])}</h1>`);
    } else if (h2) {
      out.push(`<h2 style="font-size:1.7em;margin:0 0 0.3em;font-weight:600;opacity:0.85">${renderInline(h2[1])}</h2>`);
    } else if (h3) {
      out.push(`<h3 style="font-size:1.3em;margin:0 0 0.3em;font-weight:500;opacity:0.75">${renderInline(h3[1])}</h3>`);
    } else if (li) {
      out.push(`<li style="margin-bottom:0.4em;font-size:1.15em">${renderInline(li[1])}</li>`);
    } else if (line.trim() === '') {
      out.push('<br/>');
    } else {
      out.push(`<p style="font-size:1.1em;margin:0.3em 0;line-height:1.6;opacity:0.9">${renderInline(line)}</p>`);
    }
  }

  // Wrap consecutive <li> in <ul>
  const joined = out.join('\n');
  return joined.replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, (match) => {
    return `<ul style="list-style:disc;padding-left:1.5em;margin:0.5em 0;text-align:left">${match}</ul>`;
  });
}

function createPresentationOverlay(api: ClientPluginAPI): (notePath: string) => void {
  return function openPresentation(notePath: string): void {
    const overlay = document.createElement('div');
    overlay.id = 'kryton-presentation-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:#0f0f1a',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'color:#f0f0f0',
    ].join(';');

    document.body.appendChild(overlay);

    function cleanup(): void {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      document.removeEventListener('keydown', handleKey);
    }

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { cleanup(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    }

    document.addEventListener('keydown', handleKey);

    let currentIndex = 0;
    let slides: string[] = [];

    function goNext(): void {
      if (currentIndex < slides.length - 1) {
        currentIndex++;
        renderSlide();
      }
    }

    function goPrev(): void {
      if (currentIndex > 0) {
        currentIndex--;
        renderSlide();
      }
    }

    function renderSlide(): void {
      overlay.innerHTML = '';

      if (slides.length === 0) {
        overlay.innerHTML = '<div style="color:#9ca3af;font-size:16px">No slides found. Split slides with ---</div>';
        addCloseButton();
        return;
      }

      const slide = document.createElement('div');
      slide.style.cssText = [
        'max-width:900px', 'width:90%', 'padding:60px 80px',
        'text-align:center', 'position:relative',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'min-height:400px',
      ].join(';');
      slide.innerHTML = renderSlideContent(slides[currentIndex]);
      overlay.appendChild(slide);

      // Previous arrow
      if (currentIndex > 0) {
        const prev = document.createElement('button');
        prev.textContent = '‹';
        prev.style.cssText = [
          'position:fixed', 'left:24px', 'top:50%', 'transform:translateY(-50%)',
          'background:rgba(255,255,255,0.1)', 'border:none', 'color:#fff',
          'font-size:32px', 'width:48px', 'height:48px', 'border-radius:50%',
          'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
          'line-height:1',
        ].join(';');
        prev.onclick = goPrev;
        overlay.appendChild(prev);
      }

      // Next arrow
      if (currentIndex < slides.length - 1) {
        const next = document.createElement('button');
        next.textContent = '›';
        next.style.cssText = [
          'position:fixed', 'right:24px', 'top:50%', 'transform:translateY(-50%)',
          'background:rgba(255,255,255,0.1)', 'border:none', 'color:#fff',
          'font-size:32px', 'width:48px', 'height:48px', 'border-radius:50%',
          'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
          'line-height:1',
        ].join(';');
        next.onclick = goNext;
        overlay.appendChild(next);
      }

      // Counter
      const counter = document.createElement('div');
      counter.textContent = `${currentIndex + 1} / ${slides.length}`;
      counter.style.cssText = [
        'position:fixed', 'bottom:20px', 'right:24px',
        'font-size:12px', 'color:rgba(255,255,255,0.4)',
      ].join(';');
      overlay.appendChild(counter);

      addCloseButton();
    }

    function addCloseButton(): void {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'ESC';
      closeBtn.style.cssText = [
        'position:fixed', 'top:16px', 'right:20px',
        'background:rgba(255,255,255,0.1)', 'border:1px solid rgba(255,255,255,0.2)',
        'color:rgba(255,255,255,0.5)', 'padding:4px 10px',
        'border-radius:4px', 'cursor:pointer', 'font-size:12px',
      ].join(';');
      closeBtn.onclick = cleanup;
      overlay.appendChild(closeBtn);
    }

    // Show loading state, then fetch note
    overlay.innerHTML = '<div style="color:#9ca3af;font-size:14px">Loading...</div>';

    api.api.fetch(`/note-content?path=${encodeURIComponent(notePath)}`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json() as { content?: string };
        return data.content ?? '';
      })
      .catch(() => {
        // The plugin doesn't have a dedicated endpoint for reading note content;
        // the host exposes it. Try via a generic approach.
        return null as string | null;
      })
      .then(async (content) => {
        // If the generic fetch above didn't work, try reading via flashcards-style approach
        // The API doesn't expose a raw note-content endpoint in most hosts, but
        // api.context.useCurrentNote() returns the active note. For simplicity,
        // we try to read the note from the current-note context or show an error.
        if (content === null) {
          // Fallback: inform the user
          slides = ['# Presentation Mode\n\nCould not read note content via server API.\n\nPlease open the note first and use the action from within an open note.'];
        } else {
          slides = splitSlides(content);
        }
        currentIndex = 0;
        renderSlide();
      });
  };
}

export function activate(api: ClientPluginAPI): void {
  const openPresentation = createPresentationOverlay(api);

  api.ui.registerNoteAction({
    id: 'presentation-present',
    label: 'Present',
    icon: 'monitor',
    onClick: (notePath: string) => {
      openPresentation(notePath);
    },
  });
}

export function deactivate(): void {
  const overlay = document.getElementById('kryton-presentation-overlay');
  if (overlay) overlay.remove();
}
