/* ==========================================================================
   Every number shown in the deck, in one place, with its source.
   Source: academic paper in pymc-labs/MarketingFoundationalModels PR #36,
   "Update academic and white papers with PR 29 results" (branch
   agent/paper-results-pr29, commit 499be45), "Marketing Foundational
   Models: Amortized Bayesian Inference over Mixtures of Marketing Mix
   Models". Section, table and equation numbers refer to the rendered PDF
   paper/academical/mfm-academic-paper.pdf at that commit.
   ========================================================================== */
window.DECK_DATA = {
  source: {
    paper: 'Trujillo, Säilynoja, Saldarriaga, Hayashi, Wiecki, Fiaschi. Marketing Foundational Models: Amortized Bayesian Inference over Mixtures of Marketing Mix Models. PyMC Labs, October 2026 (draft, PR #36).',
    commit: '499be45'
  },

  // Prior: Sections 2.1-2.3, Table 1 (Appendix A.1) and Appendix A.2.
  // Corpus stream-splits-baseline-half-200k-1f4e757b6851, training snapshot
  // snap-37317315feae, training run profile-c-9add72ea6d35
  // (experiments/prior_and_architecture/inputs/prior/corpus_sources.json).
  // Shares and correlations are the recorded corpus summaries of Appendix A.2.
  prior: {
    worlds: 200000,
    train: 196000,
    holdout: 4000,
    combinations: 50,          // 10 response/carryover choices x 5 input settings (Section 2.1, Table 1)
    responseChoices: 10,       // five response choices, with or without geometric carryover
    inputSettings: ['calm', 'hectic', 'mixed', 'spiky inputs', 'hectic baseline'],
    worldsPerCombination: 4000,
    weeks: 208,
    channels: [1, 10],
    controls: [1, 10],
    maxInputCorrelationMedian: 0.943,    // Appendix A.2: median, over 1,000 sampled training worlds, of each world's largest absolute input correlation (original values)
    meanShares: { channels: 36.1, controls: 36.2, baseline: 27.7 },   // Section 2.3 and Appendix A.2: equally weighted world-level means
    channelShareMiddle90: [5.1, 70.9]    // Section 2.3: middle 90% of world-level channel shares
  },

  // Appendix B of the PR #36 paper (commit 499be45): Sections B.2-B.8,
  // Table 8 (network dimensions), Table 9 (training configuration),
  // Eqs. (30), (32), (33) and (34). Training run profile-c-9add72ea6d35;
  // released weights pymc-labs/mfm river-1 @ 970e609. PR #29 benchmark run
  // pr29-final-full-e35866e (inference runtime pymc-mfm 44521b6, results 10b785a).
  network: {
    params: 2443583,                 // B.4: trainable parameters
    encoderBlocks: 4,                // Table 8
    width: 128,                      // Table 8
    heads: 8,                        // Table 8
    headWidth: 16,                   // Table 8
    ffnWidth: 512,                   // Table 8
    cellFeatures: 31,                // B.3; Table 8 (cell projection 31 -> 128)
    encoderInput: [208, 21, 31],     // B.4: weeks x (10 channels + 10 controls + sales) x features
    padded: { K: 10, M: 10, J: 1 },  // B.4
    graphSlots: 321,                 // B.5
    graphFamilies: 8,                // B.5
    // B.5 family list with K = M = 10, J = 1 and no self-edges. The paper does not
    // state these per-family counts; they follow from B.4 and B.5:
    // channel->sales 10, control->sales 10 (the two direct-edge types of A.1.1);
    // latent->channel 10, latent->control 10, latent->sales 1,
    // channel->channel 90, control->channel 100, control->control 90 (zero in River's prior).
    graphSlotsUsed: 20,              // derived (10 + 10); not stated in the paper
    graphFamiliesUsed: 2,            // A.1.1: two direct-edge types
    graphSlotsZero: 301,             // derived (321 - 20); not stated in the paper
    graphFamiliesZero: 6,            // derived (8 - 2)
    routerCoordsPerWeek: 346,        // B.5
    decoderCoords: 25,               // B.5: 1 + K + M + 4
    contextLengths: [75, 99, 123, 147, 171, 207],   // B.2, B.8: training views
    noiseRho: 0.98,                  // B.6, Eq. (30)
    eulerSteps: 16,                  // B.6.1
    draws: 256,                      // 4.1, B.6.1: benchmark draws per world, horizon and window
    checkpointStep: 62500,           // Table 9; B.8: the final checkpoint
    lossWeights: { jointQuery: 1, jointContext: 0.5, condQuery: 1, condContext: 0.5, struct: 1, graphInContext: 0.1 }  // Eqs. (33), (34)
  },

  // Section 4.1 of the paper (PR #36, commit 499be45): evaluation design.
  // Run pr29-final-full-e35866e, results at MarketingFoundationalModels 10b785a.
  evaluation: {
    cases: 500,
    conditions: 5,
    casesPerCondition: 100,
    distinctWorlds: 300,     // full inputs and both omissions share 100 base worlds (Appendix C.10: 300 base worlds)
    views: 1500,             // 500 cases x 3 horizons (Section 4.1)
    // The three horizons of the paper (Section 4.1), drawn in the result scenes of slides 15 and 16.
    horizons: [{ context: 99, query: 109 }, { context: 185, query: 23 }, { context: 207, query: 1 }],
    conditionNames: ['Full inputs', 'In-sample saturation recovery', 'Smooth baseline', 'Omitted channel', 'Omitted control'],
    outOfPrior: ['Omitted channel', 'Omitted control']
  },

  // Table 12 (Appendix C.6) of the paper, PR #36 commit 499be45: query channel CRPS of
  // window-mean contributions, mean over the n defined worlds, context sales scale (lower is better).
  // Run pr29-final-full-e35866e, experiments/benchmark/results at 10b785a.
  // mmm: native PyMC-Marketing column of Table 12 (the MMM runs in all five conditions).
  // Rows per condition in horizon order 99, 185, 207 (the dot plot groups consecutive rows).
  crpsChannels: [
    { condition: 'Full inputs', context: 99, n: 100, mfm: 0.0295, pathmc: 0.0370, ols: 0.2136, mmm: 0.0659 },
    { condition: 'Full inputs', context: 185, n: 100, mfm: 0.0241, pathmc: 0.0365, ols: 0.1322, mmm: 0.0580 },
    { condition: 'Full inputs', context: 207, n: 100, mfm: 0.0263, pathmc: 0.0396, ols: 0.1175, mmm: 0.0596 },
    { condition: 'In-sample saturation', context: 99, n: 100, mfm: 0.0313, pathmc: 0.0444, ols: 0.2342, mmm: 0.0699 },
    { condition: 'In-sample saturation', context: 185, n: 100, mfm: 0.0279, pathmc: 0.0433, ols: 0.1586, mmm: 0.0647 },
    { condition: 'In-sample saturation', context: 207, n: 100, mfm: 0.0268, pathmc: 0.0477, ols: 0.1857, mmm: 0.0629 },
    { condition: 'Smooth baseline', context: 99, n: 100, mfm: 0.0325, pathmc: 0.0512, ols: 0.1065, mmm: 0.0612 },
    { condition: 'Smooth baseline', context: 185, n: 100, mfm: 0.0283, pathmc: 0.0541, ols: 0.0836, mmm: 0.0438 },
    { condition: 'Smooth baseline', context: 207, n: 100, mfm: 0.0278, pathmc: 0.0512, ols: 0.0933, mmm: 0.0403 },
    { condition: 'Omitted channel', context: 99, n: 84, mfm: 0.0249, pathmc: 0.0286, ols: 0.1708, mmm: 0.0675 },
    { condition: 'Omitted channel', context: 185, n: 84, mfm: 0.0203, pathmc: 0.0356, ols: 0.0915, mmm: 0.0522 },
    { condition: 'Omitted channel', context: 207, n: 84, mfm: 0.0224, pathmc: 0.0360, ols: 0.0947, mmm: 0.0543 },
    { condition: 'Omitted control', context: 99, n: 100, mfm: 0.0315, pathmc: 0.0403, ols: 0.2079, mmm: 0.0670 },
    { condition: 'Omitted control', context: 185, n: 100, mfm: 0.0252, pathmc: 0.0430, ols: 0.1290, mmm: 0.0611 },
    { condition: 'Omitted control', context: 207, n: 100, mfm: 0.0275, pathmc: 0.0463, ols: 0.1178, mmm: 0.0575 }
  ],

  // Section 4.3 "Graph recovery" and Appendix C.10 of the academic paper, PR #36 (commit 499be45).
  // Study structure_accuracy of run pr29-final-full-e35866e (code e35866e, results 10b785a):
  // 100 full-input worlds; 2,048 router graph draws per view; an edge is selected when its
  // marginal probability is >= 0.5. Precision and recall are means over eligible worlds.
  // Contexts 99 and 207 repeat the earlier run structure-91de88629ca3 exactly (same seeds);
  // context 185 is new.
  structure: {
    channels: {
      99: { precision: 0.887, recall: 0.903, exact: 0.45 },
      185: { precision: 0.889, recall: 0.908, exact: 0.51 },
      207: { precision: 0.920, recall: 0.868, exact: 0.49 }
    },
    channelsAndControlsExact: { 99: 0.17, 185: 0.19, 207: 0.19 },
    // Section 4.3 "Graph banks" and Figure 3: worlds (of 100) whose bank of 2,048 draws contains
    // the true complete active graph, and share of worlds whose most frequent graph is the true one.
    trueGraphInBank: { 99: 82, 185: 84, 207: 86 },
    fullGraphModeExact: { 99: 0.17, 185: 0.18, 207: 0.20 }
  },

  // Section 4.5 and Appendix C.10 of the paper (PR #36, commit 499be45): unit invariance.
  // Study units_invariance, run pr29-final-full-e35866e (experiments/units_invariance/results at 10b785a):
  // the 100 full-input worlds at contexts 99, 185 and 207, both windows (600 views), ten positive
  // unit systems, 256 draws per call. Not tested: offsets, nonpositive factors, arbitrary inputs, all seeds.
  units: {
    factors: [0.001, 1000],
    maxChange: '8.0 × 10⁻¹⁶',   // largest paired-draw change, share of sales scale (Appendix C.10); Section 4.5: 8.005 × 10⁻¹⁶
    drawPairs: 1536000,
    graphFlips: 0
  },
  // Section 4.5, Appendix C.12 and Table 22 of the paper (PR #36, commit 499be45): query latency.
  // Study query_timing, run pr29-final-full-e35866e (experiments/query_timing/results at 10b785a):
  // 100 twelve-channel, three-control worlds (not the benchmark worlds); 4,000 returned trajectories
  // per call; medians over worlds, in seconds; keys are context weeks (query weeks: evaluation.horizons).
  // River uses CUDA, the native MMM uses CPU, in paired L4 containers with eight CPU cores.
  // Device-specific: the paper says these times do not establish an end-to-end speedup.
  // The old 1,200-draw headline (0.39 s, about 190x) is historical (Appendix C.14).
  cost: {
    draws: 4000,
    mfmFirst: { 99: 113.78, 185: 22.81, 207: 1.25 },
    mfmWarm: { 99: 113.61, 185: 22.77, 207: 1.25 },
    mmmFitPlusFirst: { 99: 238.66, 185: 355.82, 207: 387.30 },   // median of per-world sums
    mmmWarm: { 99: 4.04, 185: 2.47, 207: 2.08 },
    mmmUnhealthyFits: '290 of 300'   // Appendix C.12: fail the sampler health rule; none excluded
  },

  // Sections 4.2, 4.6 and 4.8 of the paper (PR #36, commit 499be45): limits. Main benchmark,
  // run pr29-final-full-e35866e (experiments/benchmark/results at 10b785a), 100 full-input worlds.
  limits: {
    // Section 4.8: mean query channel CRPS. Oracle: Table 20 (benchmark fits); River: Table 12.
    oracleChannelCrps: {
      99: { oracle: 0.0185, mfm: 0.0295 },
      185: { oracle: 0.0141, mfm: 0.0241 },
      207: { oracle: 0.0139, mfm: 0.0263 }
    },
    // Section 4.2 and Table 16: mean query weekly noise-free-total CRPS, full inputs.
    // Context 207 (one query week): all three references are lower in every condition.
    weeklyTotal: {
      99: { mfm: 0.0514, pathmc: 0.0722, ols: 0.1110, mmm: 0.1246 },
      185: { mfm: 0.0422, pathmc: 0.0312, ols: 0.0388, mmm: 0.0206 },
      207: { mfm: 0.0384, pathmc: 0.0213, ols: 0.0290, mmm: 0.0085 }
    },
    // Section 4.6, Figure 2 and Table 18: weekly central 95% intervals for observed sales at
    // context 207 (one query week). Worlds covered, of 100; mean width, % of the context sales scale.
    // River has no observation-noise draws.
    coverage95OneWeek: { mfm: 99, oracle: 95, mfmWidth: 49.54, oracleWidth: 12.12 },
    // Section 4.6 and Table 19: River central 80% coverage, %, of channel and control window means;
    // full inputs, context 99 (109 query weeks). Appendix C.8: bias can also cause under-coverage.
    coverage80LongQuery: { channels: 58.88, controls: 67.99 }
  }
};
