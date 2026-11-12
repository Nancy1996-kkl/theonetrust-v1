# MASTER UX/UI DESIGN PROMPT
## Premium Charitable Trust & Donation Website

### 1. Project Overview

Design a premium, modern, responsive charitable trust website focused on multiple social welfare activities and online donations.

The website must establish trust, communicate social impact, present ongoing welfare activities, and provide a transparent and convenient donation experience.

The platform must serve two primary audiences:

1. Public visitors and individual donors.
2. Trust administrators responsible for managing donations, activities, projects, receipts, and financial information.

The public website should feel premium, elegant, trustworthy, human-centred, and institutionally credible.

### 2. Brand Identity

**Selected colour palette: Forest & Gold** (owner brief, 5 Nov 2026 — replaces Midnight Navy)

| Colour | HEX | Purpose |
|---|---|---|
| Deep Forest | #0F2A1D | Primary brand, hero and impact bands, headings |
| Trust Green | #3C763A | Focus ring, icons, primary hover |
| Mint | #B7E4C7 | Story cards, lead text on forest |
| Sage | #A8D5BA | Borders and quiet accents on forest |
| Gold | #D4AF37 | Donate button, 1px rules, impact numbers, small icons |
| Gold text | #8A6D1F | Small gold labels on ivory/white only |
| Champagne | #F7E7CE | Stories band |
| Ivory | #FFFDF8 | Main background |
| Body | #4A5A50 | Body text |

Additional semantic colours:
- Success: #287A55
- Warning: #B7791F
- Error: #B42318
- Information: #3568A8

Making it luxurious and engaging:
- **Alternate dark and light sections**: forest hero → ivory sections → forest impact band →
  champagne stories. That rhythm is what makes the site feel premium.
- **Gold only for a few things**: the Donate button, thin 1px divider lines, impact numbers and
  small icons. Never paragraphs. (Gold text fails contrast on light backgrounds; see
  `docs/design/tokens.md` rule 4.)
- **Donate button**: gold background, forest text, a soft gold glow on hover; in the sticky header
  and in every forest section.
- **Emotion**: real, consented beneficiary photos under a forest gradient; counters that animate on
  scroll (verified figures only); story cards on mint.
- **Trust signals**: registration badges such as 80G / 12A in gold outline style, and simple charts
  of where donations go — only once the trust has confirmed the facts (issue #1).

### 3. Selected Design Language

Combine three complementary design approaches:

**A. Classy Minimalism**
- Spacious layouts.
- Restrained decorative elements.
- Strong typography hierarchy.
- Minimal borders and subtle shadows.
- Clear navigation.
- Consistent visual rhythm.

**B. Editorial Design**
- Large, sophisticated serif headings.
- Authentic social welfare photography.
- Storytelling-focused layouts.
- Asymmetrical image and text compositions.
- Large impact statements.
- Magazine-inspired content presentation.

**C. Modern Bento Grid**
- Modular card layouts.
- Different card dimensions.
- Structured social welfare categories.
- Impact statistics.
- Project highlights.
- Responsive grid arrangements.

Avoid excessive glassmorphism, neumorphism, gradients, animations, decorative illustrations, and generic SaaS dashboard aesthetics.

### 4. Typography System

English:
- Headings: Playfair Display (elegant serif; italic for the accent word in the hero).
- Body: Inter.
- Statistics: Inter.

Tamil:
- Noto Sans Tamil.

> **Update Nov 2026 (client review):** Tamil headings now use **Noto Sans Tamil** (semi-bold); see ADR 0003.
>
> **Update 31 Oct 2026 (#46, ADR 0003):** Tamil **headings** use **Noto Serif Tamil** (700); Tamil
> body text and buttons use Noto Sans Tamil. Legacy non-Unicode fonts such as Bamini are not used.

Typography hierarchy:

| Element | Desktop | Mobile |
|---|---:|---:|
| Hero heading | 64px | 38px |
| H1 | 48px | 34px |
| H2 | 38px | 28px |
| H3 | 26px | 22px |
| Body | 17px | 16px |
| Small text | 14px | 13px |

Use appropriate line heights and avoid excessively thin font weights.

### 5. Website Information Architecture

Design the following public website pages:

1. Home
2. About Us
3. Our Mission & Vision
4. Welfare Activities
5. Individual Activity Details
6. Our Projects
7. Project Details
8. Impact & Achievements
9. Donate
10. Donation Confirmation
11. Donation Receipt
12. Transparency & Financial Reports
13. News & Updates
14. Gallery
15. Contact Us
16. Privacy Policy
17. Terms & Conditions
18. Refund & Cancellation Policy

The navigation should remain simple and should not expose every page as a top-level menu item.

Recommended primary navigation:

- Home
- About
- Activities
- Projects
- Impact
- Transparency
- Donate (prominent CTA)

### 6. Homepage UX Design

Create the homepage using the following sections.

#### Section 1: Header
- Trust logo and brand name.
- Primary navigation.
- Tamil / English language switcher.
- Prominent Donate button.
- Sticky header with subtle scroll behaviour.
- Responsive mobile navigation.

#### Section 2: Hero – Editorial Layout

Use a premium two-column editorial composition.

Left:
- Small mission label.
- Strong headline.
- Supporting description.
- Primary CTA: Donate Now.
- Secondary CTA: Explore Our Activities.

Right:
- Authentic social welfare photograph.
- Optional subtle image framing.
- Avoid generic stock illustrations.

Suggested headline:
"Together, We Create a Better Tomorrow."

Supporting text:
"Every contribution creates an opportunity to support communities, empower individuals, and build a better future."

#### Section 3: Trust Introduction

- Short introduction.
- Mission statement.
- Vision statement.
- Read More link.
- Supporting photograph.

#### Section 4: Welfare Activities – Bento Grid

Display the trust's activities in an elegant, responsive Bento Grid.

Suggested categories:
- Education Support
- Medical Assistance
- Food Distribution
- Community Welfare
- Child Welfare
- Emergency Relief

Each card should include:
- Relevant photograph or visual.
- Activity title.
- Short description.
- Explore Activity link.

Do not imply that the trust offers activities that have not been confirmed by the organisation.

#### Section 5: Our Impact

Display key impact metrics:
- People Supported.
- Projects Completed.
- Communities Reached.
- Total Donations Received.

Use large numbers, clear labels, and restrained champagne accents.

Only display verified statistics. Support a configurable empty state when metrics are unavailable.

#### Section 6: Featured Projects

Editorial project showcase with:
- Project image.
- Project title.
- Location.
- Description.
- Project status.
- Funding progress, where applicable.
- View Project CTA.

#### Section 7: Donation Invitation

Create a visually distinctive donation section.

Headline:
"Your Contribution Can Change a Life."

Include:
- Donation purpose.
- Suggested donation amounts.
- Custom donation amount.
- Donate Now CTA.

#### Section 8: Transparency & Accountability

Show:
- Registration information.
- Trust legal information.
- Financial reports.
- Annual reports.
- Donation utilisation reports.
- Available tax exemption information.

Provide downloadable documents when available.

#### Section 9: Stories & Testimonials

- Beneficiary stories.
- Volunteer experiences.
- Donor testimonials.
- Authentic photographs.

Only use testimonials and personal stories with appropriate consent.

#### Section 10: Latest News & Activities

- Recent welfare activities.
- Announcements.
- Project updates.
- Event photographs.

#### Section 11: Final CTA

Headline:
"Be Part of Something Meaningful."

CTA: Support Our Mission.

#### Section 12: Footer

Include:
- Trust identity.
- Short mission statement.
- Quick links.
- Welfare activities.
- Contact information.
- Social media.
- Legal links.
- Registration details, where applicable.

### 7. Donation UX Workflow

Design a simple, trustworthy donation experience.

Step 1: Select Donation Purpose
- General Donation.
- Education Support.
- Medical Assistance.
- Food Distribution.
- Community Welfare.
- Specific Projects.

Step 2: Select Donation Amount
- Suggested amounts: ₹500, ₹1,000, ₹2,000, ₹5,000.
- Custom amount.
- Clear INR currency display.

Step 3: Donor Information
- Full Name.
- Email Address.
- Mobile Number.
- Address, if required for receipt or compliance.
- PAN, only when legally or operationally required.
- Consent checkbox for applicable communication.

Step 4: Payment Method
- Razorpay secure checkout.
- UPI.
- QR-based payment flow, if supported by the payment integration.

Step 5: Payment Processing
- Clear processing state.
- Prevent duplicate submissions.
- Display understandable errors.
- Handle cancelled and failed payments.

Step 6: Donation Confirmation
- Payment status.
- Unique donation reference.
- Donation amount.
- Donor information.
- Receipt generation.

Step 7: Donation Receipt
- Generate a printable PDF.
- Generate a unique public receipt verification link.
- Provide receipt download.
- Allow secure receipt sharing.
- Send receipt through email when configured.

Important:
Never treat a frontend payment redirect as proof of successful payment. Verify payments through trusted server-side Razorpay verification and webhooks.

### 8. Donation Receipt Design

Create a formal, branded receipt.

Include:
- Trust logo and legal name.
- Registration details.
- Unique receipt number.
- Donation reference.
- Donor name.
- Donation date.
- Donation amount.
- Payment method.
- Donation purpose.
- Applicable tax exemption details, only when valid.
- Authorised signature or digital authorisation, where applicable.
- Receipt verification QR code.

The public verification page should disclose only necessary receipt information and protect donor privacy.

### 9. Responsive Design Requirements

Design for:

- Desktop: 1440px.
- Laptop: 1280px.
- Tablet: 768px.
- Mobile: 375px and 430px.

Requirements:
- Mobile-first responsive layouts.
- Responsive Bento Grid.
- Accessible navigation.
- Touch-friendly buttons.
- Readable Tamil and English typography.
- No horizontal overflow.
- Optimised photographs.
- Consistent spacing.

### 10. UX Interaction Requirements

Design appropriate states for:
- Default.
- Hover.
- Focus.
- Active.
- Disabled.
- Loading.
- Success.
- Error.
- Empty.
- No results.

Include:
- Form validation.
- Accessible modal dialogs.
- Confirmation messages.
- Donation progress states.
- Responsive navigation interactions.
- Clear error recovery.

Use subtle transitions, approximately 150–250ms for ordinary interface interactions. Respect reduced-motion preferences.

### 11. Accessibility

Follow WCAG 2.2 AA principles.

Requirements:
- Appropriate text contrast.
- Keyboard navigation.
- Visible focus indicators.
- Semantic HTML.
- Accessible form labels.
- Screen reader-friendly status messages.
- Alternative text for meaningful images.
- Accessible donation workflows.
- Do not communicate information using colour alone.

### 12. Admin Dashboard UX Direction

The public-facing website and administration dashboard should have different visual priorities.

Public website:
Premium, editorial, emotional and elegant.

Admin dashboard:
Functional, information-dense, consistent and easy to operate.

Admin modules:
- Dashboard Overview.
- Donation Management.
- Donor Management.
- Project Management.
- Welfare Activity Management.
- Receipt Management.
- Financial Reports.
- Content Management.
- Gallery Management.
- User and Role Management.
- Website Settings.

Dashboard widgets:
- Total Donations.
- Successful Payments.
- Pending Payments.
- Total Donors.
- Active Projects.
- Recent Transactions.
- Donation Trends.

Provide role-based access control and audit trails for important administrative actions.

### 13. UX Deliverables

Before starting frontend development, prepare:

1. Brand visual identity.
2. Design tokens.
3. Website sitemap.
4. User personas.
5. User journeys.
6. Donation user flow.
7. Low-fidelity wireframes.
8. High-fidelity desktop designs.
9. High-fidelity mobile designs.
10. Interactive prototype.
11. Reusable component library.
12. Design system documentation.
13. Admin dashboard wireframes.
14. Developer handoff specifications.

### 14. Technical Design Handoff

Prepare the design for implementation using:

- React.
- Reusable components.
- Semantic HTML.
- CSS variables.
- Responsive CSS Grid and Flexbox.
- Accessible interaction patterns.
- Reusable form controls.
- Design-token-based theming.

Use a central theme configuration so that colours, typography, spacing, borders, and component styles can be maintained consistently.

### 15. Final Design Quality Requirements

The final product must:

- Look like a professionally designed charitable foundation website.
- Avoid generic NGO template aesthetics.
- Avoid looking like an e-commerce storefront.
- Avoid excessive decorative elements.
- Prioritise real social impact and trust.
- Make donating straightforward.
- Communicate transparency.
- Support Tamil and English.
- Be accessible and mobile-friendly.
- Be scalable for future welfare activities and projects.

### 16. Execution Instructions

Work in the following order:

Phase 1: Brand identity and design tokens.

Phase 2: Sitemap and user journeys.

Phase 3: Homepage wireframes.

Phase 4: Donation workflow wireframes.

Phase 5: High-fidelity desktop and mobile UI.

Phase 6: Interactive prototype.

Phase 7: Admin dashboard UX.

Phase 8: Design system and React developer handoff.

Do not start by generating random UI screens. Establish the brand identity, information architecture, and user flows first.

Use realistic sample content only for demonstration. Clearly identify placeholder trust details, statistics, projects, and photographs.

The goal is to create a distinctive, premium, transparent and donor-friendly charitable trust digital experience.