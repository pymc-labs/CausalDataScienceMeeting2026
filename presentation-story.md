# Presentation story — chapter overview

**Foundational Models for Causal Effect Estimation and Conditional Discovery in Marketing**

## Scope and timing

The slot is confirmed: **20 minutes including Q&A**. Target **15 minutes of presentation plus 5 minutes of questions**. Detailed derivations and architecture internals are candidates for backup, not extra main-talk content.

This is the shared editorial plan: chapter intent, slide purpose and agreed narrative decisions. The deck has 22 main slides, then backup slides B1 and B2. Implemented: the opening subtitle removal, the wording changes on slides 8 and 11, the alternative DAGs on slides 5–6, the full nine-step walkthrough on slide 12, the move of the flow-matching and three-checks slides to backup (agreed by Carlos on 3 and 4 November 2026), and the flowchart on slide 14, which replaces the card layout (Carlos, 4 November 2026).

## Walkthrough notes — pending changes

- **Slide 13, step 2:** check whether inference preserves dependence between graph edges. Example: joint draws contain either edge A or edge B, never both; each edge then has marginal probability 0.5. These marginals do not imply independence. Verify that the contribution decoder receives complete sampled graphs, rather than graphs resampled from independent marginal edge probabilities. Clarify that the displayed marginal probabilities alone cannot show this dependence. This is an open verification question, not a confirmed defect.

- **Slide 13:** this slide feels repetitive. Review its overlap with other slides and identify whether another slide should be removed or merged. No removal decision yet; keep the slides unchanged for now.

- **Slide 10, step 3:** consider removing the final Simulate → Train → Use summary reveal; it may be unnecessary. Not removed yet.
- **Deck-wide:** references to pages and equation numbers in the academic paper can be removed from the deck. Recorded for a later cleanup; references are unchanged for now.

## Review workflow

- Discuss proposed changes through PR comments on this document.
- Record agreed decisions here and implement relevant HTML/CSS/JavaScript changes in the same PR.
- Review the rendered slides as well as the Markdown diff. Cosmetic-only changes need no narrative update.
- Keep this document focused on intent and takeaways, rather than duplicating the slide text. Renumber references when slides move.
- Backup slides B1 and B2 stay hidden during the talk (Carlos, 3 November 2026): arrows, End, swipes, the overview and slide numbers in the address never reach them. The arrows stop at the closing slide. A backup slide opens only by its own address, `#/backup/1` or `#/backup/2`, if a question needs it.

**Central message:** River learns inference across simulated marketing worlds, then estimates contributions and uncertainty over permitted causal graphs without a new fit. The results are promising within a restricted setting—not evidence of unrestricted causal discovery.

## Opening — What is River? · 1 minute

*Current slides 1–3.*

Introduce River as a marketing foundational model, briefly acknowledge the team, and pose the central question: **can we learn once how to infer what drove sales, rather than build and fit a new model for every dataset?**

Keep the team introduction and agenda brief. The audience needs the question more than a detailed roadmap.

## 1. The problem — Sales do not reveal causes · 3 minutes

*Current slides 4–7.*

Different contributions can produce the same sales history. A model that predicts sales well does not necessarily tell us what each channel caused. Choosing one response curve, carryover model and causal structure also hides uncertainty about those choices.

Bayesian model averaging addresses that uncertainty, but repeatedly fitting many specifications is costly. This motivates River’s reversal: specify many plausible worlds first, learn inference once, then reuse it.

**Keep:** the visual example of different decompositions explaining the same total, and the reversal of the usual workflow.

**Compress:** the catalogue of specification choices. Explain model averaging in one sentence rather than deriving it.

## 2. Simulated causal worlds — What is being learned? · 3 minutes

*Current slides 8–11.*

The simulator creates marketing datasets whose graphs and contributions are known. It lets us train on—and later test against—truth that is unavailable in ordinary business data.

A contribution has a precise causal meaning here: the change in noise-free sales when a channel’s whole spend path is set to zero. The model learns a distribution of possible explanations rather than one answer.

State the boundary alongside the definition: **the current prior permits direct input-to-sales effects, not hidden demand or paths between inputs.**

**Keep:** one simulated world, the intervention example, and the idea of learning the posterior from the prior.

**Optional depth:** the loss/KL derivation. For the shorter talk, give the intuition and qualify it as an intended inference target, not a guarantee of exact inference.

## 3. Inside River — Graph first, contributions second · 2 minutes

*Current slides 12–13; flow matching is backup B1.*

River encodes the observed dataset, samples a permitted graph, then draws contributions conditional on that graph. Repeating this captures uncertainty both between graphs and within each graph. If an edge is absent, its contribution is exactly zero.

This is the mechanism the audience needs to understand. It connects the model-averaging motivation to the results that follow.

**Keep:** one architecture overview and the graph-then-contributions explanation.

**Optional depth:** flow-matching equations, tensor dimensions, training-loss components and numerical integration details. The full eight-step architecture walkthrough is too much for the short version.

## 4. Evidence — What does it recover? · 4 minutes

*Current slides 14–16; the three further checks are backup B2.*

Explain that evaluation uses held-out simulated cases with known truth. Then answer two separate questions:

- **Structure:** channel-edge precision and recall are near 0.9, but the exact set of active channels is recovered in only about half the worlds. Good individual-edge scores do not imply a correct whole graph.
- **Contributions:** River improves channel contribution CRPS over the regression baselines across the tested conditions and horizons. The privileged oracle still performs better.

Keep the comparison scope explicit: these are synthetic results, and the default-prior PyMC-Marketing comparison is not a claim against all expert-built MMMs.

**Keep:** a brief test-design explanation and one clear result for each question.

**Optional depth:** reliability-bin details, all condition-by-horizon comparisons, unit-invariance numbers and timing benchmarks. If timing is mentioned, retain the different-hardware caveat. Omission results do not demonstrate recovery of the missing cause.

## 5. Boundaries and next steps — A first result, not the finished tool · 2 minutes

*Current slides 17–22, including conclusions, what comes next and the thank-you slide.*

Close with a bounded claim: reusable contribution inference and partial direct-effect structure recovery are demonstrated in the tested synthetic setting. Uncertainty calibration needs work, contribution gains do not imply better sales prediction, and real-business causal identification is not established.

Richer causal systems—mediation, interactions, hidden demand and changing graphs—require broader priors, new training and new evaluation. Unused architectural capacity is not an existing learned capability.

**Keep:** one concise limits statement, the research direction, and the main takeaway: **learn inference once, preserve uncertainty over explanations, and test against known truth.**

**Compress:** repeated caveats and separate conclusion summaries. End with a clear invitation for questions.

## Timing budget

| Section | Time |
|---|---:|
| Opening | 1 min |
| Problem | 3 min |
| Simulated worlds | 3 min |
| Inside River | 2 min |
| Evidence | 4 min |
| Boundaries and closing | 2 min |
| Questions | 5 min |
| **Total** | **20 min** |

Rehearse the main talk to 15 minutes, including transitions and animations. Protect time for interpreting the results; cut technical detail rather than rushing the evidence or dropping the causal boundaries.

## Slide-by-slide editorial plan

The time budgets below total **15 minutes**. Backup slides B1 and B2 have no time in the main talk. These are rehearsal targets, not measured timings.

### 1 — Title · 25 seconds · Main

- **Purpose:** introduce the topic and speakers without competing messages.
- **Takeaway:** this is a talk about foundational models for causal effect estimation and conditional discovery in marketing.
- **Visual / delivery:** let the long title stand on its own; introduce River orally.
- **Agreed decision, implemented:** remove the explanatory paragraph beneath the title. Retain the River eyebrow, branding and presenter/author information.
- **Rationale:** the title is already long enough; the subtitle adds unnecessary reading at the opening.

### 2 — The team · 15 seconds · Main

- **Purpose:** acknowledge the team and identify the presenters.
- **Visual / delivery:** portraits and names; a brief acknowledgement rather than biographies.
- **Proposal:** keep this quick to protect the opening minute.

### 3 — Agenda · 20 seconds · Main

- **Purpose:** orient the audience to problem, approach, evidence and boundaries.
- **Visual / delivery:** the existing five-part agenda; summarize rather than read every line.

### 4 — Sales show what happened · 60 seconds · Main

- **Purpose:** establish why prediction does not identify contributions.
- **Takeaway:** the same total sales can support different causal stories.
- **Visual / delivery:** changing decompositions with an unchanged total; make this the motivating example.

### 5 — A marketing mix model is a structural model · 40 seconds · Main

- **Purpose:** define the components we want to infer, then show that the same equation hides causal choices.
- **Takeaway:** observed sales combine baseline, channel effects, controls and noise; the same data fit several causal graphs.
- **Visual / delivery:** highlight the equation’s terms in turn. Step 4 shows the equation as a graph of direct effects. Step 5 forks it into three graphs: correlated channels (inside River’s prior), hidden demand driving Search and Sales, and a promotion → Search path between inputs (both outside River’s prior). Arrows are assumptions; dashed lines are observed dependencies; a dashed circle is a hidden variable.
- **Agreed decision, implemented ([issue #2](https://github.com/pymc-labs/CausalDataScienceMeeting2026/issues/2), option A):** the DAGs replace the three bottleneck notes. Active terms still enlarge by 12% as well as changing color.

### 6 — Each analysis commits to one specification · 45 seconds · Main

- **Purpose:** expose uncertainty hidden by selecting one model.
- **Takeaway:** uncertainty includes both parameters and model choices.
- **Visual / delivery:** two plausible analyst decompositions, followed by the model-averaging idea. The causal-structure row names the three graphs of slide 5.
- **Proposal:** summarize the choices and averaging equation rather than explaining each option.

### 7 — What if we could start backwards? · 35 seconds · Main

- **Purpose:** turn the problem into the proposed solution.
- **Takeaway:** specify many worlds first, learn inference once, reuse it without a new fit.
- **Visual / delivery:** contrast the repeated fitting workflow with River’s inference workflow.

### 8 — Use the prior to generate worlds with a known truth · 55 seconds · Main

- **Purpose:** explain where training examples and known causal truth come from.
- **Takeaway:** diverse worlds with correlated inputs require distributions of explanations.
- **Visual / delivery:** one world, then variation across worlds; use the updated channel-share and correlation facts only as supporting evidence.

### 9 — A contribution is an interventional quantity · 60 seconds · Main

- **Purpose:** define the causal target and its assumptions together.
- **Takeaway:** remove a channel’s spend path and compare noise-free sales, within the restricted direct-effect graph family.
- **Visual / delivery:** show the intervention; explicitly exclude hidden demand and input-to-input paths.

### 10 — Learn the posterior from the prior · 40 seconds · Main, compressed

- **Purpose:** connect simulated training to Bayesian model averaging.
- **Takeaway:** the ideal likelihood loss targets the mixture-prior posterior. River’s flow-matching loss has the same ideal target. Finite training and 16-step sampling do not guarantee exact inference.
- **Implemented (simplified, Carlos, 4 November 2026):** two rows, each a plain message in large type at the left with its equation small at the right. Step 0: "Simulate worlds with a known truth. Train one network to recover that truth from the data an analyst sees", with the ideal loss. Step 1, the main message: "If the network is flexible enough, the best answer is the model-averaged posterior", with the optimum and a one-line flow-matching caveat. The KL step and the Simulate · Train · Use notes repeated these messages, so they moved to the speaker notes. The first equation is tagged “ideal loss”, because River does not train on the negative log density (verified in [issue #3](https://github.com/pymc-labs/CausalDataScienceMeeting2026/issues/3)).

### 11 — The output is a distribution over graphs and contributions · 25 seconds · Main

- **Purpose:** give the audience a simple description of the output.
- **Takeaway:** graphs plus contributions conditional on each graph—not one number.
- **Visual / delivery:** use this as the transition into the mechanism.

### 12 — Assembling River · 60 seconds · Main

- **Purpose:** show the architecture step by step: input, encoder, router, sampled graph, conditioner, decoder, one decomposition draw, then training and inference.
- **Takeaway:** encode data, sample a graph, condition the contribution decoder on that graph.
- **Agreed decision, implemented (Carlos, 4 November 2026):** the full nine-step walkthrough is back, so the camera moves to the next part on every step instead of jumping over parts. This replaces the five-step overview of 3 November. Keep each step short to stay near 60 seconds.

### 13 — At inference, River samples the causal graph · 60 seconds · Main

- **Purpose:** explain how structure uncertainty enters contributions.
- **Takeaway:** repeated graph-and-contribution draws capture uncertainty between and within graphs; absent edges give exact zeros.
- **Visual / delivery:** sample graphs and show their contributions. Call this discovery conditional on the permitted family.

### 14 — One world. Five analysts. · 45 seconds · Main

- **Purpose:** make the evaluation interpretable before showing results.
- **Takeaway:** methods are tested against known synthetic truth, with different scopes for different comparisons.
- **Visual:** Teemu’s evaluation flowchart in the deck style, without boxes. Four aligned columns: one simulated world (true graph and mechanisms, observed data, held-out truth), five conditions, five analysts and the scores. Grey lines carry observed data and estimates. Peach lines carry what only the simulator knows: a dashed line takes the true graph to the oracle only, and a solid line takes the held-out truth to the scores only.
- **Delivery:** four steps. Each step adds one column and one short caption, and the earlier columns fade back. The last step shows all four columns.
  - Step 0, the world: what the simulator knows and what an analyst sees.
  - Step 1, the conditions: 100 cases each. Three select the worlds; two hide the largest-effect channel or control (out of prior). Distinguish world selection from input masking.
  - Step 2, the analysts: four analysts receive all five conditions. The oracle gets the true graph and only the 100 full-input cases. Do not imply that full-input observations are exclusive to the oracle.
  - Step 3, the scores: CRPS against the held-out truth, three horizons, 1,500 scored views. The horizons are in the speaker notes only.
- **Scope:** contribution and prediction evaluation, not graph-recovery scoring. The structure study on slide 15 scores graph recovery.

### 15 — Structure is partly recovered · 90 seconds · Main

- **Purpose:** evaluate the conditional-discovery claim.
- **Takeaway:** strong marginal edge scores are not whole-graph recovery.
- **Visual / delivery:** one picture, no steps (Carlos, 4 November 2026). One dot plot on a 0–1 scale, one dot for each context length (99, 185 and 207 weeks): channel-edge precision and recall (edge by edge), then the exact channel set and the exact set of channels and controls (whole set). The range over the three context lengths is printed at the right. The illustrative true-graph view is removed, because slide 13 already shows graph sampling. The speaker notes keep the edge rule, the true graph among the 2,048 draws and the measured calibration error, for questions. Report the calibration error as a measurement, not as a calibration claim. There is no recalibration step.

### 16 — Contributions: lower error in every condition · 105 seconds · Main

- **Purpose:** establish the practical contribution-inference result.
- **Takeaway:** lower mean contribution CRPS than PathMC, OLS and the native PyMC-Marketing MMM in every tested condition and at all three horizons, while the oracle remains better.
- **Visual / delivery:** one picture, no steps (Carlos, 4 November 2026). A dot plot of query channel CRPS: all four methods, PyMC-Marketing included, in all five conditions and at all three context lengths. The legend bounds PyMC-Marketing to default priors. Explain what CRPS measures before the comparison. The full-input numbers, the per-world wins, the separate PyMC-Marketing study (Table 20) and its fit-health caveats are in the speaker notes, for questions.

### 17 — Where River falls short · 35 seconds · Main, compressed

- **Purpose:** prevent contribution gains from becoming a general superiority claim.
- **Takeaway:** oracle gap, sales prediction and interval calibration remain limitations; the source of the gains is not isolated.
- **Proposal:** summarize rather than read all numerical comparisons.

### 18 — What is demonstrated, and what is not · 35 seconds · Main

- **Purpose:** state the exact scope of the causal claim.
- **Takeaway:** restricted synthetic direct-effect inference is demonstrated; unrestricted discovery and real-business identification are not.
- **Visual / delivery:** contrast current evidence with non-claims, without repeating all earlier caveats.

### 19 — The graph slots are already in the network · 20 seconds · Main, compressed

- **Purpose:** motivate the next research stage.
- **Takeaway:** richer mechanisms need new priors, new training and new evaluation; capacity is not a learned capability.
- **Proposal:** one sentence on richer and time-varying graphs, no slot-count walkthrough.

### 20 — Conclusions · 15 seconds · Main

- **Purpose:** restate the three contributions in bounded form.
- **Takeaway:** contribution inference, constrained structure recovery and reusable inference.
- **Visual / delivery:** concise recap, no repeated result tables.

### 21 — This is just the start · 10 seconds · Main

- **Purpose:** state the research direction and where to find the paper.
- **Visual / delivery:** "What comes next" with the paper title, the link and the contact.

### 22 — Thank you · 5 seconds · Main

- **Purpose:** close and invite discussion.
- **Visual / delivery:** one word only. "Thank you" is drawn as a graph (nodes on the letter outlines, edges between neighbours) that morphs into "Kiitos", "Gracias" and "Obrigado" and back. Only the PyMC Labs logo (top left) and the conference name (bottom right) sit in the corners. Transition directly to the five-minute Q&A.
- **Agreed decision, implemented (Carlos, 4 November 2026):** the thank-you moves out of slide 21 into its own slide. The conclusions budget drops by 5 seconds, so the talk stays at 15 minutes.

### B1 — Flow matching turns noise into draws · Backup

- **Purpose:** answer how a flow head produces posterior draws.
- **Takeaway:** learned velocities, conditioned on the encoded dataset, turn coherent noise into draws. The router draws graphs; the decoder draws contributions for one graph.
- **Agreed decision, implemented:** moved to backup for questions.

### B2 — Three more checks · Backup

- **Purpose:** support questions about units, runtime and omitted inputs.
- **Takeaway:** tested unit invariance and omission robustness are useful, but timings are device-specific (a fitted MMM answers repeated long queries faster) and missing causes are not recovered.
- **Agreed decision, implemented:** moved to backup for questions.

## Agreed annotation follow-up

- **Slides 5–6:** [Issue #2 — alternative causal DAGs](https://github.com/pymc-labs/CausalDataScienceMeeting2026/issues/2). Implemented as option A (agreed with Carlos): the formula becomes a DAG on slide 5, then three alternative DAGs; slide 6 names them. DAG 3 is a promotion → Search path between inputs.
- **Slide 8:** title changed to “Use the prior to generate worlds with a known truth,” highlighting “known truth.” Speaker notes now distinguish the prior from the simulator it defines.
- **Slides 10, 12, 13, 15 and B1:** [Issue #3 — implementation and artifact verification](https://github.com/pymc-labs/CausalDataScienceMeeting2026/issues/3). Verified against pymc-mfm `32587ac` (the training revision of River-1), run `profile-c-9add72ea6d35` and the structure run; corrections applied. The issue comment holds the claim-by-claim checklist.
- **Slide 11:** use “a distribution over graphs and contributions” rather than “causal systems”; updated in the slide and speaker notes.
- **Slide 16:** [Issue #4 — converged PyMC-Marketing results](https://github.com/pymc-labs/CausalDataScienceMeeting2026/issues/4). No converged MMM rerun exists. Carlos decided that the deck follows the latest paper (MarketingFoundationalModels PR #36, commit `499be45`), with its fit-health caveats.
- **Slide 18:** retain the current title, “What is demonstrated, and what is not.”

## Decisions for review

1. Does the proposed 15-minute talk / 5-minute Q&A split work?
2. Is the main emphasis contribution inference, conditional structure discovery, or an equal balance?
3. ~~For the short version, can the full flow-matching explanation and detailed architecture walkthrough move to backup?~~ Flow matching and the three checks are backup B1 and B2 (Carlos, 3 November 2026). Slide 12 keeps the full nine-step walkthrough (Carlos, 4 November 2026).
4. Which two result visuals should the audience remember?
