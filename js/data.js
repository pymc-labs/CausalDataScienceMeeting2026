/* ==========================================================================
   Every number shown in the deck, in one place, with its source.
   Source: academic paper draft in pymc-labs/MarketingFoundationalModels PR #28
   (branch agent/paper-scaffold, commit 1f0bfbc), "Marketing Foundational
   Models: Amortized Bayesian Inference over Mixtures of Marketing Mix Models".
   Section and table numbers refer to that PDF.
   ========================================================================== */
window.DECK_DATA = {
  source: {
    paper: 'Trujillo, Säilynoja, Saldarriaga, Hayashi, Wiecki, Fiaschi. Marketing Foundational Models: Amortized Bayesian Inference over Mixtures of Marketing Mix Models. PyMC Labs, October 2026 (draft, PR #28).',
    commit: '1f0bfbc'
  },

  // Section 2 and 2.1-2.3: the prior.
  prior: {
    worlds: 200000,
    train: 196000,
    holdout: 4000,
    combinations: 50,          // 10 response/carryover choices x 5 input settings
    responseChoices: 10,       // five response choices, with or without geometric carryover
    inputSettings: ['calm', 'hectic', 'mixed', 'spiky inputs', 'hectic baseline'],
    worldsPerCombination: 4000,
    weeks: 208,
    channels: [1, 10],
    controls: [1, 10],
    maxInputCorrelationMedian: 0.943,    // Appendix A: median over 1,000 sampled training worlds of the largest |correlation| between two inputs
    meanShares: { channels: 36.1, controls: 36.2, baseline: 27.7 },
    channelShareMiddle90: [5.1, 70.9]
  },

  // Appendix B: network and training.
  network: {
    params: 2443583,
    encoderBlocks: 4,
    width: 128,
    heads: 8,
    headWidth: 16,
    ffnWidth: 512,
    cellFeatures: 31,
    encoderInput: [208, 21, 31],   // weeks x (10 channels + 10 controls + sales) x features
    padded: { K: 10, M: 10, J: 1 },
    graphSlots: 321,
    graphFamilies: 8,
    // Appendix B.5 family list with K = M = 10, J = 1, no self-edges:
    // channel->sales 10, control->sales 10 (used by River's prior);
    // latent->channel 10, latent->control 10, latent->sales 1,
    // channel->channel 90, control->channel 100, control->control 90 (zero in River's prior).
    graphSlotsUsed: 20,
    graphFamiliesUsed: 2,
    graphSlotsZero: 301,
    graphFamiliesZero: 6,
    routerCoordsPerWeek: 346,
    decoderCoords: 25,             // 1 + K + M + 4
    contextLengths: [75, 99, 123, 147, 171, 207],
    noiseRho: 0.98,
    eulerSteps: 16,
    draws: 256,
    checkpointStep: 62500,
    lossWeights: { jointQuery: 1, jointContext: 0.5, condQuery: 1, condContext: 0.5, struct: 1, graphInContext: 0.1 }
  },

  // Section 4.1: evaluation design.
  evaluation: {
    cases: 500,
    conditions: 5,
    casesPerCondition: 100,
    distinctWorlds: 300,     // full inputs and both omissions share 100 base worlds
    views: 1000,
    horizons: [{ context: 99, query: 109 }, { context: 207, query: 1 }],
    conditionNames: ['Full inputs', 'In-sample saturation recovery', 'Smooth baseline', 'Omitted channel', 'Omitted control'],
    outOfPrior: ['Omitted channel', 'Omitted control']
  },

  // Table 1: query channel CRPS of window-mean contributions (lower is better).
  crpsChannels: [
    { condition: 'Full inputs', context: 99, n: 100, mfm: 0.0294, pathmc: 0.0948, ols: 0.2136, wins: '75/100' },
    { condition: 'Full inputs', context: 207, n: 100, mfm: 0.0263, pathmc: 0.1374, ols: 0.1175, wins: '62/100' },
    { condition: 'In-sample saturation', context: 99, n: 100, mfm: 0.0315, pathmc: 0.1366, ols: 0.2342, wins: '78/100' },
    { condition: 'In-sample saturation', context: 207, n: 100, mfm: 0.0268, pathmc: 0.2354, ols: 0.1857, wins: '70/100' },
    { condition: 'Smooth baseline', context: 99, n: 100, mfm: 0.0324, pathmc: 0.0772, ols: 0.1065, wins: '75/100' },
    { condition: 'Smooth baseline', context: 207, n: 100, mfm: 0.0278, pathmc: 0.1620, ols: 0.0933, wins: '72/100' },
    { condition: 'Omitted channel', context: 99, n: 84, mfm: 0.0246, pathmc: 0.1096, ols: 0.1617, wins: '56/84' },
    { condition: 'Omitted channel', context: 207, n: 84, mfm: 0.0224, pathmc: 0.2101, ols: 0.0944, wins: '47/84' },
    { condition: 'Omitted control', context: 99, n: 100, mfm: 0.0310, pathmc: 0.1088, ols: 0.2108, wins: '73/100' },
    { condition: 'Omitted control', context: 207, n: 100, mfm: 0.0275, pathmc: 0.1499, ols: 0.1181, wins: '58/100' }
  ],

  // Table 2: 100 full-input worlds with a PyMC-Marketing model as reference.
  pymcMarketing: {
    version: '1.2',
    rows: [
      { quantity: 'Baseline', context: 99, mfm: 0.0447, pymc: 0.6912, ols: 9.0776, oracle: 0.0302 },
      { quantity: 'Baseline', context: 207, mfm: 0.0447, pymc: 0.7022, ols: 5.0234, oracle: 0.0253 },
      { quantity: 'Channels', context: 99, mfm: 0.0299, pymc: 0.1163, ols: 0.2136, oracle: 0.0185 },
      { quantity: 'Channels', context: 207, mfm: 0.0261, pymc: 0.1223, ols: 0.1175, oracle: 0.0138 },
      { quantity: 'Controls', context: 99, mfm: 0.0318, pymc: 0.2946, ols: 1.5790, oracle: 0.0202 },
      { quantity: 'Controls', context: 207, mfm: 0.0295, pymc: 0.4027, ols: 1.4994, oracle: 0.0185 },
      { quantity: 'Noise-free total, weekly', context: 99, mfm: 0.0519, pymc: 0.0874, ols: 0.1110, oracle: 0.0337 },
      { quantity: 'Noise-free total, weekly', context: 207, mfm: 0.0385, pymc: 0.0187, ols: 0.0290, oracle: 0.0072 }
    ],
    channelRatio: [3.9, 4.7],      // MMM channel CRPS / MFM channel CRPS, contexts 99 and 207
    unhealthyFits: '200 of 200'    // every MMM fit failed at least one health criterion; none excluded
  },

  // Section 4.3: structure recovery on the 100 full-input worlds (router, marginal edge >= 0.5).
  structure: {
    channels: {
      99: { precision: 0.89, recall: 0.90, exact: 0.45, ece: 0.04 },
      207: { precision: 0.92, recall: 0.87, exact: 0.49, ece: 0.07 }
    },
    channelsAndControlsExact: { 99: 0.17, 207: 0.19 },
    // Reliability bins for channel edges, router, from
    // experiments/profile_c_validation/structure_accuracy/structure-91de88629ca3/data/calibration_bins.csv
    reliability: {
      99: [
        { p: 0.0244, f: 0.1067, n: 75 }, { p: 0.1454, f: 0.1875, n: 32 }, { p: 0.2475, f: 0.3158, n: 19 },
        { p: 0.3573, f: 0.3684, n: 19 }, { p: 0.4547, f: 0.3333, n: 21 }, { p: 0.5553, f: 0.5926, n: 27 },
        { p: 0.6591, f: 0.5185, n: 27 }, { p: 0.7526, f: 0.7609, n: 46 }, { p: 0.8515, f: 0.8667, n: 60 },
        { p: 0.9859, f: 0.9637, n: 248 }
      ],
      207: null // filled below from the same file
    }
  },

  // Section 4.4: units and cost.
  units: {
    factors: [0.001, 1000],
    maxChange: '8 × 10⁻¹⁶',
    drawPairs: 1024000,
    graphFlips: 0
  },
  cost: {
    // Separate twelve-channel cohort, 1,200 draws, L4 GPU vs 8 CPU cores; indicative only.
    mfmOneWeek: 0.39, mfm109Weeks: 42,
    pymcOneWeek: 74, pymc109Weeks: 55,
    pymcPredictOnly: 0.4,
    ratioOneWeek: 190
  },

  // Sections 4.5 and 4.6: limits.
  limits: {
    oracleChannelCrps: { 99: { oracle: 0.0185, mfm: 0.0294 }, 207: { oracle: 0.0138, mfm: 0.0263 } },
    oneWeekTotal: { mfm: 0.0384, pathmc: 0.0188, ols: 0.0290, winsVsPathmc: '17/100' },
    coverage95OneWeek: { mfm: 99, oracle: 96, mfmWidth: 49.5, oracleWidth: 12.1 }
  }
};

window.DECK_DATA.structure.reliability[207] = [
  { p: 0.0371, f: 0.1127, n: 71 }, { p: 0.1421, f: 0.1000, n: 40 }, { p: 0.2483, f: 0.2812, n: 32 },
  { p: 0.3350, f: 0.4286, n: 28 }, { p: 0.4494, f: 0.6061, n: 33 }, { p: 0.5520, f: 0.7059, n: 51 },
  { p: 0.6403, f: 0.8205, n: 39 }, { p: 0.7441, f: 0.8750, n: 32 }, { p: 0.8497, f: 0.8000, n: 35 },
  { p: 0.9911, f: 1.0000, n: 213 }
];
