/**
 * Tamil typography specimen injected into the real production build, so the test
 * exercises the actual fonts, tokens and global styles. Long words, stacked vowel signs,
 * flex/grid rows and navy bands are deliberate worst cases for clipping, overflow and
 * contrast. Text is generic UI wording — no claims about the trust.
 *
 * data-check values:  text = line-height check · box = must stay inside its container ·
 *                     button = 44px + no vertical clipping · card = container under test
 */
const LONG_WORD = 'உறுதிப்படுத்தப்பட்டுக்கொண்டிருக்கின்றனவாகியிருக்கின்றன';

export const TAMIL_SPECIMEN = /* html */ `
<div class="page">
<section id="tamil-specimen" lang="ta" aria-label="தமிழ் எழுத்து மாதிரி">
  <h2 data-check="text">ஒன்றாக இணைந்து நாளைய நல்வாழ்வை உருவாக்குவோம் — உதவி தேவைப்படும் அனைவருக்கும்</h2>
  <h3 data-check="text">கல்வி, உணவு மற்றும் அத்தியாவசியப் பொருட்கள், மருத்துவ அணுகல்</h3>
  <div class="prose">
    <p data-check="text">ஒவ்வொரு நன்கொடையும் சமூகங்களுக்கு ஆதரவளிக்கவும், தனிநபர்களுக்கு அதிகாரமளிக்கவும், சிறந்த எதிர்காலத்தை உருவாக்கவும் ஒரு வாய்ப்பை உருவாக்குகிறது. கட்டணம் சரிபார்க்கப்பட்ட பிறகே ஒப்புகைச் சீட்டு வழங்கப்படும்.</p>
    <p data-check="text">நீண்டசொல்: ${LONG_WORD}</p>
  </div>
  <p><small data-check="text">சிறிய உரை: தனியுரிமைக் கொள்கை மற்றும் பணம் திரும்பப்பெறும் கொள்கை</small></p>

  <!-- A future component class that uses the heading tokens must still get Tamil values. -->
  <p id="class-styled" data-check="text" style="font-family:var(--font-heading);line-height:var(--leading-heading);font-size:var(--text-h3)">வகுப்பு நடையுடன் தலைப்பு</p>

  <nav aria-label="மாதிரி வழிசெலுத்தல்">
    <ul data-check="box" style="display:flex;flex-wrap:wrap;gap:var(--space-4);padding:0;margin:0;list-style:none">
      <li data-check="box"><a data-check="text" href="#tamil-specimen">எங்களைப் பற்றி</a></li>
      <li data-check="box"><a data-check="text" href="#tamil-specimen">நாங்கள் உதவும் வழிகள்</a></li>
      <li data-check="box"><a data-check="text" href="#tamil-specimen">வெளிப்படைத்தன்மை</a></li>
      <li data-check="box"><a data-check="text" href="#tamil-specimen">தொடர்பு கொள்ள</a></li>
    </ul>
  </nav>

  <!-- Flex row and grid cell with an unbreakable-looking word: must not widen the page. -->
  <div data-check="box" style="display:flex;gap:var(--space-4);margin-block:var(--space-6)">
    <span data-check="box">${LONG_WORD}</span><span data-check="box">உதவி</span>
  </div>
  <div data-check="box" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:var(--space-4)">
    <p data-check="box">${LONG_WORD}</p><p data-check="box">கல்வி உதவி</p>
  </div>

  <div data-check="card" style="max-width:18rem;padding:var(--space-6);background:var(--color-surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-sm)">
    <h3 data-check="text">அவசரகால உதவி</h3>
    <p data-check="text">திடீர் நெருக்கடியில் உள்ள குடும்பங்களுக்கான உடனடி ஆதரவு.</p>
    <button data-check="button" type="button" style="background:var(--color-action-donate-bg);color:var(--color-action-donate-text);border:0;border-radius:var(--radius-md)">இப்போதே நன்கொடை அளியுங்கள்</button>
  </div>

  <div id="inverse-band" class="surface-inverse" style="margin-block:var(--space-8);padding:var(--space-6);border-radius:var(--radius-lg)">
    <h3 data-check="text">உங்கள் பங்களிப்பு ஒரு வாழ்க்கையை மாற்றும்</h3>
    <p data-check="text">ஒவ்வொரு உதவியும் முக்கியம். <a href="#tamil-specimen">மேலும் அறிக</a></p>
    <button id="inverse-button" data-check="button" type="button" style="background:var(--color-action-donate-bg);color:var(--color-action-donate-text);border:0;border-radius:var(--radius-md)">உதவி பெறுங்கள்</button>
    <button id="inverse-outline" data-check="button" type="button" style="background:transparent;color:var(--color-action-secondary-text);border:var(--border-width-strong) solid var(--color-action-secondary-border);border-radius:var(--radius-md)">மேலும் அறிக</button>
    <label style="display:block;margin-block:var(--space-4)">மின்னஞ்சல் <input id="inverse-input" type="email" style="display:block;min-height:var(--control-height);border:var(--border-width) solid var(--color-border-input);background:transparent"></label>
    <div id="nested-card" class="surface" style="padding:var(--space-4);border-radius:var(--radius-lg)">
      <h3 data-check="text">வெளிர் அட்டை</h3>
      <a href="#tamil-specimen">இணைப்பு</a>
    </div>
  </div>
</section>
</div>`;

/** A long Tamil skip-link label: wraps to two lines on small phones. */
export const TAMIL_SKIP_LABEL = 'நேராக முக்கியப் பகுதிக்குச் செல்ல';
