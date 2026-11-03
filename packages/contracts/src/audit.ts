/** Owner audit log (#20): read-only list. Changed field NAMES only — never values. */
export interface AuditEntryDto {
  id: string;
  createdAt: string;
  /** Null for system events and failed sign-ins with an unknown email. */
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  changedFields: string[];
  correlationId: string | null;
}

export interface AuditListResponse {
  items: AuditEntryDto[];
  /** Pass as `cursor` to get the next (older) page; null on the last page. */
  nextCursor: string | null;
}

export interface UpdateAdminPreferencesRequest {
  locale: 'ta' | 'en';
}
