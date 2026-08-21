/**
 * Role permissions for the institution tier.
 *
 * Pure and testable, and — importantly — **advisory only**. This decides what
 * the app shows; it decides nothing about what the API allows. Hiding a button
 * is a courtesy to the user, not a security boundary: anyone can call the
 * endpoint directly. The backend must enforce every one of these rules
 * independently, and API_CONTRACT.md says so.
 */

export type OrgRole = 'owner' | 'admin' | 'analyst' | 'dispatcher' | 'viewer';

export type OrgCapability =
  /** See the dashboard and report inbox. */
  | 'view_reports'
  /** Create, edit and delete saved watch queries. */
  | 'manage_queries'
  /** Set triage status and write internal notes. */
  | 'triage_reports'
  /** Assign an incident to a responding unit. */
  | 'dispatch_units'
  /** Request CSV/PDF exports of report data. */
  | 'export_data'
  /** Invite, remove and re-role members. */
  | 'manage_members'
  /** Change org name, branding and billing. */
  | 'manage_org';

/**
 * Ordered from least to most privileged.
 *
 * `dispatcher` sits above `analyst` deliberately: sending a patrol car to a
 * location is a heavier action than reading a trend chart, even though the
 * dispatcher sees less data overall.
 */
const CAPABILITIES: Record<OrgRole, readonly OrgCapability[]> = {
  viewer: ['view_reports'],
  analyst: ['view_reports', 'export_data'],
  dispatcher: ['view_reports', 'triage_reports', 'dispatch_units'],
  admin: [
    'view_reports',
    'manage_queries',
    'triage_reports',
    'dispatch_units',
    'export_data',
    'manage_members',
  ],
  owner: [
    'view_reports',
    'manage_queries',
    'triage_reports',
    'dispatch_units',
    'export_data',
    'manage_members',
    'manage_org',
  ],
};

export function can(role: OrgRole | null, capability: OrgCapability): boolean {
  if (!role) return false;
  return CAPABILITIES[role].includes(capability);
}

export function capabilitiesFor(role: OrgRole | null): readonly OrgCapability[] {
  return role ? CAPABILITIES[role] : [];
}

/** Whether `actor` may change `target`'s role. */
export function canChangeRole(actor: OrgRole | null, target: OrgRole): boolean {
  if (!can(actor, 'manage_members')) return false;
  // An admin cannot touch an owner. Without this an admin could demote the
  // owner and take the organisation.
  if (target === 'owner' && actor !== 'owner') return false;
  return true;
}

/**
 * Whether `actor` may remove `target`.
 *
 * The last owner can never be removed — an organisation with no owner has no
 * one who can restore access, and recovering it becomes a support ticket.
 */
export function canRemoveMember(
  actor: OrgRole | null,
  target: OrgRole,
  ownerCount: number,
): boolean {
  if (!can(actor, 'manage_members')) return false;
  if (target === 'owner' && actor !== 'owner') return false;
  if (target === 'owner' && ownerCount <= 1) return false;
  return true;
}

/** Roles `actor` is allowed to assign, for the role picker. */
export function assignableRoles(actor: OrgRole | null): readonly OrgRole[] {
  if (!can(actor, 'manage_members')) return [];
  const base: OrgRole[] = ['viewer', 'analyst', 'dispatcher', 'admin'];
  // Only an owner can mint another owner.
  return actor === 'owner' ? [...base, 'owner'] : base;
}
