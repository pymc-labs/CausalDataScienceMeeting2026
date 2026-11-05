# Foundational Models for Causal Effect Estimation and Conditional Discovery in Marketing

The slides of a talk at the **Causal Data Science Meeting 2026** (5 November 2026),
by Carlos Trujillo and Teemu Säilynoja, [PyMC Labs](https://www.pymc-labs.com).

## About the talk

Marketing teams use marketing mix models (MMMs) to estimate how much each channel contributes to sales.
Sales data alone do not show which model is right. Different response curves, carryover and causal graphs
can explain the same sales. One analysis usually commits to one specification, and that hides the uncertainty
about the choice.

The talk presents **River**, the first Marketing Foundational Model (MFM) that PyMC Labs trained.
River learns inference once, from simulated marketing worlds whose causal graphs and contributions are known.
For a new dataset, River samples graphs of direct effects, then draws the contributions for each graph.
It needs no new fit.

What the talk shows, on held-out simulated worlds:

- **Contributions:** a lower mean channel error (CRPS) than PathMC, OLS and a PyMC-Marketing model with default priors,
  in all five test conditions and at all three horizons.
- **Structure:** River finds channel edges with a precision and recall near 0.9. The exact set of channels is right
  in about half of the worlds.
- **Reuse:** one trained network serves new datasets, with no new fit.

What the talk does not show: River models direct effects only, and its contribution intervals miss the true value
too often. The tests use simulated data only. The slide “Limitations of River” states these points.

## Read more

- **White paper**, available now: <https://dub.sh/mfm-cdsm>
- **Academic paper**: coming soon.

## View the slides

You need Python 3 and Chrome or Edge.

```sh
git clone https://github.com/pymc-labs/CausalDataScienceMeeting2026.git
cd CausalDataScienceMeeting2026
python3 serve.py
```

Open <http://127.0.0.1:8000>. Use the arrow keys to move through the slides. Press **F** for full screen.

- `serve.py` uses the Python standard library only. For another port, use `python3 serve.py --port 8100`.
- You can also open `index.html` directly in Chrome or Edge, or use any other static web server.
  Then the speaker notes are read-only.
- The slides need no internet connection. The fonts, KaTeX and all images are in the repository.

## The talk

| Part | Slides | What it covers |
| --- | --- | --- |
| Opening | 1–3 | The title, the team and the agenda |
| 01 · Forecasting is not the goal | 4–8 | Sales do not show causes. An MMM is a structural model, with alternative causal graphs. One specification hides model uncertainty. What if the hard work was already done? The goal: a distribution over graphs and contributions |
| 02 · Learning by simulation | 9–11 | Learn the posterior from the prior. A contribution is an interventional quantity. The prior generates worlds with a known truth |
| 03 · The architecture | 12–13 | River, assembled step by step. At inference, River samples the causal graph |
| 04 · The results | 14–16 | How we test (one world, five analysts). Structure recovery. Contribution accuracy |
| 05 · Boundaries and the next stage | 17–19 | Limitations of River. What River demonstrates. Future work: the graph slots in the network |
| Close | 20–21 | The white paper and the coming academic paper. Thank you |
| Backup | B1–B2 | Flow matching. Units, cost and omitted inputs. They open only by their address: `#/backup/1` and `#/backup/2` |

## Keys

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

The address bar shows the position as `#/slide/step`, for example `#/12/4`. A reload keeps the position.

## Presenter screen

The presenter screen is a second window for the speaker's own display.

**Open it**

- **Two screens, in Chrome or Edge:** press **F** in the deck. The first time, allow the browser to manage windows
  on all your displays, then press **F** again. The deck fills the external screen, and the presenter screen opens
  on the other screen.
- **One screen:** the first **F** opens the presenter screen. Move it to your display, then press **F** in the deck
  window for full screen. A browser does not let one key press open a window and also enter full screen.
- **P** opens the presenter screen at any time. If the browser blocks the window, allow pop-ups for the deck's
  address, then press **P** again.

**What it shows**

- A small live copy of the current slide, as the audience sees it, with its number, title and step.
- What the next arrow press shows: the next step, with its caption, or the next slide.
- The speaker notes of the current slide.
- An elapsed timer: **Start**, **Pause** / **Resume** and **Reset**. Slide changes do not reset it.

Its arrow keys, a clicker and its **Previous** and **Next** buttons move the deck. The deck's own keys move
the presenter screen too. The two windows stay linked after a reload of either window.

### Edit the speaker notes

With `python3 serve.py`, the speaker can write in the notes on the presenter screen:

- Click the notes and type. Each line is one paragraph. **Esc** gives the arrow keys back to the deck.
- The notes save by themselves after a short pause, when you leave the notes, or with **Cmd/Ctrl + S**.
  The line above the notes says when they are saved.
- `serve.py` writes the notes into that slide's `<aside class="notes">` in `index.html`. Nothing else in the file
  changes. A team member then commits and pushes the change, so everyone who pulls has the same notes.
- If someone else changed the notes of that slide after the deck loaded (for example, after a `git pull`),
  `serve.py` does not save, so nobody's text is overwritten. Copy your text, reload the deck, then paste it again.

## Contributing

Only members of the PyMC Labs core team can push to this repository or open pull requests.
Everyone can read and clone it. To report a problem with the slides, open an issue.

## Repository

```
index.html            all slides, their text and the speaker notes
presenter.html        the presenter screen
presentation-story.md the editorial plan: the story of the talk, the purpose of each slide and the agreed decisions
serve.py              local server: serves the deck without caching, and saves speaker notes into index.html
css/deck.css          design system: brand palette, type, transitions, slide frame
css/slides.css        slide layouts
css/presenter.css     presenter screen layout
css/scenes/*.css      styles of the animated scenes
js/deck.js            engine: navigation, build steps, transitions, notes, overview, zoom, the presenter link
js/presenter.js       presenter screen: the link to the deck, the live copy, notes editing, timer
js/field.js           background lines and contours, which change form from slide to slide
js/data.js            every number shown in the deck, with its source in the paper
js/scenes/*.js        animated scenes (architecture, causal scenes, results, the closing "thank you" graph)
assets/               fonts, team photos, PyMC Labs logos, the paper page and the white-paper QR code
vendor/katex/         KaTeX 0.16.11, for the equations
```

To understand why each slide exists and what it must say, read `presentation-story.md`.
The presenter screen's live copy is the deck itself in mirror mode (`index.html?mirror`): it follows the deck's
position and takes no input.

## Sources

- **Numbers:** the academic paper in pull request #36 of the PyMC Labs MarketingFoundationalModels repository
  (commit `499be45`), with the results of run `pr29-final-full-e35866e` at commit `10b785a`.
  `js/data.js` names the section, table or figure of each value.
- **Style:** the PyMC Labs white-paper template. Colours: Deep Navy `#0C1F40`, Pastel Aqua `#B4E7DD`,
  Soft Periwinkle `#9FAAE2`, Soft White `#F7F7F7` and Peach Orange `#F6AE72`.
  Type: Archivo Expanded, Inter and Fira Mono.
- **Logos:** the official PyMC Labs logos.
- **Story:** elements of the ODSC West 2026 talk and of the white paper.

## Licenses

This repository has no license file of its own.
The fonts keep the SIL Open Font License (`assets/fonts/LICENSE.md`).
KaTeX keeps the MIT License (`vendor/katex/LICENSE`).

River is an early research prototype. The talk and the paper evaluate it on simulated data only.
