import type {
  BusinessAccount,
  CommissionEntry,
  EarningsSummary,
  RoutingItem,
  Survey,
} from '@/types/dawuro';

/**
 * Seed data for the Dawuro platform.
 *
 * Deterministic, so the app demonstrates identically every launch. Replaced by
 * the API once the backend implements the platform endpoints; the shapes match
 * @/types/dawuro so that swap is wiring, not a rewrite.
 */

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAhead = (d: number): string => new Date(Date.now() + d * 86_400_000).toISOString();

// ─── platform owner ────────────────────────────────────────────────────────

/**
 * Platform operators are seeded, never self-registered.
 *
 * The role can route reports, approve businesses and release payouts — it is
 * not something an open sign-up form should ever be able to create. In
 * production these come from an internal provisioning process; here they are
 * fixed credentials so the module can be demonstrated.
 */
export const PLATFORM_OWNERS = [
  {
    id: 'own_001',
    email: 'owner@dawuro.gh',
    displayName: 'Platform Operations',
    // Demo credential only. Real deployments provision these out of band.
    accessCode: 'DAWURO-2026',
    title: 'Head of Operations',
  },
  {
    id: 'own_002',
    email: 'routing@dawuro.gh',
    displayName: 'Routing Desk',
    accessCode: 'DAWURO-2026',
    title: 'Routing Operator',
  },
] as const;

// ─── demo sign-ins ─────────────────────────────────────────────────────────

/**
 * Seeded accounts so all three experiences can be walked without a backend.
 *
 * The password is the same across every demo account on purpose — this is a
 * simulation for evaluating the product, not a security surface. Real accounts
 * come from registration, and these disappear when the API is connected.
 */
export const DEMO_PASSWORD = 'dawuro';

export interface DemoLogin {
  email: string;
  displayName: string;
  accountType: 'reporter' | 'business' | 'platform_owner';
  /** Set for business accounts — links the login to a seeded organisation. */
  businessId?: string;
  businessName?: string;
  /** What this account is useful for demonstrating. */
  showcases: string;
}

export const DEMO_LOGINS: DemoLogin[] = [
  {
    email: 'ama@example.gh',
    displayName: 'Ama Kufuor',
    accountType: 'reporter',
    showcases: 'Capture, earnings ledger, mobile-money payout',
  },
  {
    email: 'kwesi@example.gh',
    displayName: 'Kwesi Boateng',
    accountType: 'reporter',
    showcases: 'A second reporter, for comparing feeds',
  },
  {
    email: 'ops@ama.gov.gh',
    displayName: 'AMA Operations',
    accountType: 'business',
    businessId: 'biz_ama',
    businessName: 'Accra Metropolitan Assembly',
    showcases: 'Report inbox near its monthly allowance',
  },
  {
    email: 'newsroom@joynews.gh',
    displayName: 'Joy Newsroom',
    accountType: 'business',
    businessId: 'biz_joy',
    businessName: 'Joy News',
    showcases: 'Media-house inbox — disorder, fire, corruption',
  },
  {
    email: 'control@nadmo.gov.gh',
    displayName: 'NADMO Control',
    accountType: 'business',
    businessId: 'biz_nadmo',
    businessName: 'NADMO',
    showcases: 'Enterprise tier, high volume',
  },
  {
    email: 'owner@dawuro.gh',
    displayName: 'Platform Operations',
    accountType: 'platform_owner',
    showcases: 'Console, approvals, routing override, payouts',
  },
];

export function findDemoLogin(email: string): DemoLogin | undefined {
  return DEMO_LOGINS.find((l) => l.email.toLowerCase() === email.trim().toLowerCase());
}

// ─── businesses ────────────────────────────────────────────────────────────

export const BUSINESSES: BusinessAccount[] = [
  {
    id: 'biz_ec',
    name: 'Electoral Commission of Ghana',
    sector: 'government',
    verified: true,
    tier: 'enterprise',
    subscriptionStatus: 'active',
    renewsAtIso: daysAhead(18),
    seatsUsed: 17,
    reportsUsedThisPeriod: 642,
    interests: ['disorder', 'crime', 'infrastructure'],
    logoUrl: null,
  },
  {
    id: 'biz_ama',
    name: 'Accra Metropolitan Assembly',
    sector: 'government',
    verified: true,
    tier: 'professional',
    subscriptionStatus: 'active',
    renewsAtIso: daysAhead(6),
    seatsUsed: 9,
    reportsUsedThisPeriod: 118,
    interests: ['flood', 'infrastructure', 'environment', 'utility'],
    logoUrl: null,
  },
  {
    id: 'biz_ecg',
    name: 'Electricity Company of Ghana',
    sector: 'utility',
    verified: true,
    tier: 'professional',
    subscriptionStatus: 'active',
    renewsAtIso: daysAhead(23),
    seatsUsed: 6,
    reportsUsedThisPeriod: 87,
    interests: ['utility', 'infrastructure'],
    logoUrl: null,
  },
  {
    id: 'biz_joy',
    name: 'Joy News',
    sector: 'media',
    verified: true,
    tier: 'professional',
    subscriptionStatus: 'active',
    renewsAtIso: daysAhead(11),
    seatsUsed: 12,
    reportsUsedThisPeriod: 149,
    interests: ['disorder', 'fire', 'accident', 'corruption'],
    logoUrl: null,
  },
  {
    id: 'biz_nadmo',
    name: 'NADMO',
    sector: 'government',
    verified: true,
    tier: 'enterprise',
    subscriptionStatus: 'active',
    renewsAtIso: daysAhead(29),
    seatsUsed: 24,
    reportsUsedThisPeriod: 411,
    interests: ['flood', 'fire', 'accident', 'health'],
    logoUrl: null,
  },
  {
    id: 'biz_star',
    name: 'Star Assurance',
    sector: 'insurance',
    verified: false,
    tier: 'starter',
    subscriptionStatus: 'trialing',
    renewsAtIso: daysAhead(4),
    seatsUsed: 2,
    reportsUsedThisPeriod: 9,
    interests: ['accident', 'fire', 'flood'],
    logoUrl: null,
  },
];

// ─── reporter earnings ─────────────────────────────────────────────────────

export const EARNINGS_SUMMARY: EarningsSummary = {
  pendingPesewas: 8_450,
  paidPesewas: 46_200,
  lifetimePesewas: 54_650,
  reportsLicensed: 31,
  payoutThresholdPesewas: 10_000,
  nextPayoutIso: daysAhead(5),
};

export const COMMISSION_LEDGER: CommissionEntry[] = [
  {
    id: 'cm_1',
    incidentId: 'inc_01JBX7V2R5',
    incidentSummary: 'Market stall fire spreading along the row',
    category: 'fire',
    businessName: 'NADMO',
    status: 'earned',
    amountPesewas: 2_625,
    createdAtIso: hoursAgo(3),
    paidAtIso: null,
  },
  {
    id: 'cm_2',
    incidentId: 'inc_01JBX7Q2K9',
    incidentSummary: 'Culvert blocked at the Kaneshie junction',
    category: 'flood',
    businessName: 'Accra Metropolitan Assembly',
    status: 'earned',
    amountPesewas: 2_100,
    createdAtIso: hoursAgo(9),
    paidAtIso: null,
  },
  {
    id: 'cm_3',
    incidentId: 'inc_01JBX7W4S8',
    incidentSummary: 'Transformer humming and flashing',
    category: 'utility',
    businessName: 'Electricity Company of Ghana',
    status: 'earned',
    amountPesewas: 1_575,
    createdAtIso: hoursAgo(26),
    paidAtIso: null,
  },
  {
    id: 'cm_4',
    incidentId: 'inc_01JBX7R4M2',
    incidentSummary: 'Two-car collision on Spintex Road',
    category: 'accident',
    businessName: null,
    status: 'pending',
    amountPesewas: 2_150,
    createdAtIso: hoursAgo(1),
    paidAtIso: null,
  },
  {
    id: 'cm_5',
    incidentId: 'inc_old_1',
    incidentSummary: 'Illegal dumping behind the school',
    category: 'environment',
    businessName: 'Accra Metropolitan Assembly',
    status: 'paid',
    amountPesewas: 2_310,
    createdAtIso: hoursAgo(180),
    paidAtIso: hoursAgo(120),
  },
  {
    id: 'cm_6',
    incidentId: 'inc_old_2',
    incidentSummary: 'Blocked drain on the Ring Road',
    category: 'flood',
    businessName: 'NADMO',
    status: 'paid',
    amountPesewas: 1_400,
    createdAtIso: hoursAgo(320),
    paidAtIso: hoursAgo(120),
  },
  {
    id: 'cm_7',
    incidentId: 'inc_old_3',
    incidentSummary: 'Footage did not show the described incident',
    category: 'other',
    businessName: null,
    status: 'void',
    amountPesewas: 0,
    createdAtIso: hoursAgo(400),
    paidAtIso: null,
  },
];

// ─── platform routing queue ────────────────────────────────────────────────

export const ROUTING_QUEUE: RoutingItem[] = [
  {
    id: 'rt_1',
    incidentId: 'inc_01JBX7R4M2',
    summary: 'Two-car collision on the Spintex Road stretch near the Palace Mall exit.',
    category: 'accident',
    destination: 'marketplace',
    requestedBusinessIds: [],
    suggestedBusinessIds: ['biz_nadmo', 'biz_joy', 'biz_star'],
    reporterHandle: '@kwesi',
    submittedAtIso: hoursAgo(1),
    status: 'awaiting_routing',
    locationLabel: 'Spintex Road, Accra',
    thumbnailUrl: 'https://loremflickr.com/200/200/car,accident?lock=2',
  },
  {
    id: 'rt_2',
    incidentId: 'inc_01JBX7S6P7',
    summary: 'Galamsey activity visible from the riverbank, water discoloured downstream.',
    category: 'environment',
    destination: 'directed',
    requestedBusinessIds: ['biz_joy'],
    suggestedBusinessIds: ['biz_ama'],
    reporterHandle: '@anonymous',
    submittedAtIso: hoursAgo(2),
    status: 'awaiting_routing',
    locationLabel: null,
    thumbnailUrl: 'https://loremflickr.com/200/200/river,mining?lock=3',
  },
  {
    id: 'rt_3',
    incidentId: 'inc_01JBX7W4S8',
    summary: 'Third power cut today. Transformer humming loudly, visible flash.',
    category: 'utility',
    destination: 'both',
    requestedBusinessIds: ['biz_ecg'],
    suggestedBusinessIds: ['biz_ecg', 'biz_ama'],
    reporterHandle: '@ama',
    submittedAtIso: hoursAgo(5),
    status: 'awaiting_routing',
    locationLabel: 'Adenta, Accra',
    thumbnailUrl: 'https://loremflickr.com/200/200/powerline,pole?lock=6',
  },
  {
    id: 'rt_4',
    incidentId: 'inc_01JBX7T8Q1',
    summary: 'Streetlight pole down across the pavement, cable exposed.',
    category: 'infrastructure',
    destination: 'marketplace',
    requestedBusinessIds: [],
    suggestedBusinessIds: ['biz_ama', 'biz_ecg'],
    reporterHandle: '@yaw',
    submittedAtIso: hoursAgo(11),
    status: 'routed',
    locationLabel: 'Achimota, Accra',
    thumbnailUrl: 'https://loremflickr.com/200/200/streetlight,road?lock=4',
  },
];

// ─── surveys ───────────────────────────────────────────────────────────────

export const SURVEYS: Survey[] = [
  {
    id: 'sv_1',
    businessId: 'biz_ama',
    businessName: 'Accra Metropolitan Assembly',
    title: 'Drainage before the rains',
    description:
      'Help us find blocked drains before the season starts. Two questions and one photo.',
    questions: [
      {
        id: 'q1',
        kind: 'single_choice',
        prompt: 'Is the drain near you currently blocked?',
        options: ['Completely blocked', 'Partly blocked', 'Flowing freely', 'No drain nearby'],
        required: true,
      },
      {
        id: 'q2',
        kind: 'scale',
        prompt: 'How badly does your street flood in heavy rain?',
        required: true,
      },
      { id: 'q3', kind: 'photo', prompt: 'Add a photo of the drain', required: false },
    ],
    rewardPesewas: 500,
    targetArea: { latitude: 5.6037, longitude: -0.187, radiusM: 15_000 },
    responsesTarget: 500,
    responsesReceived: 317,
    closesAtIso: daysAhead(12),
    status: 'live',
  },
  {
    id: 'sv_2',
    businessId: 'biz_ecg',
    businessName: 'Electricity Company of Ghana',
    title: 'Outage frequency, Adenta and Madina',
    description: 'Three quick questions about power reliability where you live.',
    questions: [
      {
        id: 'q1',
        kind: 'single_choice',
        prompt: 'How many outages have you had this week?',
        options: ['None', '1–2', '3–5', 'More than 5'],
        required: true,
      },
      {
        id: 'q2',
        kind: 'multi_choice',
        prompt: 'What happens when the power returns?',
        options: ['Voltage surges', 'Appliances trip', 'Lights flicker', 'Nothing unusual'],
        required: true,
      },
      { id: 'q3', kind: 'text', prompt: 'Anything else we should know?', required: false },
    ],
    rewardPesewas: 350,
    targetArea: { latitude: 5.7089, longitude: -0.1667, radiusM: 8_000 },
    responsesTarget: 300,
    responsesReceived: 41,
    closesAtIso: daysAhead(20),
    status: 'live',
  },
];

// ─── pending business applications ─────────────────────────────────────────

export interface BusinessApplication {
  id: string;
  organisationName: string;
  sector: BusinessAccount['sector'];
  contactName: string;
  email: string;
  phone: string;
  registrationNumber: string;
  requestedTier: BusinessAccount['tier'];
  interests: BusinessAccount['interests'];
  submittedAtIso: string;
  status: 'pending' | 'approved' | 'rejected';
  /** Anything an operator should weigh before granting access to footage. */
  flags: string[];
}

export const BUSINESS_APPLICATIONS: BusinessApplication[] = [
  {
    id: 'app_1',
    organisationName: 'Ghana Water Company Limited',
    sector: 'utility',
    contactName: 'Selorm Adjei',
    email: 's.adjei@gwcl.com.gh',
    phone: '0302665000',
    registrationNumber: 'CS0987654321',
    requestedTier: 'enterprise',
    interests: ['flood', 'infrastructure', 'utility'],
    submittedAtIso: hoursAgo(6),
    status: 'pending',
    flags: [],
  },
  {
    id: 'app_2',
    organisationName: 'Citi FM',
    sector: 'media',
    contactName: 'Nana Owusu',
    email: 'newsroom@citifmonline.com',
    phone: '0302909090',
    registrationNumber: 'CS0445566778',
    requestedTier: 'professional',
    interests: ['disorder', 'corruption', 'accident', 'fire'],
    submittedAtIso: hoursAgo(20),
    status: 'pending',
    flags: [],
  },
  {
    id: 'app_3',
    organisationName: 'Bright Future Consulting',
    sector: 'research',
    contactName: 'K. Mensah',
    email: 'kmensah@gmail.com',
    phone: '0244000111',
    registrationNumber: 'BN12',
    requestedTier: 'starter',
    interests: ['crime', 'disorder', 'health'],
    submittedAtIso: hoursAgo(44),
    status: 'pending',
    // Worth an operator's attention: a free-mail contact and a short
    // registration reference on an account that would receive footage of
    // people. Not disqualifying, but not automatic either.
    flags: ['free_email_domain', 'registration_unverified'],
  },
];

// ─── payout batches ────────────────────────────────────────────────────────

export interface PayoutBatch {
  id: string;
  /** Reporters included in this run. */
  reporterCount: number;
  totalPesewas: number;
  status: 'draft' | 'processing' | 'settled';
  createdAtIso: string;
  settledAtIso: string | null;
}

export const PAYOUT_BATCHES: PayoutBatch[] = [
  {
    id: 'pb_current',
    reporterCount: 128,
    totalPesewas: 412_600,
    status: 'draft',
    createdAtIso: hoursAgo(2),
    settledAtIso: null,
  },
  {
    id: 'pb_prev',
    reporterCount: 96,
    totalPesewas: 288_400,
    status: 'settled',
    createdAtIso: hoursAgo(340),
    settledAtIso: hoursAgo(336),
  },
  {
    id: 'pb_prev2',
    reporterCount: 74,
    totalPesewas: 201_750,
    status: 'settled',
    createdAtIso: hoursAgo(680),
    settledAtIso: hoursAgo(674),
  },
];

// ─── platform health ───────────────────────────────────────────────────────

export const PLATFORM_METRICS = {
  reportsToday: 247,
  reportsRoutedToday: 189,
  awaitingReview: 12,
  activeBusinesses: 5,
  pendingApplications: 3,
  activeReporters: 1_842,
  revenueThisMonthPesewas: 1_845_000,
  payoutsThisMonthPesewas: 553_500,
  /** Fourteen days of submission volume. */
  submissionTrend: [180, 194, 172, 210, 233, 198, 221, 245, 238, 260, 251, 272, 264, 247],
} as const;
