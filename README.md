# Causal Data Science Meeting 2026

Slides for the talk **“Foundational Models for Causal Effect Estimation and Conditional Discovery in Marketing”**
by Carlos Trujillo and Teemu Säilynoja (PyMC Labs), Causal Data Science Meeting 2026, 5 November 2026.

The talk presents the causal capabilities of **River**, the first Marketing Foundational Model (MFM) that PyMC Labs trained.
River samples graphs of direct effects for a new dataset and then draws the contributions for each graph.
It needs no new fit.

The deck is a static web page: HTML, CSS and plain JavaScript. It has no build step and no package dependencies.
Fonts, KaTeX and the team photos are in the repository, so the deck also runs offline.

## Run it

```sh
git clone https://github.com/pymc-labs/CausalDataScienceMeeting2026.git
cd CausalDataScienceMeeting2026
python3 serve.py
```

Open <http://127.0.0.1:8000> in Chrome, then press **F** for full screen and the presenter screen (see below).
`serve.py` uses the Python standard library only. It serves the deck with caching off, and it lets the presenter screen save the speaker notes (see [Edit the speaker notes](#edit-the-speaker-notes)). Use `--port 8100` for another port.

Any other static server, or `index.html` opened directly from `file://` in Chrome or Edge, also shows the deck. Then the speaker notes are read-only.

## Controls

| Key | Action |
| --- | --- |
| → ↓ Space PageDown Enter | Next build step, then next slide |
| ← ↑ PageUp Backspace | Previous build step, then previous slide |
| Home / End | First slide / last slide of the main talk |
| F | Full screen, with the presenter screen |
| P | Open the presenter screen (or bring it to the front) |
| N | Speaker notes for the current slide |
| O or Esc | Overview of all slides; click a slide to go to it |
| Z, then click (or Alt + click) | Zoom into a point of the slide; click, Z or Esc to zoom out |
| B or . | Black screen |

The address bar keeps the position as `#/slide/step`, for example `#/12/4`. A reload keeps the position.

The background lines work like the flow-line assets in `slides/elements/mono/flow_lines` of the main repository:
each form enters from an edge or a corner of the slide and fades out on its own before it reaches the text.
Each slide places its form in its empty space (`data-field` in `index.html`); text-heavy slides have none.

## Presenter screen

The presenter screen is a second window for your own display. It shows:

- a small live copy of the current slide, as the audience sees it, with its number, title and step. It plays the same steps and animations as the deck. It is the deck itself in mirror mode (`index.html?mirror`), which only follows the deck's position and takes no input;
- what the next arrow press shows: the next step (with its caption, when the step has one) or the next slide;
- the speaker notes of the current slide.

The elapsed timer shows minutes and seconds. Click **Start** to run it.
Use **Pause** and **Resume** to stop and continue the count.
**Reset** stops the timer and sets it to `00:00`.
Slide changes do not reset the timer. Reloading the presenter screen does.

Its arrow keys, a clicker and its **Previous** and **Next** buttons move the deck. The deck's own keys move the presenter screen too.

- **Two screens, in Chrome or Edge:** press **F** in the deck. The first time, allow the browser to manage windows on all your displays, then press **F** again. The deck fills the external screen, and the presenter screen opens on the other screen.
- **One screen, or without that permission:** the first **F** opens the presenter screen. Move it to your display, then press **F** in the deck window for full screen. A browser does not let one key press open a window and also enter full screen.
- If the browser blocks the window, allow pop-ups for the deck's address, then press **P**.

The two windows stay linked after a reload of either window, also from `file://`.

### Edit the speaker notes

With `python3 serve.py`, you can write in the speaker notes on the presenter screen:

- Click the notes and type. Each line is one paragraph. **Esc** gives the arrow keys back to the deck.
- The notes save by themselves after a short pause, when you leave the notes, or with **Cmd/Ctrl + S**. The status above the notes says when they are saved.
- `serve.py` writes the notes into that slide's `<aside class="notes">` in `index.html`. Nothing else in the file changes. The open deck and its **N** panel show the new notes at once.
- The notes are then ordinary changes to a tracked file. Commit and push them, and everyone who pulls the repository sees the same notes. Anyone can edit them again, on the presenter screen or directly in `index.html`.
- If the notes of that slide changed in `index.html` after the deck loaded (for example after a `git pull`), `serve.py` does not save, so nobody's text is overwritten. Copy your text, reload the deck, then paste it again.

## Narrative

| Part | Slides | Content |
| --- | --- | --- |
| Opening | 1–3 | Title, the team, the agenda |
| 01 · The problem | 4–8 | Sales do not reveal causes; the structural model and three alternative causal graphs; one specification against model averaging; “What if the hard work was already done?”; the goal: a distribution over graphs and contributions |
| 02 · Causal worlds | 9–11 | Prior-fitted networks: learn the posterior from the prior; the contribution as an interventional quantity; the prior generates worlds with a known truth |
| 03 · Inside River | 12–13 | The architecture, assembled step by step with zoom; graph sampling and graph-averaged inference |
| 04 · Evidence | 14–16 | Test design; structure recovery; contribution accuracy |
| 05 · Boundaries and the next stage | 17–19 | Limitations of River; what River demonstrates (the main results); future work: the graph slots for the next research stage |
| Close | 20–21 | The white paper (available now, with a QR code to `dub.sh/mfm-cdsm`) and the academic paper (coming soon, with the top of its first page); "thank you" as a graph that morphs through English, Finnish, Spanish and Portuguese |
| Backup | B1–B2 | Flow matching; units, cost and omitted inputs. Hidden during the talk: arrows, End, swipes, the overview and slide numbers in the address never reach them. Open them only by their own address: `#/backup/1` and `#/backup/2` |

## Structure

```
index.html            all slides, text and speaker notes
presenter.html        presenter screen: now, next, editable speaker notes, timer
serve.py              local server: the deck without caching, and saving of the speaker notes into index.html
css/deck.css          design system: brand palette, type, transitions, chrome
css/slides.css        slide layouts
css/presenter.css     presenter screen layout
css/scenes/*.css      styles of the animated scenes
js/deck.js            engine: navigation, build steps, transitions, notes, overview, zoom, presenter link
js/presenter.js       presenter screen: the link to the deck, notes editing, timer
js/field.js           background flow lines and contours; edge-anchored forms that fade out and morph between slides
js/data.js            every number shown in the deck, with its source
js/scenes/*.js        animated scenes (architecture, causal scenes, results, closing "thank you" graph)
assets/               fonts, team photos, official PyMC Labs logos
vendor/katex/         KaTeX 0.16.11 for equations
```

## Sources

- Numbers: academic paper in pymc-labs/MarketingFoundationalModels pull request #36 (commit `499be45`),
  with the results of run `pr29-final-full-e35866e` at commit `10b785a`.
  `js/data.js` names the section, table or figure for each value.
- Style and colours: the PyMC Labs white paper template (Deep Navy `#0C1F40`, Pastel Aqua `#B4E7DD`,
  Soft Periwinkle `#9FAAE2`, Soft White `#F7F7F7`, Peach Orange `#F6AE72`; Archivo Expanded, Inter, Fira Mono).
- Logos: the official PyMC Labs full logo (white and navy); favicon from the short mark.
- Narrative elements: the ODSC West 2026 talk and the white paper.

River is an early research prototype. The paper evaluates it on simulated data only.
