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
    // The two horizons drawn in the result scenes (slides 15 and 16; the scenes have two colours).
    horizons: [{ context: 99, query: 109 }, { context: 207, query: 1 }],
    // All horizons of the paper (Section 4.1); 185 is in the tables and slide 14, not in the plots.
    paperHorizons: [{ context: 99, query: 109 }, { context: 185, query: 23 }, { context: 207, query: 1 }],
    conditionNames: ['Full inputs', 'In-sample saturation recovery', 'Smooth baseline', 'Omitted channel', 'Omitted control'],
    outOfPrior: ['Omitted channel', 'Omitted control']
  },

  // Table 12 (Appendix C.6) of the paper, PR #36 commit 499be45: query channel CRPS of
  // window-mean contributions, mean over the n defined worlds, context sales scale (lower is better).
  // Run pr29-final-full-e35866e, experiments/benchmark/results at 10b785a.
  // wins: strictly lower than PathMC and OLS on the same world ("Joint wins P and O"; excludes MMM).
  // mmm: native PyMC-Marketing column of Table 12 (not plotted).
  // Plotted horizons only (99, 207). Table 12 rows at context 185 (River / PathMC / OLS / MMM, wins):
  //   Full inputs 0.0241 / 0.0365 / 0.1322 / 0.0580, 52/100; In-sample saturation 0.0279 / 0.0433 / 0.1586 / 0.0647, 61/100;
  //   Smooth baseline 0.0283 / 0.0541 / 0.0836 / 0.0438, 62/100; Omitted channel 0.0203 / 0.0356 / 0.0915 / 0.0522, 45/84;
  //   Omitted control 0.0252 / 0.0430 / 0.1290 / 0.0611, 49/100.
  // Section 4.2: River beats both PathMC and OLS in a majority of worlds in 11 of 15 rows.
  crpsChannels: [
    { condition: 'Full inputs', context: 99, n: 100, mfm: 0.0295, pathmc: 0.0370, ols: 0.2136, mmm: 0.0659, wins: '63/100' },
    { condition: 'Full inputs', context: 207, n: 100, mfm: 0.0263, pathmc: 0.0396, ols: 0.1175, mmm: 0.0596, wins: '48/100' },
    { condition: 'In-sample saturation', context: 99, n: 100, mfm: 0.0313, pathmc: 0.0444, ols: 0.2342, mmm: 0.0699, wins: '73/100' },
    { condition: 'In-sample saturation', context: 207, n: 100, mfm: 0.0268, pathmc: 0.0477, ols: 0.1857, mmm: 0.0629, wins: '58/100' },
    { condition: 'Smooth baseline', context: 99, n: 100, mfm: 0.0325, pathmc: 0.0512, ols: 0.1065, mmm: 0.0612, wins: '70/100' },
    { condition: 'Smooth baseline', context: 207, n: 100, mfm: 0.0278, pathmc: 0.0512, ols: 0.0933, mmm: 0.0403, wins: '63/100' },
    { condition: 'Omitted channel', context: 99, n: 84, mfm: 0.0249, pathmc: 0.0286, ols: 0.1708, mmm: 0.0675, wins: '49/84' },
    { condition: 'Omitted channel', context: 207, n: 84, mfm: 0.0224, pathmc: 0.0360, ols: 0.0947, mmm: 0.0543, wins: '37/84' },
    { condition: 'Omitted control', context: 99, n: 100, mfm: 0.0315, pathmc: 0.0403, ols: 0.2079, mmm: 0.0670, wins: '62/100' },
    { condition: 'Omitted control', context: 207, n: 100, mfm: 0.0275, pathmc: 0.0463, ols: 0.1178, mmm: 0.0575, wins: '50/100' }
  ],

  // Table 20 (Appendix C.10) of the paper, PR #36 commit 499be45: separate PyMC-Marketing study on
  // the 100 full-input worlds (run pr29-final-full-e35866e, experiments/mmm_accuracy/results at 10b785a).
  // River and the MMM run separately from the main benchmark, so River's values differ slightly
  // from Table 12. OLS and oracle come from the same run's benchmark fits.
  // MMM (Appendix C.4): PyMC-Marketing 1.2.0, time-varying intercept, eight-lag geometric adstock,
  // logistic saturation, library-default priors; nutpie, 8 chains x 500 draws, 1,000 tuning steps.
  pymcMarketing: {
    version: '1.2',
    timeVaryingIntercept: true,
    rows: [
      { quantity: 'Baseline', context: 99, mfm: 0.0447, pymc: 0.2276, ols: 9.0776, oracle: 0.0304 },
      { quantity: 'Baseline', context: 185, mfm: 0.0433, pymc: 0.1748, ols: 4.3546, oracle: 0.0266 },
      { quantity: 'Baseline', context: 207, mfm: 0.0447, pymc: 0.1848, ols: 5.0234, oracle: 0.0257 },
      { quantity: 'Channels', context: 99, mfm: 0.0299, pymc: 0.0629, ols: 0.2136, oracle: 0.0185 },
      { quantity: 'Channels', context: 185, mfm: 0.0242, pymc: 0.0589, ols: 0.1322, oracle: 0.0141 },
      { quantity: 'Channels', context: 207, mfm: 0.0261, pymc: 0.0573, ols: 0.1175, oracle: 0.0139 },
      { quantity: 'Controls', context: 99, mfm: 0.0318, pymc: 0.1819, ols: 1.5790, oracle: 0.0208 },
      { quantity: 'Controls', context: 185, mfm: 0.0295, pymc: 0.1627, ols: 1.3983, oracle: 0.0178 },
      { quantity: 'Controls', context: 207, mfm: 0.0295, pymc: 0.1604, ols: 1.4994, oracle: 0.0182 },
      { quantity: 'Noise-free total, weekly', context: 99, mfm: 0.0519, pymc: 0.0835, ols: 0.1110, oracle: 0.0331 },
      { quantity: 'Noise-free total, weekly', context: 185, mfm: 0.0419, pymc: 0.0207, ols: 0.0388, oracle: 0.0145 },
      { quantity: 'Noise-free total, weekly', context: 207, mfm: 0.0385, pymc: 0.0083, ols: 0.0290, oracle: 0.0073 }
    ],
    // Section 4.2: MMM channel CRPS / River channel CRPS, ratios of cohort means, by context.
    channelRatio: { 99: 2.11, 185: 2.44, 207: 2.20 },
    riverShare: '41%–48%',          // Section 4.2: River's share of the MMM's mean channel CRPS
    unhealthyFits: '288 of 300'     // Appendix C.10: fits failing at least one health criterion; none excluded
  },

  // Section 4.3 "Graph recovery" and Appendix C.10 of the academic paper, PR #36 (commit 499be45).
  // Study structure_accuracy of run pr29-final-full-e35866e (code e35866e, results 10b785a):
  // 100 full-input worlds; 2,048 router graph draws per view; an edge is selected when its
  // marginal probability is >= 0.5. Precision and recall are means over eligible worlds.
  // ece: channel edge-pooled ten-bin expected calibration error. Contexts 99 and 207 repeat
  // the earlier run structure-91de88629ca3 exactly (same seeds); context 185 is new.
  structure: {
    channels: {
      99: { precision: 0.887, recall: 0.903, exact: 0.45, ece: 0.040 },
      185: { precision: 0.889, recall: 0.908, exact: 0.51, ece: 0.039 },
      207: { precision: 0.920, recall: 0.868, exact: 0.49, ece: 0.067 }
    },
    channelsAndControlsExact: { 99: 0.17, 185: 0.19, 207: 0.19 },
    // Section 4.3 "Graph banks" and Figure 3: worlds (of 100) whose bank of 2,048 draws contains
    // the true complete active graph, and share of worlds whose most frequent graph is the true one.
    trueGraphInBank: { 99: 82, 185: 84, 207: 86 },
    fullGraphModeExact: { 99: 0.17, 185: 0.18, 207: 0.20 },
    // Reliability bins, router, channel edges: mean probability p, observed frequency f, edges n.
    // Not printed in the paper. From experiments/structure_accuracy/results/analysis/
    // structure_accuracy/calibration_bins.csv at 499be45 (sha256 8c3c89db10d9).
    reliability: {
      99: [
        { p: 0.0244, f: 0.1067, n: 75 }, { p: 0.1454, f: 0.1875, n: 32 }, { p: 0.2475, f: 0.3158, n: 19 },
        { p: 0.3573, f: 0.3684, n: 19 }, { p: 0.4547, f: 0.3333, n: 21 }, { p: 0.5553, f: 0.5926, n: 27 },
        { p: 0.6591, f: 0.5185, n: 27 }, { p: 0.7526, f: 0.7609, n: 46 }, { p: 0.8515, f: 0.8667, n: 60 },
        { p: 0.9859, f: 0.9637, n: 248 }
      ],
      185: [
        { p: 0.0358, f: 0.0723, n: 83 }, { p: 0.1453, f: 0.2903, n: 31 }, { p: 0.2346, f: 0.1333, n: 15 },
        { p: 0.3347, f: 0.4091, n: 22 }, { p: 0.4518, f: 0.4231, n: 26 }, { p: 0.5516, f: 0.5185, n: 27 },
        { p: 0.6519, f: 0.7073, n: 41 }, { p: 0.7440, f: 0.8085, n: 47 }, { p: 0.8439, f: 0.9000, n: 50 },
        { p: 0.9879, f: 0.9784, n: 232 }
      ],
      207: [
        { p: 0.0371, f: 0.1127, n: 71 }, { p: 0.1421, f: 0.1000, n: 40 }, { p: 0.2483, f: 0.2812, n: 32 },
        { p: 0.3350, f: 0.4286, n: 28 }, { p: 0.4494, f: 0.6061, n: 33 }, { p: 0.5520, f: 0.7059, n: 51 },
        { p: 0.6403, f: 0.8205, n: 39 }, { p: 0.7441, f: 0.8750, n: 32 }, { p: 0.8497, f: 0.8000, n: 35 },
        { p: 0.9911, f: 1.0000, n: 213 }
      ]
    }
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
  // per call; medians over worlds, in seconds; keys are context weeks (query weeks: evaluation.paperHorizons).
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
