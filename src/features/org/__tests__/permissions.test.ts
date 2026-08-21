import {
  assignableRoles,
  can,
  canChangeRole,
  canRemoveMember,
  capabilitiesFor,
  type OrgRole,
} from '../permissions';

const ALL_ROLES: OrgRole[] = ['viewer', 'analyst', 'dispatcher', 'admin', 'owner'];

describe('capability checks', () => {
  it('grants nothing to a caller with no role', () => {
    // A signed-in user who is not an org member must see none of this surface.
    expect(can(null, 'view_reports')).toBe(false);
    expect(capabilitiesFor(null)).toEqual([]);
  });

  it('lets every role read reports', () => {
    ALL_ROLES.forEach((role) => expect(can(role, 'view_reports')).toBe(true));
  });

  it('keeps an analyst away from dispatch', () => {
    // Someone reading trend charts should not be able to send a patrol car.
    expect(can('analyst', 'view_reports')).toBe(true);
    expect(can('analyst', 'dispatch_units')).toBe(false);
    expect(can('analyst', 'triage_reports')).toBe(false);
  });

  it('keeps a dispatcher away from bulk data export', () => {
    // Dispatch is an operational role, not an analytical one; exporting the
    // full report corpus is a different kind of access.
    expect(can('dispatcher', 'dispatch_units')).toBe(true);
    expect(can('dispatcher', 'export_data')).toBe(false);
  });

  it('gives a viewer read access and nothing else', () => {
    expect(capabilitiesFor('viewer')).toEqual(['view_reports']);
  });

  it('reserves organisation settings for the owner alone', () => {
    expect(can('owner', 'manage_org')).toBe(true);
    expect(can('admin', 'manage_org')).toBe(false);
  });

  it('gives the owner every capability an admin has', () => {
    capabilitiesFor('admin').forEach((capability) => {
      expect(can('owner', capability)).toBe(true);
    });
  });
});

describe('changing roles', () => {
  it('is refused to anyone without member management', () => {
    expect(canChangeRole('analyst', 'viewer')).toBe(false);
    expect(canChangeRole('dispatcher', 'viewer')).toBe(false);
    expect(canChangeRole(null, 'viewer')).toBe(false);
  });

  it('stops an admin demoting the owner', () => {
    // Otherwise an admin could demote the owner and take the organisation.
    expect(canChangeRole('admin', 'owner')).toBe(false);
    expect(canChangeRole('owner', 'owner')).toBe(true);
  });

  it('lets an admin manage everyone below owner', () => {
    (['viewer', 'analyst', 'dispatcher', 'admin'] as OrgRole[]).forEach((target) => {
      expect(canChangeRole('admin', target)).toBe(true);
    });
  });
});

describe('removing members', () => {
  it('never removes the last owner', () => {
    // An organisation with no owner has nobody who can restore access.
    expect(canRemoveMember('owner', 'owner', 1)).toBe(false);
    expect(canRemoveMember('owner', 'owner', 2)).toBe(true);
  });

  it('stops an admin removing an owner regardless of how many there are', () => {
    expect(canRemoveMember('admin', 'owner', 5)).toBe(false);
  });

  it('is refused to roles without member management', () => {
    expect(canRemoveMember('analyst', 'viewer', 3)).toBe(false);
  });
});

describe('assignable roles', () => {
  it('is empty for anyone who cannot manage members', () => {
    expect(assignableRoles('analyst')).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });

  it('lets only an owner mint another owner', () => {
    expect(assignableRoles('admin')).not.toContain('owner');
    expect(assignableRoles('owner')).toContain('owner');
  });
});

describe('the permission model as a whole', () => {
  it('is monotonic — owner is a superset of admin is a superset of viewer', () => {
    const owner = new Set(capabilitiesFor('owner'));
    const admin = new Set(capabilitiesFor('admin'));
    capabilitiesFor('viewer').forEach((c) => expect(admin.has(c)).toBe(true));
    [...admin].forEach((c) => expect(owner.has(c)).toBe(true));
  });

  it('grants no capability to every role by accident', () => {
    // A capability every role holds is not a permission, it is a default —
    // and should be questioned rather than silently granted.
    const universal = capabilitiesFor('viewer').filter((c) =>
      ALL_ROLES.every((role) => can(role, c)),
    );
    expect(universal).toEqual(['view_reports']);
  });
});
