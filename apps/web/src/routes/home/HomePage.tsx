import { TRUST_FACTS, type TrustFacts } from '../../config/trust-facts.ts';
import { LANDING_CONTENT, draftsVisible, type LandingContent } from '../../content/landing.ts';
import {
  AboutSection,
  DonationHelpsSection,
  HeroSection,
  HowItWorksSection,
  WaysWeHelpSection,
} from './LandingSections.tsx';

interface HomePageProps {
  /** Injected in tests; the live page reads the content file and the confirmed facts. */
  content?: LandingContent;
  facts?: TrustFacts;
  showDrafts?: boolean;
}

/**
 * The single public page (ADR 0005). #12 adds hero → how it works; #13 adds impact,
 * transparency, FAQ, contact and the final call to action below these.
 */
export function HomePage({
  content = LANDING_CONTENT,
  facts = TRUST_FACTS,
  showDrafts = draftsVisible(),
}: HomePageProps) {
  const props = { content, facts, showDrafts };
  return (
    <>
      <title>Theonetrust.in</title>
      <HeroSection {...props} />
      <AboutSection {...props} />
      <WaysWeHelpSection {...props} />
      <DonationHelpsSection {...props} />
      <HowItWorksSection {...props} />
    </>
  );
}
