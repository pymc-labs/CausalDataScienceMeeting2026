# Causal Data Science Meeting 2026

Slides for the talk **“Foundation Models for Causal Effect Estimation and Conditional Discovery in Marketing”**
by Carlos Trujillo and Teemu Säilynoja (PyMC Labs), Causal Data Science Meeting 2026, 5 November 2026.

The talk presents the causal capabilities of **River**, the first Marketing Foundational Model (MFM).
River samples graphs of direct effects for a new dataset and then draws the contributions for each graph.
It needs no new fit.

The deck is a static web page: HTML, CSS and plain JavaScript. It has no build step and no package dependencies.
Fonts, KaTeX, the team photos and the film are in the repository, so the deck also runs offline.

## Run it

```sh
git clone https://github.com/pymc-labs/CausalDataScienceMeeting2026.git
cd CausalDataScienceMeeting2026
python3 -m http.server 8000
```

Open <http://localhost:8000> in Chrome, then press **F** for full screen.
Use a local web server: the browser does not load the video and the fonts reliably from `file://`.

Any static server works, for example `npx serve .`.

## Controls

| Key | Action |
| --- | --- |
| → ↓ Space PageDown Enter | Next build step, then next slide |
| ← ↑ PageUp Backspace | Previous build step, then previous slide |
| Home / End | First / last slide |
| F | Full screen |
| N | Speaker notes for the current slide |
| O or Esc | Overview of all slides; click a slide to go to it |
| Z, then click (or Alt + click) | Zoom into a point of the slide; click, Z or Esc to zoom out |
| P | Play or pause the film on slide 2 |
| B or . | Black screen |

The address bar keeps the position as `#/slide/step`, for example `#/13/4`. A reload keeps the position.

## Narrative

| Part | Slides | Content |
| --- | --- | --- |
| Opening | 1–4 | Title, the 40-second film, the team, the five parts |
| 01 · The problem | 5–8 | Sales do not reveal causes; the structural model; one specification against model averaging; “What if we could start backwards?” |
| 02 · Causal worlds | 9–12 | The prior as a simulator with known graphs; the contribution as an interventional quantity; prior-fitted networks |
| 03 · Inside River | 13–15 | The architecture, assembled step by step with zoom; flow matching; graph sampling and graph-averaged inference |
| 04 · Evidence | 16–19 | Test design; structure recovery; contribution accuracy; units, cost and omitted inputs |
| 05 · Boundaries | 20–22 | Limits; what is demonstrated and what is not; the graph slots for the next research stage |
| Close | 23–24 | Conclusions and contact |

## Structure

```
index.html            all slides, text and speaker notes
css/deck.css          design system: brand palette, type, transitions, chrome
css/slides.css        slide layouts
css/scenes/*.css      styles of the animated scenes
js/deck.js            engine: navigation, build steps, transitions, notes, overview, zoom
js/field.js           background flow lines and contours that morph between slides
js/data.js            every number shown in the deck, with its source
js/scenes/*.js        animated scenes (architecture, causal scenes, results)
assets/               fonts, team photos, brand logo, film
vendor/katex/         KaTeX 0.16.11 for equations
```

## Sources

- Numbers: academic paper draft, pymc-labs/MarketingFoundationalModels pull request #28 (commit `1f0bfbc`).
  `js/data.js` names the section or table for each value.
  The reliability diagram uses the bins of the structure-accuracy run in the same pull request.
- Style and colours: the PyMC Labs white paper template (Deep Navy `#0C1F40`, Pastel Aqua `#B4E7DD`,
  Soft Periwinkle `#9FAAE2`, Soft White `#F7F7F7`, Peach Orange `#F6AE72`; Archivo Expanded, Inter, Fira Mono).
- Narrative elements: the ODSC West 2026 talk and the white paper.
- Film: `slides/elements/video/river_causal_cdsm2026.mp4` from the MarketingFoundationalModels repository.

River is an early research prototype. The paper evaluates it on simulated data only.
