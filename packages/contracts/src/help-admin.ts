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

/** Owner bank-transfer screen (#25). */
export interface BankCreditDto {
  id: string;
  bankReference: string;
  amountPaise: number;
  receivedOn: string;
  evidence: string;
  status: 'REPORTED' | 'MATCHED' | 'REJECTED';
  donationReference: string | null;
  createdAt: string;
}

export interface BankTransfersResponse {
  credits: BankCreditDto[];
  awaiting: Array<{
    publicReference: string;
    amountPaise: number;
    status: string;
    donorUtr: string | null;
    createdAt: string;
  }>;
  exceptions: Array<{
    id: string;
    kind: 'UNMATCHED_CREDIT' | 'AMOUNT_MISMATCH' | 'ALREADY_PAID';
    bankTransferRecordId: string | null;
    createdAt: string;
  }>;
}

export interface RecordBankCreditRequest {
  bankReference: string;
  amountPaise: number;
  receivedOn: string;
  evidence: string;
  donationReference?: string;
}

export interface RecordBankCreditResponse {
  id: string;
  matched: boolean;
  awaitingConfirmation: boolean;
  exception: { id: string; kind: string } | null;
}
