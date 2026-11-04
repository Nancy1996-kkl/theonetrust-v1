import type { HelpRequestStatus } from './statuses.ts';

/** Owner case inbox (#22). List rows mask the phone; only the detail view shows it in full. */
export interface HelpCaseListItem {
  id: string;
  reference: string;
  createdAt: string;
  kind: 'FULL' | 'CALLBACK';
  status: HelpRequestStatus;
  helpTypes: string[];
  callLanguage: 'ta' | 'en';
  bestTime: string | null;
  phoneMasked: string;
  assigneeEmail: string | null;
  remindOn: string | null;
}

export interface HelpCaseList {
  items: HelpCaseListItem[];
  nextCursor: string | null;
}

export interface HelpCaseDetail extends HelpCaseListItem {
  forWhom: string | null;
  description: string | null;
  phone: string;
  personNameOrVillage: string | null;
  pageLanguage: 'ta' | 'en';
  notes: Array<{ id: string; body: string; authorEmail: string; createdAt: string }>;
  history: Array<{
    action: string;
    actorEmail: string | null;
    changedFields: string[];
    reason: string | null;
    createdAt: string;
  }>;
}

export interface HelpCaseUpdate {
  status?: HelpRequestStatus;
  assigneeId?: string | null;
  remindOn?: string | null;
  reason?: string;
}

export interface HelpCaseFilters {
  status?: HelpRequestStatus;
  helpType?: string;
  language?: 'ta' | 'en';
  kind?: 'FULL' | 'CALLBACK';
}
