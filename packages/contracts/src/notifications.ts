/** Email delivery status for the owner dashboard (#30). Never contains an address or a body. */
export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export type NotificationStatusDto = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_TEMPLATES = [
  'owner_donation_paid',
  'donor_donation_paid',
  'owner_help_request_new',
  'donor_subscription_started',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export interface NotificationDto {
  id: string;
  template: NotificationTemplate | 'other';
  audience: 'owner' | 'donor';
  status: NotificationStatusDto;
  /** Donation reference (TOT-D-…) or help request reference (HLP-…). */
  reference: string | null;
  attempts: number;
  /** Short code only, e.g. `http_503`, `network`, `no_owner_email`. */
  lastError: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
  sentAt: string | null;
}

export interface NotificationListResponse {
  items: NotificationDto[];
  counts: Record<NotificationStatusDto, number>;
  /** False when EMAIL_PROVIDER=none: emails stay queued and nothing is sent. */
  sendingEnabled: boolean;
}
