import { useAuthStore } from '@/stores/authStore';
import { can, capabilitiesFor, type OrgCapability, type OrgRole } from './permissions';

interface UseRoleResult {
  role: OrgRole | null;
  isOrgMember: boolean;
  can: (capability: OrgCapability) => boolean;
  capabilities: readonly OrgCapability[];
}

/**
 * The signed-in user's role within their organisation.
 *
 * Returns null for anyone who is not an org member, which is the common case —
 * most users of this app are members of the public, not institutions.
 */
export function useRole(): UseRoleResult {
  const profile = useAuthStore((s) => s.profile);
  const role = (profile?.role as OrgRole | null) ?? null;

  return {
    role,
    isOrgMember: Boolean(profile?.orgId),
    can: (capability) => can(role, capability),
    capabilities: capabilitiesFor(role),
  };
}
